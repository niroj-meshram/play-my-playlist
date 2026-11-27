import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  GameEndReason,
  ROOM_LIMITS,
  SCORING_DEFAULTS,
  UNPLAYABLE_YT_ERROR_CODES,
  type ActiveGamePhase,
  type PlaybackState,
} from '@pmp/shared';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockRoomById, type LockedRoom } from '../rooms/room-lock.js';
import { nextPhase, type GameTrigger } from './domain/game-state-machine.js';
import { shuffle, takeRandom } from './domain/random.js';
import { reassignRounds } from './domain/round-reassigner.js';
import { planRounds } from './domain/round-planner.js';
import { GameEventsService, type GameNotice } from './game-events.service.js';
import {
  SONG_SELECT,
  loadPublicRound,
  loadReveal,
  loadScoreboard,
  playlistLabel,
  toCandidates,
  toPublicTrack,
  toResults,
  versioned,
  type Song,
} from './game.mapper.js';
import { RoundScorer } from './round-scorer.service.js';
import { VoteCounter } from './vote-counter.service.js';

type Tx = Prisma.TransactionClient;

const ACTIVE_GAME_SELECT = {
  id: true,
  phase: true,
  currentRound: true,
  totalRounds: true,
  stateVersion: true,
  phaseStartedAt: true,
  endReason: true,
} as const satisfies Prisma.GameSelect;

type ActiveGame = Prisma.GameGetPayload<{ select: typeof ACTIVE_GAME_SELECT }>;

/** Result of a leader command; `false` means it was stale or already applied. */
export interface CommandResult {
  applied: boolean;
}

const NOT_APPLIED: CommandResult = { applied: false };

/**
 * Write side of the game engine (docs/architecture.md §4–5). Every command runs in one
 * transaction that first locks the room row, so commands, leaves and host migration of a
 * room are serialised. Phase changes are additionally compare-and-set on
 * (phase, stateVersion), and events are published only after commit.
 */
@Injectable()
export class GameOrchestrator {
  private readonly logger = new Logger(GameOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: GameEventsService,
    private readonly votes: VoteCounter,
    private readonly scorer: RoundScorer,
  ) {}

