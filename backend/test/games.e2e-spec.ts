import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
  ErrorCode,
  type ActiveGamePhase,
  type GameSnapshotDto,
  type RoomSnapshotDto,
  type WsAck,
} from '@pmp/shared';
import { randomUUID } from 'node:crypto';
import { GameOrchestrator } from '../src/games/game-orchestrator.service.js';
import { bearer, createGuest, http, type Guest } from './utils/api.js';
import { connect, emitAck, nextEvent, okData, record, type ClientSocket } from './utils/sockets.js';
import { createTestApp, type TestApp } from './utils/test-app.js';

interface Member {
  guest: Guest;
  socket: ClientSocket;
  playerId: string;
  /** Every event this client received, in order. */
  events: { event: string; payload: unknown }[];
}

interface Lobby {
  code: string;
  roomId: string;
  members: Member[];
  host: Member;
}

describe('Game engine (e2e)', () => {
  let t: TestApp;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterEach(() => {
    sockets.splice(0).forEach((s) => s.close());
  });
  afterAll(async () => {
    await t.app.close();
  });

  const api = () => http(t.app);
  const orchestrator = () => t.app.get(GameOrchestrator);

  /** A lobby of `size` connected players; each gets a READY playlist of `songs` songs. */
  async function lobby(
    size: number,
    { songs = 8, roundCount = 10, withPlaylists = size } = {},
  ): Promise<Lobby> {
    const members: Member[] = [];
    let code = '';
    for (let i = 1; i <= size; i += 1) {
      const guest = await createGuest(t.app, `Player ${i}`);
      const res =
        i === 1
          ? await api()
              .post('/api/v1/rooms')
              .set(...bearer(guest))
              .send({ settings: { roundCount } })
              .expect(201)
          : await api()
              .post(`/api/v1/rooms/${code}/join`)
              .set(...bearer(guest))
              .send({})
              .expect(200);
      const snapshot = res.body as RoomSnapshotDto;
      code = snapshot.code;
      const socket = await connect(t.app, guest.accessToken);
      sockets.push(socket);
      const events: Member['events'] = [];
      socket.onAny((event: string, payload: unknown) => events.push({ event, payload }));
      okData(await emitAck(socket, 'room:subscribe', { roomCode: code }));
      members.push({ guest, socket, playerId: snapshot.viewerPlayerId, events });
    }
    const room = await t.prisma.room.findUniqueOrThrow({ where: { code }, select: { id: true } });
    for (const [i, m] of members.slice(0, withPlaylists).entries()) {
      await seedPlaylist(room.id, m.playerId, `p${i}`, songs);
    }
    return { code, roomId: room.id, members, host: members[0] as Member };
  }

  async function seedPlaylist(roomId: string, playerId: string, prefix: string, songs: number) {
    await t.prisma.playlist.create({
      data: {
        roomId,
        roomPlayerId: playerId,
        youtubePlaylistId: `PL${prefix}`,
        sourceUrl: `https://www.youtube.com/playlist?list=PL${prefix}`,
        title: `Secret title ${prefix}`,
        status: 'READY',
        playableCount: songs,
        submissionId: randomUUID(),
        readyAt: new Date(),
        tracks: {
          create: Array.from({ length: songs }, (_, i) => ({
            roomId,
            youtubeVideoId: `${prefix}vid${i}`,
            title: `Song ${prefix}-${i}`,
            durationSec: 180,
            position: i,
            status: 'PLAYABLE' as const,
          })),
        },
      },
    });
  }

  const start = (m: Member, clientRequestId = randomUUID()) =>
    emitAck(m.socket, 'game:start', { clientRequestId });

  async function startGame(l: Lobby): Promise<GameSnapshotDto> {
    const snapshot = okData(await start(l.host));
    if (!snapshot.game) throw new Error('expected a game in the snapshot');
    return snapshot.game;
  }

  const advance = (m: Member, expectedPhase: ActiveGamePhase, roundNumber: number) =>
    emitAck(m.socket, 'game:advance', { expectedPhase, roundNumber });

  async function game(roomId: string) {
    return t.prisma.game.findFirstOrThrow({
      where: { roomId },
      orderBy: { gameNumber: 'desc' },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
          include: { gamePlaylist: { include: { owner: true } } },
        },
      },
    });
  }

  /** The room player who owns the round's playlist, read straight from the database. */
  async function ownerOf(roomId: string, roundNumber: number): Promise<string> {
    const g = await game(roomId);
    const round = g.rounds.find((r) => r.roundNumber === roundNumber);
    if (!round) throw new Error(`no round ${roundNumber}`);
    return round.gamePlaylist.owner.roomPlayerId;
  }

  /** Advances through the orchestrator (no socket rate limit) from the current phase. */
  async function step(l: Lobby): Promise<void> {
    const g = await game(l.roomId);
    const result = await orchestrator().advance(l.roomId, l.host.playerId, g.phase, g.currentRound);
    expect(result.applied).toBe(true);
  }

  const errorCode = (ack: WsAck<unknown>) => (ack.ok ? null : ack.error.code);

  const vote = (
    m: Member,
    roundNumber: number,
    suspect: Member | string,
    clientRequestId = randomUUID(),
  ) =>
    emitAck(m.socket, 'vote:submit', {
      roundNumber,
      suspectPlayerId: typeof suspect === 'string' ? suspect : suspect.playerId,
      clientRequestId,
    });

  describe('starting', () => {
    it('requires the host, three players and ready playlists', async () => {
      const two = await lobby(2);
      expect(errorCode(await start(two.host))).toBe(ErrorCode.NOT_ENOUGH_PLAYERS);

      const unready = await lobby(3, { withPlaylists: 2 });
      expect(errorCode(await start(unready.host))).toBe(ErrorCode.PLAYLISTS_NOT_READY);

      const ready = await lobby(3);
      expect(errorCode(await start(ready.members[1] as Member))).toBe(ErrorCode.NOT_ROOM_HOST);
      expect(await t.prisma.game.count()).toBe(0);
    });

    it('creates the game, announces it and tells only the owner that the song is theirs', async () => {
      const l = await lobby(3);
      const roundStarted = l.members.map((m) => nextEvent(m.socket, 'game:round-started'));
      const contexts = l.members.map((m) => nextEvent(m.socket, 'round:viewer-context'));

      const snapshot = await startGame(l);
      expect(snapshot).toMatchObject({
        gameNumber: 1,
        phase: 'PLAYING',
        roundNumber: 1,
        totalRounds: 10,
        stateVersion: 1,
        playlistLabels: ['Playlist A', 'Playlist B', 'Playlist C'],
        lastReveal: null,
      });
      const [first] = await roundStarted[0]!;
      expect(first.round).toEqual(snapshot.currentRound);

      const owner = await ownerOf(l.roomId, 1);
      const received = await Promise.all(contexts);
      l.members.forEach((m, i) => {
        expect(received[i]![0].viewer.isYourPlaylist).toBe(m.playerId === owner);
      });
      const room = await t.prisma.room.findUniqueOrThrow({ where: { id: l.roomId } });
      expect(room.status).toBe('IN_GAME');
    });

    it('runs a retried start once and lets only one of many concurrent starts win', async () => {
      const l = await lobby(3);
      const id = randomUUID();
      const [a, b] = await Promise.all([start(l.host, id), start(l.host, id)]);
      expect(a.ok && b.ok).toBe(true);
      expect(await t.prisma.game.count()).toBe(1);

      const others = await Promise.all(Array.from({ length: 5 }, () => start(l.host)));
      expect(others.map(errorCode)).toEqual(Array(5).fill(ErrorCode.GAME_IN_PROGRESS));
      expect(await t.prisma.game.count()).toBe(1);
    });

    it('rejects joining while a game runs', async () => {
      const l = await lobby(3);
      await startGame(l);
      const late = await createGuest(t.app, 'Late');
      const res = await api()
        .post(`/api/v1/rooms/${l.code}/join`)
        .set(...bearer(late))
        .send({})
        .expect(409);
      expect(res.body.error.code).toBe(ErrorCode.GAME_IN_PROGRESS);
    });
  });

  describe('advancing', () => {
    it('applies each leader action exactly once, even when sent concurrently', async () => {
      const l = await lobby(3);
      await startGame(l);
      const acks = await Promise.all([1, 2, 3].map(() => advance(l.host, 'PLAYING', 1)));
      expect(acks.filter((a) => okData(a).applied)).toHaveLength(1);

      const g = await game(l.roomId);
      expect(g).toMatchObject({ phase: 'DISCUSSION', stateVersion: 2 });
      expect(okData(await advance(l.host, 'PLAYING', 1)).applied).toBe(false);
      expect(errorCode(await advance(l.members[1] as Member, 'DISCUSSION', 1))).toBe(
        ErrorCode.NOT_ROOM_HOST,
      );
    });

    it('plays a whole game, reveals each owner and returns the room to the lobby', async () => {
      const l = await lobby(3);
      await startGame(l);
      const phases: string[] = [];
      for (let round = 1; round <= 10; round += 1) {
        for (const expected of ['DISCUSSION', 'VOTING', 'REVEAL']) {
          await step(l);
          phases.push(expected);
        }
        const snapshot = okData(await emitAck(l.members[2]!.socket, 'sync:request', {})).game!;
        expect(snapshot.lastReveal).toMatchObject({
          roundNumber: round,
          ownerPlayerId: await ownerOf(l.roomId, round),
        });
        await step(l); // next song, or SCOREBOARD after the last round
      }

      let g = await game(l.roomId);
      expect(g.phase).toBe('SCOREBOARD');
      expect(g.endReason).toBe('COMPLETED');
      const playlists = g.rounds.map((r) => r.gamePlaylistId);
      playlists.slice(1).forEach((p, i) => expect(p).not.toBe(playlists[i]));
      const shares = [...new Set(playlists)].map((p) => playlists.filter((x) => x === p).length);
      expect(shares.sort((a, b) => a - b)).toEqual([3, 3, 4]);
      expect(new Set(g.rounds.map((r) => r.youtubeVideoId)).size).toBe(10);

      const finished = nextEvent(l.members[1]!.socket, 'game:finished');
      await step(l);
      expect((await finished)[0].endReason).toBe('COMPLETED');
      g = await game(l.roomId);
      expect(g.phase).toBe('FINISHED');
      const room = await t.prisma.room.findUniqueOrThrow({ where: { id: l.roomId } });
      expect(room.status).toBe('LOBBY');

      const second = await startGame(l);
      expect(second).toMatchObject({ gameNumber: 2, phase: 'PLAYING', roundNumber: 1 });
    });

    it('shortens the game so every playlist keeps its fair share', async () => {
      const l = await lobby(3, { songs: 5, roundCount: 20 });
      expect((await startGame(l)).totalRounds).toBe(15);
    });
  });

  describe('playback reports', () => {
    async function current(roomId: string) {
      const g = await game(roomId);
      const round = g.rounds.find((r) => r.roundNumber === g.currentRound)!;
      return { g, round };
    }

    it('moves to discussion when the song ends, ignoring reports about other songs', async () => {
      const l = await lobby(3);
      await startGame(l);
      const { round } = await current(l.roomId);
      const report = (videoId: string) =>
        emitAck(l.host.socket, 'playback:report', { roundNumber: 1, videoId, state: 'ENDED' });

      expect(okData(await report('someoneElse')).applied).toBe(false);
      expect(okData(await report(round.youtubeVideoId)).applied).toBe(true);
      expect((await game(l.roomId)).phase).toBe('DISCUSSION');
      expect(
        errorCode(
          await emitAck(l.members[1]!.socket, 'playback:report', {
            roundNumber: 1,
            videoId: round.youtubeVideoId,
            state: 'ENDED',
          }),
        ),
      ).toBe(ErrorCode.NOT_ROOM_HOST);
    });

    it('replaces an unplayable song from the same playlist and marks it unplayable', async () => {
      const l = await lobby(3);
      await startGame(l);
      const before = await current(l.roomId);
      const replaced = nextEvent(l.members[1]!.socket, 'game:track-replaced');

      const ack = await emitAck(l.host.socket, 'playback:report', {
        roundNumber: 1,
        videoId: before.round.youtubeVideoId,
        state: 'ERROR',
        ytErrorCode: 150,
      });
      expect(okData(ack).applied).toBe(true);

      const after = await current(l.roomId);
      expect(after.round.youtubeVideoId).not.toBe(before.round.youtubeVideoId);
      expect(after.round.gamePlaylistId).toBe(before.round.gamePlaylistId);
      expect((await replaced)[0].round.track.videoId).toBe(after.round.youtubeVideoId);
      const failed = await t.prisma.playlistTrack.findFirstOrThrow({
        where: { youtubeVideoId: before.round.youtubeVideoId },
      });
      expect(failed.status).toBe('UNPLAYABLE');

      // A second report about the song that was already replaced does nothing.
      const stale = await emitAck(l.host.socket, 'playback:report', {
        roundNumber: 1,
        videoId: before.round.youtubeVideoId,
        state: 'ERROR',
        ytErrorCode: 150,
      });
      expect(okData(stale).applied).toBe(false);
    });

    it('drops the round when its playlist has no songs left and moves on', async () => {
      const l = await lobby(3, { songs: 5, roundCount: 6 });
      await startGame(l);
      const { g: start } = await current(l.roomId);
      const changed = nextEvent(l.members[1]!.socket, 'game:phase-changed');

      // Report errors until the round's playlist runs dry and the round is dropped.
      for (let i = 0; i < 10; i += 1) {
        const { g, round } = await current(l.roomId);
        if (g.totalRounds < start.totalRounds) break;
        await orchestrator().playbackReport(l.roomId, l.host.playerId, {
          roundNumber: 1,
          videoId: round.youtubeVideoId,
          state: 'ERROR',
          ytErrorCode: 100,
        });
      }

      const { g, round } = await current(l.roomId);
      expect(g.totalRounds).toBe(start.totalRounds - 1);
      expect(g).toMatchObject({ phase: 'PLAYING', currentRound: 1 });
      expect(round.status).toBe('ACTIVE');
      expect(g.rounds.map((r) => r.roundNumber)).toEqual(
        Array.from({ length: g.totalRounds }, (_, i) => i + 1),
      );
      expect((await changed)[0]).toMatchObject({ totalRounds: start.totalRounds - 1 });
    });
  });

  describe('players leaving', () => {
    const leave = (m: Member, code: string) =>
      api()
        .post(`/api/v1/rooms/${code}/leave`)
        .set(...bearer(m.guest))
        .expect(204);

    it("moves a leaver's upcoming rounds to other playlists", async () => {
      const l = await lobby(4);
      await startGame(l);
      const leaver = l.members[3] as Member;
      const leaverPlaylist = (await game(l.roomId)).rounds.find(
        (r) => r.gamePlaylist.owner.roomPlayerId === leaver.playerId,
      )!.gamePlaylistId;

      await leave(leaver, l.code);

      const g = await game(l.roomId);
      const upcoming = g.rounds.filter((r) => r.roundNumber > g.currentRound);
      expect(upcoming.some((r) => r.gamePlaylistId === leaverPlaylist)).toBe(false);
      expect(g.totalRounds).toBe(10);
      expect(g.rounds).toHaveLength(10);
      expect(new Set(g.rounds.map((r) => r.youtubeVideoId)).size).toBe(10);
      expect(g.phase).toBe('PLAYING');
    });

    it('ends the game when fewer than three players remain', async () => {
      const l = await lobby(3);
      await startGame(l);
      const ended = nextEvent(l.host.socket, 'game:phase-changed', (e) => e.phase === 'SCOREBOARD');

      await leave(l.members[2] as Member, l.code);

      expect((await ended)[0]).toMatchObject({
        phase: 'SCOREBOARD',
        endReason: 'NOT_ENOUGH_PLAYERS',
      });
      const g = await game(l.roomId);
      expect(g).toMatchObject({ phase: 'SCOREBOARD', endReason: 'NOT_ENOUGH_PLAYERS' });
      await step(l);
      expect((await t.prisma.room.findUniqueOrThrow({ where: { id: l.roomId } })).status).toBe(
        'LOBBY',
      );
    });

    it('hands leadership to the new host when the host leaves', async () => {
      const l = await lobby(4);
      await startGame(l);
      const newHost = nextEvent(l.members[1]!.socket, 'room:host-changed');

      await leave(l.host, l.code);

      const [{ hostPlayerId }] = await newHost;
      const leader = l.members.find((m) => m.playerId === hostPlayerId) as Member;
      expect(okData(await advance(leader, 'PLAYING', 1)).applied).toBe(true);
      const other = l.members.find((m) => m !== leader && m !== l.host) as Member;
      expect(errorCode(await advance(other, 'DISCUSSION', 1))).toBe(ErrorCode.NOT_ROOM_HOST);
    });
  });

  it('resyncs a reconnecting player to the live game', async () => {
    const l = await lobby(3);
    await startGame(l);
    await step(l);
    const viewer = l.members[2] as Member;
    viewer.socket.close();
    const socket = await connect(t.app, viewer.guest.accessToken);
    sockets.push(socket);

    const snapshot = okData(await emitAck(socket, 'room:subscribe', { roomCode: l.code }));
    const g = await game(l.roomId);
    expect(snapshot.game).toMatchObject({
      phase: 'DISCUSSION',
      roundNumber: 1,
      stateVersion: g.stateVersion,
      currentRound: { roundNumber: 1, track: { videoId: g.rounds[0]!.youtubeVideoId } },
      viewer: { isYourPlaylist: (await ownerOf(l.roomId, 1)) === viewer.playerId },
    });
  });

  it('never tells anyone who owns a song before the reveal (5 players)', async () => {
    const l = await lobby(5);
    await startGame(l);
    const playerIds = l.members.map((m) => m.playerId);
    const viewerContexts = l.members.map((m) => record(m.socket, 'round:viewer-context'));

    for (let round = 1; round <= 3; round += 1) {
      const owner = await ownerOf(l.roomId, round);
      const myVotes = new Map<string, string>();
      for (const phase of ['PLAYING', 'DISCUSSION', 'VOTING'] as const) {
        if (phase === 'VOTING') {
          // Two votes are cast; voting stays open, so individual votes must stay private.
          for (const [i, m] of l.members.slice(0, 2).entries()) {
            const suspect = l.members[i + 1] as Member;
            okData(await vote(m, round, suspect));
            myVotes.set(m.playerId, suspect.playerId);
          }
        }
        const shared = new Set<string>();
        for (const m of l.members) {
          // Public game and vote events name no player before the reveal.
          const publicEvents = JSON.stringify(
            m.events.filter((e) => /^(game|vote):/.test(e.event)),
          );
          playerIds.forEach((id) => expect(publicEvents).not.toContain(id));

          const snapshot = okData(await emitAck(m.socket, 'sync:request', {})).game!;
          expect(JSON.stringify(snapshot)).not.toContain('Secret title');
          const { viewer, serverTime: _time, ...rest } = snapshot;
          shared.add(JSON.stringify(rest));
          expect(viewer.isYourPlaylist).toBe(m.playerId === owner);
          expect(viewer.candidates.map((c) => c.playerId).sort()).toEqual(
            playerIds.filter((id) => id !== m.playerId).sort(),
          );
          expect(viewer.myVote).toBe(myVotes.get(m.playerId) ?? null);
        }
        // Apart from the viewer's own context, owner and non-owners see exactly the same.
        expect(shared.size).toBe(1);
        okData(await advance(l.host, phase, round));
      }
      // VOTING → REVEAL happened on the last advance; the reveal names the owner.
      const sync = okData(await emitAck(l.members[4]!.socket, 'sync:request', {})).game!;
      expect(sync.lastReveal).toMatchObject({ roundNumber: round, ownerPlayerId: owner });
      okData(await advance(l.host, 'REVEAL', round));
      l.members.forEach((m) => (m.events.length = 0));
    }

    // Broadcasts travel through the Redis adapter and can trail the command's ack.
    const contextsFor = (n: number) =>
      viewerContexts.flat().filter(([e]) => e.roundNumber === n).length;
    for (let waited = 0; contextsFor(4) < 5 && waited < 2_000; waited += 20) {
      await new Promise((r) => setTimeout(r, 20));
    }

    // "This one is yours" reached only the owner's private channel, once per round.
    const yours: number[] = [];
    for (const [i, m] of l.members.entries()) {
      for (const [event] of viewerContexts[i]!) {
        if (!event.viewer.isYourPlaylist) continue;
        expect(await ownerOf(l.roomId, event.roundNumber)).toBe(m.playerId);
        yours.push(event.roundNumber);
      }
    }
    expect(yours.sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  describe('voting and scoring', () => {
    const leave = (m: Member, code: string) =>
      api()
        .post(`/api/v1/rooms/${code}/leave`)
        .set(...bearer(m.guest))
        .expect(204);

    /** Starts a game and moves it to VOTING in round 1. Returns the round's owner. */
    async function toVoting(l: Lobby): Promise<{ owner: Member; others: Member[] }> {
      await startGame(l);
      await step(l);
      await step(l);
      return roles(l, 1);
    }

    async function roles(l: Lobby, round: number): Promise<{ owner: Member; others: Member[] }> {
      const ownerId = await ownerOf(l.roomId, round);
      const owner = l.members.find((m) => m.playerId === ownerId) as Member;
      return { owner, others: l.members.filter((m) => m !== owner) };
    }

    const sync = async (m: Member) => okData(await emitAck(m.socket, 'sync:request', {})).game!;

    it('validates every vote on the server and keeps it final', async () => {
      const l = await lobby(4);
      await startGame(l);
      expect(errorCode(await vote(l.members[1]!, 1, l.members[2]!))).toBe(ErrorCode.VOTING_CLOSED);
      await step(l);
      const opened = nextEvent(l.members[1]!.socket, 'vote:progress');
      await step(l);
      // Opening the vote announces how many players are expected to vote.
      expect((await opened)[0]).toMatchObject({ roundNumber: 1, votesIn: 0, expected: 4 });
      const { owner, others } = await roles(l, 1);
      const [a, b] = others as [Member, Member];

      expect(errorCode(await vote(a, 1, a))).toBe(ErrorCode.INVALID_SUSPECT);
      expect(errorCode(await vote(a, 1, randomUUID()))).toBe(ErrorCode.INVALID_SUSPECT);
      expect(errorCode(await vote(a, 2, owner))).toBe(ErrorCode.VOTING_CLOSED);

      const progress = nextEvent(b.socket, 'vote:progress', (e) => e.votesIn === 1);
      const id = randomUUID();
      expect(okData(await vote(a, 1, owner, id))).toEqual({
        roundNumber: 1,
        suspectPlayerId: owner.playerId,
      });
      expect((await progress)[0]).toMatchObject({ roundNumber: 1, votesIn: 1, expected: 4 });

      // A retry returns the original result; a different vote is refused.
      expect(okData(await vote(a, 1, owner, id)).suspectPlayerId).toBe(owner.playerId);
      expect(errorCode(await vote(a, 1, b))).toBe(ErrorCode.ALREADY_VOTED);

      const votes = await t.prisma.vote.findMany();
      expect(votes).toHaveLength(1);
      expect(votes[0]!.isCorrect).toBeNull();
      expect((await sync(a)).viewer.myVote).toBe(owner.playerId);
      expect(await sync(b)).toMatchObject({
        viewer: { myVote: null },
        voteProgress: { votesIn: 1, expected: 4 },
      });
    });

    it('accepts exactly one of many concurrent votes from the same player', async () => {
      const l = await lobby(3);
      const { owner, others } = await toVoting(l);
      const voter = others[0] as Member;
      const acks = await Promise.all(
        [owner, others[1]!, owner, others[1]!, owner].map((s) => vote(voter, 1, s)),
      );
      expect(acks.filter((a) => a.ok)).toHaveLength(1);
      expect(acks.filter((a) => errorCode(a) === ErrorCode.ALREADY_VOTED)).toHaveLength(4);
      expect(await t.prisma.vote.count()).toBe(1);
    });

    it('closes voting once everyone voted, scores exactly once and reveals every vote', async () => {
      const l = await lobby(4);
      const { owner, others } = await toVoting(l);
      const [a, b, c] = others as [Member, Member, Member];
      const revealed = nextEvent(b.socket, 'game:round-revealed');

      // Exactly one correct guess (a); the owner votes too.
      const acks = await Promise.all([
        vote(a, 1, owner),
        vote(b, 1, a),
        vote(c, 1, a),
        vote(owner, 1, b),
      ]);
      acks.forEach((ack) => okData(ack));

      const [{ reveal, scoreboard }] = await revealed;
      expect(reveal).toMatchObject({ roundNumber: 1, ownerPlayerId: owner.playerId });
      expect(reveal.votes).toHaveLength(4);
      expect(reveal.votes.find((v) => v.voterPlayerId === a.playerId)).toEqual({
        voterPlayerId: a.playerId,
        suspectPlayerId: owner.playerId,
        isCorrect: true,
      });
      expect(reveal.votes.filter((v) => v.isCorrect)).toHaveLength(1);
      expect(reveal.points).toEqual([{ playerId: a.playerId, points: 10, reason: 'SOLE_CORRECT' }]);
      expect(scoreboard[0]).toMatchObject({ playerId: a.playerId, rank: 1, totalScore: 10 });
      expect(scoreboard.slice(1).map((e) => [e.rank, e.totalScore])).toEqual([
        [2, 0],
        [2, 0],
        [2, 0],
      ]);

      const g = await game(l.roomId);
      expect(g).toMatchObject({ phase: 'REVEAL', stateVersion: 4 });
      expect(await t.prisma.roundScore.count()).toBe(1);
      const scorer = await t.prisma.gameParticipant.findFirstOrThrow({
        where: { roomPlayerId: a.playerId },
      });
      expect(scorer).toMatchObject({ totalScore: 10, correctGuesses: 1, ownerPoints: 0 });
      expect(okData(await advance(l.host, 'VOTING', 1)).applied).toBe(false);
    });

    it('scores an unguessed owner and shared correct guesses', async () => {
      const l = await lobby(4);
      const one = await toVoting(l);
      const [a, b, c] = one.others as [Member, Member, Member];
      let revealed = nextEvent(a.socket, 'game:round-revealed');
      await Promise.all([vote(a, 1, b), vote(b, 1, a), vote(c, 1, a), vote(one.owner, 1, a)]);
      expect((await revealed)[0].reveal.points).toEqual([
        { playerId: one.owner.playerId, points: 10, reason: 'OWNER_UNGUESSED' },
      ]);

      await step(l); // round 2
      await step(l);
      await step(l);
      const two = await roles(l, 2);
      const [d, e, f] = two.others as [Member, Member, Member];
      revealed = nextEvent(d.socket, 'game:round-revealed');
      await Promise.all([
        vote(d, 2, two.owner),
        vote(e, 2, two.owner),
        vote(f, 2, d),
        vote(two.owner, 2, d),
      ]);
      const points = (await revealed)[0].reveal.points;
      expect(points).toHaveLength(2);
      expect(points).toEqual(
        expect.arrayContaining([
          { playerId: d.playerId, points: 5, reason: 'SHARED_CORRECT' },
          { playerId: e.playerId, points: 5, reason: 'SHARED_CORRECT' },
        ]),
      );

      const board = (await sync(a)).scoreboard;
      const total = (m: Member) => board.find((x) => x.playerId === m.playerId)?.totalScore;
      const expected = new Map<string, number>();
      expected.set(one.owner.playerId, 10);
      for (const m of [d, e]) expected.set(m.playerId, (expected.get(m.playerId) ?? 0) + 5);
      for (const m of l.members) expect(total(m)).toBe(expected.get(m.playerId) ?? 0);
    });

    it('gives an offline owner nothing and stops waiting for players who are away', async () => {
      const l = await lobby(4);
      const { owner, others } = await toVoting(l);
      const [a, b, c] = others as [Member, Member, Member];
      const away = nextEvent(
        a.socket,
        'room:presence',
        (e) => e.playerId === owner.playerId && e.presence === 'AWAY',
      );
      owner.socket.close();
      await away;

      expect(errorCode(await vote(a, 1, owner))).toBe(ErrorCode.INVALID_SUSPECT);
      const revealed = nextEvent(a.socket, 'game:round-revealed');
      await Promise.all([vote(a, 1, b), vote(b, 1, c), vote(c, 1, a)]);
      const [{ reveal }] = await revealed;
      expect(reveal.points).toEqual([
        { playerId: owner.playerId, points: 0, reason: 'OWNER_OFFLINE' },
      ]);
    });

    it('waits again for a player who comes back during voting', async () => {
      const l = await lobby(4);
      await toVoting(l);
      const returning = l.members[3] as Member;
      const [x, y, z] = l.members.slice(0, 3) as [Member, Member, Member];
      const away = nextEvent(
        x.socket,
        'room:presence',
        (e) => e.playerId === returning.playerId && e.presence === 'AWAY',
      );
      returning.socket.close();
      await away;

      okData(await vote(x, 1, y));
      okData(await vote(y, 1, x));
      expect((await sync(x)).voteProgress).toEqual({ votesIn: 2, expected: 3 });

      const progress = nextEvent(x.socket, 'vote:progress', (e) => e.expected === 4);
      const socket = await connect(t.app, returning.guest.accessToken);
      sockets.push(socket);
      okData(await emitAck(socket, 'room:subscribe', { roomCode: l.code }));
      expect((await progress)[0]).toMatchObject({ votesIn: 2, expected: 4 });

      okData(await vote(z, 1, x));
      expect((await game(l.roomId)).phase).toBe('VOTING');
      const revealed = nextEvent(x.socket, 'game:round-revealed');
      okData(
        await emitAck(socket, 'vote:submit', {
          roundNumber: 1,
          suspectPlayerId: x.playerId,
          clientRequestId: randomUUID(),
        }),
      );
      expect((await revealed)[0].reveal.votes).toHaveLength(4);
    });

    it('lets the leader close voting with votes missing, which then count for nothing', async () => {
      const l = await lobby(3);
      const { owner, others } = await toVoting(l);
      okData(await vote(others[0]!, 1, owner));
      const revealed = nextEvent(others[1]!.socket, 'game:round-revealed');
      expect(okData(await advance(l.host, 'VOTING', 1)).applied).toBe(true);
      const [{ reveal }] = await revealed;
      expect(reveal.votes).toHaveLength(1);
      expect(reveal.points).toEqual([
        { playerId: others[0]!.playerId, points: 10, reason: 'SOLE_CORRECT' },
      ]);
      expect(errorCode(await vote(others[1]!, 1, owner))).toBe(ErrorCode.VOTING_CLOSED);
    });

    it('completes voting when the last missing voter leaves the room', async () => {
      const l = await lobby(4);
      await toVoting(l);
      const leaver = l.members[3] as Member;
      const [x, y, z] = l.members.slice(0, 3) as [Member, Member, Member];
      okData(await vote(x, 1, y));
      okData(await vote(y, 1, z));
      okData(await vote(z, 1, x));
      expect((await game(l.roomId)).phase).toBe('VOTING');

      const revealed = nextEvent(x.socket, 'game:round-revealed');
      await leave(leaver, l.code);
      const [{ reveal, scoreboard }] = await revealed;
      expect(reveal.votes).toHaveLength(3);
      expect(scoreboard.find((e) => e.playerId === leaver.playerId)?.hasLeft).toBe(true);
    });

    it('plays a full 5-player game with consistent scores, final results and a rematch', async () => {
      const l = await lobby(5, { roundCount: 5 });
      await startGame(l);
      expect(
        errorCode(await emitAck(l.host.socket, 'game:rematch', { clientRequestId: randomUUID() })),
      ).toBe(ErrorCode.GAME_IN_PROGRESS);

      for (let round = 1; round <= 5; round += 1) {
        await step(l);
        await step(l);
        const revealed = nextEvent(l.host.socket, 'game:round-revealed');
        // Everyone votes for the next player in line: some rounds have a correct guess.
        const acks = await Promise.all(
          l.members.map((m, i) => vote(m, round, l.members[(i + 1) % 5] as Member)),
        );
        acks.forEach((ack) => okData(ack));
        await revealed;

        // Every client sees the same scoreboard.
        const boards = await Promise.all(l.members.map(async (m) => (await sync(m)).scoreboard));
        boards.forEach((b) => expect(b).toEqual(boards[0]));
        await step(l); // next song, or SCOREBOARD after the last round
      }

      // Totals always equal the sum of the per-round score rows.
      const participants = await t.prisma.gameParticipant.findMany({
        include: { roundScores: true },
      });
      for (const p of participants) {
        expect(p.totalScore).toBe(p.roundScores.reduce((sum, r) => sum + r.points, 0));
      }
      expect(await t.prisma.roundScore.groupBy({ by: ['roundId'] })).toHaveLength(5);

      const snapshot = await sync(l.members[1]!);
      expect(snapshot.phase).toBe('SCOREBOARD');
      expect(snapshot.results?.ranking).toEqual(snapshot.scoreboard);
      const mostCorrect = Math.max(...participants.map((p) => p.correctGuesses));
      expect(snapshot.results?.awards.topGuesser?.value ?? 0).toBe(mostCorrect);

      expect(
        errorCode(
          await emitAck(l.members[1]!.socket, 'game:rematch', { clientRequestId: randomUUID() }),
        ),
      ).toBe(ErrorCode.NOT_ROOM_HOST);
      const finished = nextEvent(l.members[2]!.socket, 'game:finished');
      const started = nextEvent(l.members[2]!.socket, 'game:started');
      const rematch = okData(
        await emitAck(l.host.socket, 'game:rematch', { clientRequestId: randomUUID() }),
      );
      expect(rematch.game).toMatchObject({ gameNumber: 2, phase: 'PLAYING', roundNumber: 1 });
      expect(rematch.game?.scoreboard.every((e) => e.totalScore === 0)).toBe(true);
      expect((await finished)[0].results.ranking).toEqual(snapshot.scoreboard);
      expect((await started)[0].gameNumber).toBe(2);
      const games = await t.prisma.game.findMany({ orderBy: { gameNumber: 'asc' } });
      expect(games.map((x) => x.phase)).toEqual(['FINISHED', 'PLAYING']);
    });
  });
});