  /** Leader starts a game from the lobby: participants, labels and the full round plan. */
  async start(roomId: string, playerId: string): Promise<void> {
    let notices: GameNotice[];
    try {
      notices = await this.prisma.$transaction((tx) => this.startInTx(tx, roomId, playerId));
    } catch (error) {
      // The partial unique index (one unfinished game per room) is the last line of defence.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw gameInProgress();
      }
      throw error;
    }
    this.events.publish(roomId, notices);
    this.logger.log(`Game started in room ${roomId}`);
  }

  /**
   * Leader starts the next game from SCOREBOARD (finishing the current one) or from the
   * lobby after a game. Both happen in one transaction: if the new game cannot start
   * (e.g. too few players are left), the current game stays on its scoreboard.
   */
  async rematch(roomId: string, playerId: string): Promise<void> {
    let notices: GameNotice[];
    try {
      notices = await this.prisma.$transaction(async (tx) => {
        const room = await lockRoomById(tx, roomId);
        assertLeader(room, playerId);
        const game = await this.activeGame(tx, roomId);
        const finishing: GameNotice[] = [];
        if (game) {
          if (game.phase !== 'SCOREBOARD') throw gameInProgress();
          finishing.push(...((await this.apply(tx, roomId, game, 'ADVANCE')) ?? []));
        }
        return [...finishing, ...(await this.startInTx(tx, roomId, playerId))];
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw gameInProgress();
      }
      throw error;
    }
    this.events.publish(roomId, notices);
    this.logger.log(`Rematch started in room ${roomId}`);
  }

  /**
   * Re-evaluates voting after anything that changes who must vote: a vote, a leave, a
   * player going AWAY or coming back. Closes voting when every required voter has voted,
   * otherwise announces the new counts. The caller holds the room lock.
   */
  async closeVotingIfCompleteInTx(tx: Tx, roomId: string): Promise<GameNotice[]> {
    const game = await this.activeGame(tx, roomId);
    if (game?.phase !== 'VOTING') return [];
    const tally = await this.votes.tally(tx, roomId, game.id, game.currentRound);
    if (tally.complete) return (await this.apply(tx, roomId, game, 'VOTING_COMPLETE')) ?? [];
    return [
      {
        kind: 'voteProgress',
        event: {
          ...versioned(game.stateVersion),
          roundNumber: game.currentRound,
          votesIn: tally.votesIn,
          expected: tally.expected,
        },
      },
    ];
  }

  /** A player went AWAY or came back: the set of required voters may have changed. */
  async onPresenceChanged(roomId: string): Promise<void> {
    // Cheap pre-check without the lock: most presence changes happen outside voting.
    const voting = await this.prisma.game.count({ where: { roomId, phase: 'VOTING' } });
    if (voting === 0) return;
    const notices = await this.prisma.$transaction(async (tx) => {
      await lockRoomById(tx, roomId);
      return this.closeVotingIfCompleteInTx(tx, roomId);
    });
    this.events.publish(roomId, notices);
  }

  /** Leader moves the game one phase forward. Stale or repeated clicks are no-ops. */
  async advance(
    roomId: string,
    playerId: string,
    expectedPhase: ActiveGamePhase,
    roundNumber: number,
  ): Promise<CommandResult> {
    const notices = await this.prisma.$transaction(async (tx) => {
      const { game } = await this.leaderAndGame(tx, roomId, playerId);
      if (game.phase !== expectedPhase || game.currentRound !== roundNumber) return null;
      return this.apply(tx, roomId, game, 'ADVANCE');
    });
    return this.finish(roomId, notices);
  }

  /** The leader's YouTube player reports what happened to the current song. */
  async playbackReport(
    roomId: string,
    playerId: string,
    report: { roundNumber: number; videoId: string; state: PlaybackState; ytErrorCode?: number },
  ): Promise<CommandResult> {
    if (report.state === 'PLAYING') return NOT_APPLIED;
    const notices = await this.prisma.$transaction(async (tx) => {
      const { game } = await this.leaderAndGame(tx, roomId, playerId);
      if (game.phase !== 'PLAYING' || game.currentRound !== report.roundNumber) return null;
      const round = await tx.gameRound.findUniqueOrThrow({
        where: { gameId_roundNumber: { gameId: game.id, roundNumber: game.currentRound } },
        select: { youtubeVideoId: true, gamePlaylist: { select: { sourcePlaylistId: true } } },
      });
      // A late report about a song that was already replaced must not act twice.
      if (round.youtubeVideoId !== report.videoId) return null;

      if (report.state === 'ENDED') return this.apply(tx, roomId, game, 'PLAYBACK_ENDED');
      return this.replaceCurrentSong(
        tx,
        roomId,
        game,
        round.youtubeVideoId,
        round.gamePlaylist.sourcePlaylistId,
        report.ytErrorCode,
      );
    });
    return this.finish(roomId, notices);
  }

  /**
   * Called by `RoomsService.leave` inside its transaction (room row already locked).
   * The leaver's upcoming rounds go to other playlists; below the minimum player count
   * the game ends. Returns the notices to publish after commit.
   */
  async onPlayerLeftInTx(tx: Tx, roomId: string, playerId: string): Promise<GameNotice[]> {
    const game = await this.activeGame(tx, roomId);
    if (!game || game.phase === 'SCOREBOARD') return [];

    const participants = await tx.gameParticipant.findMany({
      where: { gameId: game.id },
      select: {
        roomPlayerId: true,
        roomPlayer: { select: { status: true } },
        playlist: { select: { id: true, sourcePlaylistId: true } },
      },
    });
    const leaver = participants.find((p) => p.roomPlayerId === playerId);
    if (!leaver?.playlist) return [];
    const remaining = participants.filter(
      (p) => p.roomPlayerId !== playerId && p.roomPlayer.status === 'ACTIVE',
    );
    if (remaining.length < ROOM_LIMITS.minPlayers) {
      return (
        (await this.apply(tx, roomId, game, 'END_EARLY', GameEndReason.NOT_ENOUGH_PLAYERS)) ?? []
      );
    }
    const reassigned = await this.reassignLeaverRounds(tx, game, leaver.playlist.id, remaining);
    // The leaver no longer has to vote, which may complete the voting.
    return [...reassigned, ...(await this.closeVotingIfCompleteInTx(tx, roomId))];
  }

  // ---------------------------------------------------------------------------------------

  private async startInTx(tx: Tx, roomId: string, playerId: string): Promise<GameNotice[]> {
    const room = await lockRoomById(tx, roomId);
    assertLeader(room, playerId);
    if (room.status !== 'LOBBY') throw gameInProgress();

    const players = await tx.roomPlayer.findMany({
      where: { roomId, status: 'ACTIVE' },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        playlist: {
          select: {
            id: true,
            status: true,
            tracks: { where: { status: 'PLAYABLE' }, select: SONG_SELECT },
          },
        },
      },
    });
    if (players.length < ROOM_LIMITS.minPlayers) {
      throw new AppException(
        ErrorCode.NOT_ENOUGH_PLAYERS,
        `At least ${ROOM_LIMITS.minPlayers} players are needed to start.`,
        HttpStatus.CONFLICT,
      );
    }
    const entries = players.map((p) => {
      if (p.playlist?.status !== 'READY') {
        throw new AppException(
          ErrorCode.PLAYLISTS_NOT_READY,
          'Every player needs a ready playlist before the game can start.',
          HttpStatus.CONFLICT,
        );
      }
      return {
        participantId: randomUUID(),
        gamePlaylistId: randomUUID(),
        roomPlayerId: p.id,
        playlist: p.playlist,
      };
    });

    // Labels follow a CSPRNG shuffle, never join or submission order (§11).
    const labelled = shuffle(entries).map((e, i) => ({ ...e, label: playlistLabel(i) }));
    const plan = planRounds(
      labelled.map((e) => ({ id: e.gamePlaylistId, tracks: e.playlist.tracks })),
      room.roundCount,
    );
    const first = plan[0];
    if (!first) throw new Error('A game cannot start without songs');

    const previous = await tx.game.findFirst({
      where: { roomId },
      orderBy: { gameNumber: 'desc' },
      select: { gameNumber: true },
    });
    const gameId = randomUUID();
    const gameNumber = (previous?.gameNumber ?? 0) + 1;
    const now = new Date();
    const stateVersion = 1;

    await tx.game.create({
      data: {
        id: gameId,
        roomId,
        gameNumber,
        phase: 'PLAYING',
        currentRound: 1,
        totalRounds: plan.length,
        stateVersion,
        phaseStartedAt: now,
        startedAt: now,
        settingsSnapshot: { roundCount: room.roundCount, scoring: SCORING_DEFAULTS },
      },
    });
    await tx.gameParticipant.createMany({
      data: entries.map((e) => ({ id: e.participantId, gameId, roomPlayerId: e.roomPlayerId })),
    });
    await tx.gamePlaylist.createMany({
      data: labelled.map((e) => ({
        id: e.gamePlaylistId,
        gameId,
        ownerParticipantId: e.participantId,
        sourcePlaylistId: e.playlist.id,
        publicLabel: e.label,
      })),
    });
    await tx.gameRound.createMany({
      data: plan.map((round, i) => ({
        gameId,
        roundNumber: i + 1,
        gamePlaylistId: round.playlistId,
        status: i === 0 ? 'ACTIVE' : 'PENDING',
        startedAt: i === 0 ? now : null,
        ...round.track,
      })),
    });
    await tx.room.update({
      where: { id: roomId },
      data: { status: 'IN_GAME', lastActivityAt: now },
    });

    const labelOf = new Map<string, string>(labelled.map((e) => [e.gamePlaylistId, e.label]));
    const viewers = await this.viewerNotices(tx, gameId, 1, stateVersion);
    return [
      {
        kind: 'started',
        event: {
          ...versioned(stateVersion),
          gameNumber,
          totalRounds: plan.length,
          playlistLabels: labelled.map((e) => e.label).sort(),
        },
      },
      {
        kind: 'round',
        replaced: false,
        event: {
          ...versioned(stateVersion),
          round: {
            roundNumber: 1,
            playlistLabel: labelOf.get(first.playlistId) ?? '',
            track: toPublicTrack(first.track),
          },
        },
      },
      ...viewers,
    ];
  }

  /**
   * Applies one state-machine transition with its side effects. Returns `null` when the
   * trigger is not valid now or another command already moved the game (CAS miss).
   */
  private async apply(
    tx: Tx,
    roomId: string,
    game: ActiveGame,
    trigger: GameTrigger,
    endReason: GameEndReason = GameEndReason.COMPLETED,
  ): Promise<GameNotice[] | null> {
    const to = nextPhase(game.phase, trigger, {
      roundNumber: game.currentRound,
      totalRounds: game.totalRounds,
    });
    if (!to) return null;

    const now = new Date();
    const stateVersion = game.stateVersion + 1;
    const roundNumber =
      game.phase === 'REVEAL' && to === 'PLAYING' ? game.currentRound + 1 : game.currentRound;
    const { count } = await tx.game.updateMany({
      where: { id: game.id, phase: game.phase, stateVersion: game.stateVersion },
      data: {
        phase: to,
        stateVersion,
        phaseStartedAt: now,
        currentRound: roundNumber,
        ...(to === 'SCOREBOARD' ? { endReason } : {}),
        ...(to === 'FINISHED' ? { finishedAt: now } : {}),
      },
    });
    if (count === 0) return null;

    const notices: GameNotice[] = [
      {
        kind: 'phase',
        event: {
          ...versioned(stateVersion),
          phase: to,
          roundNumber,
          totalRounds: game.totalRounds,
          phaseStartedAt: now.toISOString(),
          endReason: to === 'SCOREBOARD' ? endReason : (game.endReason ?? null),
        },
      },
    ];

    if (to === 'VOTING') {
      // Clients learn the expected number of voters as soon as voting opens.
      const tally = await this.votes.tally(tx, roomId, game.id, roundNumber);
      notices.push({
        kind: 'voteProgress',
        event: {
          ...versioned(stateVersion),
          roundNumber,
          votesIn: tally.votesIn,
          expected: tally.expected,
        },
      });
    }
    if (to === 'REVEAL') {
      await this.scorer.scoreInTx(tx, roomId, game.id, roundNumber);
      await tx.gameRound.update({
        where: { gameId_roundNumber: { gameId: game.id, roundNumber } },
        data: { status: 'REVEALED', revealedAt: now },
      });
      const [reveal, scoreboard] = await Promise.all([
        loadReveal(tx, game.id, roundNumber),
        loadScoreboard(tx, game.id),
      ]);
      if (reveal) {
        notices.push({
          kind: 'revealed',
          event: { ...versioned(stateVersion), reveal, scoreboard },
        });
      }
    }
    if (to === 'SCOREBOARD') {
      const results = toResults(await loadScoreboard(tx, game.id));
      notices.push({ kind: 'results', event: { ...versioned(stateVersion), results } });
    }
    if (to === 'PLAYING') {
      notices.push(...(await this.activateRound(tx, game.id, roundNumber, stateVersion, now)));
    }
    if (to === 'FINISHED') {
      // The room returns to the lobby with playlists kept, ready for another game.
      await tx.room.updateMany({
        where: { id: roomId, status: 'IN_GAME' },
        data: { status: 'LOBBY', lastActivityAt: now },
      });
      notices.push({
        kind: 'finished',
        event: {
          ...versioned(stateVersion),
          endReason: game.endReason ?? endReason,
          results: toResults(await loadScoreboard(tx, game.id)),
        },
      });
    }
    return notices;
  }

  /** Marks a round ACTIVE and announces it: the song to everyone, ownership privately. */
  private async activateRound(
    tx: Tx,
    gameId: string,
    roundNumber: number,
    stateVersion: number,
    now: Date,
  ): Promise<GameNotice[]> {
    await tx.gameRound.update({
      where: { gameId_roundNumber: { gameId, roundNumber } },
      data: { status: 'ACTIVE', startedAt: now },
    });
    const round = await loadPublicRound(tx, gameId, roundNumber);
    if (!round) return [];
    return [
      { kind: 'round', replaced: false, event: { ...versioned(stateVersion), round } },
      ...(await this.viewerNotices(tx, gameId, roundNumber, stateVersion)),
    ];
  }

  private async viewerNotices(
    tx: Tx,
    gameId: string,
    roundNumber: number,
    stateVersion: number,
  ): Promise<GameNotice[]> {
    const [round, participants, scoreboard] = await Promise.all([
      tx.gameRound.findUniqueOrThrow({
        where: { gameId_roundNumber: { gameId, roundNumber } },
        select: { gamePlaylist: { select: { ownerParticipantId: true } } },
      }),
      tx.gameParticipant.findMany({
        where: { gameId, roomPlayer: { status: 'ACTIVE' } },
        select: { id: true, roomPlayerId: true },
      }),
      loadScoreboard(tx, gameId),
    ]);
    // Private: each participant learns only whether the song is theirs.
    return participants.map((p) => ({
      kind: 'viewer',
      playerId: p.roomPlayerId,
      event: {
        ...versioned(stateVersion),
        roundNumber,
        viewer: {
          isYourPlaylist: p.id === round.gamePlaylist.ownerParticipantId,
          candidates: toCandidates(scoreboard, p.roomPlayerId),
          myVote: null,
        },
      },
    }));
  }

  /**
   * The leader's player could not play the song: swap in an unused song from the same
   * playlist. When that playlist has none left, the round is dropped and the game moves
   * on to the next round (or ends when no rounds remain).
   */
  private async replaceCurrentSong(
    tx: Tx,
    roomId: string,
    game: ActiveGame,
    failedVideoId: string,
    sourcePlaylistId: string | null,
    ytErrorCode: number | undefined,
  ): Promise<GameNotice[] | null> {
    const isUnplayable = (UNPLAYABLE_YT_ERROR_CODES as readonly number[]).includes(
      ytErrorCode ?? -1,
    );
    if (sourcePlaylistId && isUnplayable) {
      await tx.playlistTrack.updateMany({
        where: { playlistId: sourcePlaylistId, youtubeVideoId: failedVideoId },
        data: { status: 'UNPLAYABLE' },
      });
    }
    const replacement = sourcePlaylistId
      ? takeRandom(await this.unusedSongs(tx, game.id, [sourcePlaylistId]))
      : undefined;
    const stateVersion = game.stateVersion + 1;
    const now = new Date();

    if (replacement) {
      if (!(await this.bumpVersion(tx, game, {}))) return null;
      const { playlistId: _source, ...song } = replacement;
      await tx.gameRound.update({
        where: { gameId_roundNumber: { gameId: game.id, roundNumber: game.currentRound } },
        data: { ...song, startedAt: now },
      });
      const round = await loadPublicRound(tx, game.id, game.currentRound);
      this.logger.log(`Replaced an unplayable song in game ${game.id}`);
      return round
        ? [{ kind: 'round', replaced: true, event: { ...versioned(stateVersion), round } }]
        : [];
    }

    await tx.gameRound.delete({
      where: { gameId_roundNumber: { gameId: game.id, roundNumber: game.currentRound } },
    });
    await renumberRoundsAfter(tx, game.id, game.currentRound - 1);
    const totalRounds = game.totalRounds - 1;
    this.logger.log(`Dropped a round without playable songs in game ${game.id}`);

    if (game.currentRound > totalRounds) {
      const shortened = { ...game, totalRounds, currentRound: Math.max(totalRounds, 1) };
      await tx.game.update({
        where: { id: game.id },
        data: { totalRounds, currentRound: shortened.currentRound },
      });
      return this.apply(tx, roomId, shortened, 'END_EARLY', GameEndReason.OUT_OF_SONGS);
    }
    if (!(await this.bumpVersion(tx, game, { totalRounds, phaseStartedAt: now }))) return null;
    return [
      {
        kind: 'phase',
        event: {
          ...versioned(stateVersion),
          phase: 'PLAYING',
          roundNumber: game.currentRound,
          totalRounds,
          phaseStartedAt: now.toISOString(),
          endReason: null,
        },
      },
      ...(await this.activateRound(tx, game.id, game.currentRound, stateVersion, now)),
    ];
  }

  /** Gives the leaver's upcoming rounds to other playlists, dropping those nobody can fill. */
  private async reassignLeaverRounds(
    tx: Tx,
    game: ActiveGame,
    leaverPlaylistId: string,
    remaining: readonly { playlist: { id: string; sourcePlaylistId: string | null } | null }[],
  ): Promise<GameNotice[]> {
    const rounds = await tx.gameRound.findMany({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'asc' },
      select: { roundNumber: true, gamePlaylistId: true },
    });
    const pending = rounds.filter((r) => r.roundNumber > game.currentRound);
    if (!pending.some((r) => r.gamePlaylistId === leaverPlaylistId)) return [];

    const playlists = remaining.flatMap((p) => (p.playlist ? [p.playlist] : []));
    const gamePlaylistBySource = new Map(
      playlists.flatMap((p) => (p.sourcePlaylistId ? [[p.sourcePlaylistId, p.id] as const] : [])),
    );
    const unused = await this.unusedSongs(tx, game.id, [...gamePlaylistBySource.keys()]);
    const candidates = playlists.map((p) => ({
      playlistId: p.id,
      roundCount: rounds.filter((r) => r.gamePlaylistId === p.id).length,
      unusedTracks: unused.filter((s) => gamePlaylistBySource.get(s.playlistId) === p.id),
    }));
    const previous = rounds.find((r) => r.roundNumber === game.currentRound)?.gamePlaylistId;
    const plan = reassignRounds(
      previous ?? null,
      pending.map((r) => ({ playlistId: r.gamePlaylistId })),
      leaverPlaylistId,
      candidates,
    );

    let dropped = 0;
    for (const [i, slot] of plan.entries()) {
      const roundNumber = (pending[i] as { roundNumber: number }).roundNumber;
      const where = { gameId_roundNumber: { gameId: game.id, roundNumber } };
      if (slot.kind === 'reassign') {
        const { playlistId: _source, ...song } = slot.track;
        await tx.gameRound.update({ where, data: { gamePlaylistId: slot.playlistId, ...song } });
      } else if (slot.kind === 'drop') {
        await tx.gameRound.delete({ where });
        dropped += 1;
      }
    }
    if (dropped === 0) return [];

    await renumberRoundsAfter(tx, game.id, game.currentRound);
    const totalRounds = game.totalRounds - dropped;
    if (!(await this.bumpVersion(tx, game, { totalRounds }))) return [];
    return [
      {
        kind: 'phase',
        event: {
          ...versioned(game.stateVersion + 1),
          phase: game.phase,
          roundNumber: game.currentRound,
          totalRounds,
          phaseStartedAt: game.phaseStartedAt.toISOString(),
          endReason: game.endReason ?? null,
        },
      },
    ];
  }

  /** Playable songs of the given lobby playlists that this game has not used yet. */
  private async unusedSongs(
    tx: Tx,
    gameId: string,
    sourcePlaylistIds: readonly string[],
  ): Promise<(Song & { playlistId: string })[]> {
    if (sourcePlaylistIds.length === 0) return [];
    const used = await tx.gameRound.findMany({
      where: { gameId },
      select: { youtubeVideoId: true },
    });
    return tx.playlistTrack.findMany({
      where: {
        playlistId: { in: [...sourcePlaylistIds] },
        status: 'PLAYABLE',
        youtubeVideoId: { notIn: used.map((u) => u.youtubeVideoId) },
      },
      select: { ...SONG_SELECT, playlistId: true },
    });
  }

  /** Compare-and-set version bump for changes that keep the phase. */
  private async bumpVersion(
    tx: Tx,
    game: ActiveGame,
    data: Prisma.GameUpdateManyMutationInput,
  ): Promise<boolean> {
    const { count } = await tx.game.updateMany({
      where: { id: game.id, phase: game.phase, stateVersion: game.stateVersion },
      data: { ...data, stateVersion: game.stateVersion + 1 },
    });
    return count === 1;
  }

  private async leaderAndGame(
    tx: Tx,
    roomId: string,
    playerId: string,
  ): Promise<{ room: LockedRoom; game: ActiveGame }> {
    const room = await lockRoomById(tx, roomId);
    assertLeader(room, playerId);
    const game = await this.activeGame(tx, roomId);
    if (!game) {
      throw new AppException(
        ErrorCode.NO_ACTIVE_GAME,
        'There is no game in progress in this room.',
        HttpStatus.CONFLICT,
      );
    }
    return { room, game };
  }

  private activeGame(tx: Tx, roomId: string): Promise<ActiveGame | null> {
    return tx.game.findFirst({
      where: { roomId, phase: { not: 'FINISHED' } },
      select: ACTIVE_GAME_SELECT,
    });
  }

  private finish(roomId: string, notices: GameNotice[] | null): CommandResult {
    if (!notices) return NOT_APPLIED;
    this.events.publish(roomId, notices);
    return { applied: true };
  }
}

/** The leader is always the current host (D3, D8): host migration hands leadership over. */
function assertLeader(room: LockedRoom, playerId: string): void {
  if (room.hostPlayerId !== playerId) {
    throw new AppException(
      ErrorCode.NOT_ROOM_HOST,
      'Only the host can control the game.',
      HttpStatus.FORBIDDEN,
    );
  }
}

function gameInProgress(): AppException {
  return new AppException(
    ErrorCode.GAME_IN_PROGRESS,
    'A game is already in progress in this room.',
    HttpStatus.CONFLICT,
  );
}

/**
 * Closes gaps in round numbers after deleted rounds: rounds after `after` become
 * after+1, after+2, … in order. Two steps through negative numbers keep the
 * (gameId, roundNumber) unique constraint satisfied at every row update.
 */
async function renumberRoundsAfter(tx: Tx, gameId: string, after: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "GameRound" AS r
    SET "roundNumber" = -(${after} + s.rn)
    FROM (
      SELECT "id", ROW_NUMBER() OVER (ORDER BY "roundNumber") AS rn
      FROM "GameRound"
      WHERE "gameId" = ${gameId}::uuid AND "roundNumber" > ${after}
    ) AS s
    WHERE r."id" = s."id"`;
  await tx.$executeRaw`
    UPDATE "GameRound" SET "roundNumber" = -"roundNumber"
    WHERE "gameId" = ${gameId}::uuid AND "roundNumber" < 0`;
}
