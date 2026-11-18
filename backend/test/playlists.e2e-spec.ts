import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
  ErrorCode,
  type GetMyPlaylistResponse,
  type MyPlaylistDto,
  type RoomSnapshotDto,
} from '@pmp/shared';
import { PlaylistJobRunner } from '../src/playlists/playlist-job-runner.service.js';
import {
  MAX_INGESTION_ATTEMPTS,
  PlaylistRecoveryService,
} from '../src/playlists/playlist-recovery.service.js';
import { quotaDay } from '../src/youtube/quota.service.js';
import { YoutubeClient } from '../src/youtube/youtube.types.js';
import { bearer, createGuest, http, type Guest } from './utils/api.js';
import { FakeYoutube } from './utils/fake-youtube.js';
import { ytVideo } from './utils/youtube-fixtures.js';
import { connect, emitAck, nextEvent, okData, record, type ClientSocket } from './utils/sockets.js';
import { createTestApp, type TestApp } from './utils/test-app.js';

const songs = (prefix: string, n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + from}`);

describe('Playlists (e2e)', () => {
  let t: TestApp;
  const youtube = new FakeYoutube();
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(YoutubeClient).useValue(youtube));
    await t.app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    youtube.reset();
    await t.reset();
  });
  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.close());
    youtube.reset();
    await t.app.get(PlaylistJobRunner).whenIdle();
  });
  afterAll(async () => {
    await t.app.close();
  });

  const api = () => http(t.app);
  const idle = () => t.app.get(PlaylistJobRunner).whenIdle();

  interface Member {
    guest: Guest;
    socket: ClientSocket;
    playerId: string;
  }

  async function lobby(size: number): Promise<{ code: string; roomId: string; members: Member[] }> {
    const members: Member[] = [];
    let code = '';
    for (let i = 1; i <= size; i += 1) {
      const guest = await createGuest(t.app, `Player ${i}`);
      const res =
        i === 1
          ? await api()
              .post('/api/v1/rooms')
              .set(...bearer(guest))
              .send({})
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
      okData(await emitAck(socket, 'room:subscribe', { roomCode: code }));
      members.push({ guest, socket, playerId: snapshot.viewerPlayerId });
    }
    const room = await t.prisma.room.findUniqueOrThrow({ where: { code }, select: { id: true } });
    return { code, roomId: room.id, members };
  }

  const submit = (m: Member, code: string, url: string) =>
    api()
      .put(`/api/v1/rooms/${code}/playlist`)
      .set(...bearer(m.guest))
      .send({ url });

  async function mine(m: Member, code: string): Promise<MyPlaylistDto | null> {
    const res = await api()
      .get(`/api/v1/rooms/${code}/playlist`)
      .set(...bearer(m.guest))
      .expect(200);
    return (res.body as GetMyPlaylistResponse).playlist;
  }

  /** Submits and waits for the owner's final (non-PROCESSING) status. */
  async function submitAndSettle(
    m: Member,
    code: string,
    playlistId: string,
  ): Promise<MyPlaylistDto> {
    const settled = nextEvent(
      m.socket,
      'playlist:my-status',
      (e) => e.playlist?.status !== 'PROCESSING',
    );
    await submit(m, code, `https://www.youtube.com/playlist?list=${playlistId}`).expect(202);
    const [event] = await settled;
    return event.playlist!;
  }

  describe('submitting', () => {
    it('processes in the background, tells the owner privately and the room only "ready"', async () => {
      const { code, members } = await lobby(2);
      const [alice, bob] = members as [Member, Member];
      youtube.addPlaylist('PLalice0001', 'Alice road trip', songs('a', 8));
      const bobPrivate = record(bob.socket, 'playlist:my-status');
      const roomUpdate = nextEvent(bob.socket, 'playlist:submission-updated');
      const processing = nextEvent(alice.socket, 'playlist:my-status');

      const res = await submit(
        alice,
        code,
        'https://www.youtube.com/playlist?list=PLalice0001',
      ).expect(202);
      expect(res.body).toEqual({ status: 'PROCESSING' });
      expect((await processing)[0].playlist?.status).toBe('PROCESSING');

      const [update] = await roomUpdate;
      expect(update).toEqual({ playerId: alice.playerId, ready: true });
      expect(await mine(alice, code)).toMatchObject({
        status: 'READY',
        title: 'Alice road trip',
        playableCount: 8,
        duplicateCount: 0,
        rejectionCode: null,
        sourceUrl: 'https://www.youtube.com/playlist?list=PLalice0001',
      });
      expect(await mine(bob, code)).toBeNull();
      expect(bobPrivate).toHaveLength(0);

      const snapshot = okData(await emitAck(bob.socket, 'sync:request', {}));
      expect(snapshot.players.map((p) => [p.id, p.playlistReady])).toEqual([
        [alice.playerId, true],
        [bob.playerId, false],
      ]);
    });

    it('rejects bad URLs, personal lists and outsiders up front', async () => {
      const { code, members } = await lobby(1);
      const outsider = await createGuest(t.app, 'Outsider');

      const invalid = await submit(members[0]!, code, 'https://example.com/nope').expect(400);
      expect(invalid.body.error.code).toBe(ErrorCode.INVALID_PLAYLIST_URL);
      const watchLater = await submit(
        members[0]!,
        code,
        'https://www.youtube.com/playlist?list=WL',
      ).expect(400);
      expect(watchLater.body.error.code).toBe(ErrorCode.UNSUPPORTED_PLAYLIST);
      const missing = await api()
        .put(`/api/v1/rooms/${code}/playlist`)
        .set(...bearer(members[0]!.guest))
        .send({})
        .expect(400);
      expect(missing.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

      await api()
        .put(`/api/v1/rooms/${code}/playlist`)
        .set(...bearer(outsider))
        .send({ url: 'PLalice0001' })
        .expect(404);
      await api()
        .get(`/api/v1/rooms/${code}/playlist`)
        .set(...bearer(outsider))
        .expect(404);
      expect(youtube.calls).toBe(0);
    });

    it('refuses new submissions once the daily quota is exhausted', async () => {
      const { code, members } = await lobby(1);
      await t.redis.set(`pmp:yt:quota:${quotaDay(new Date())}:exhausted`, '1');

      const res = await submit(members[0]!, code, 'PLalice0001').expect(503);

      expect(res.body.error.code).toBe(ErrorCode.QUOTA_EXHAUSTED);
    });

    it('rejects private or missing playlists and ones with too few playable songs', async () => {
      const { code, members } = await lobby(1);
      const [m] = members as [Member];
      youtube.addPlaylist(
        'PLshort0001',
        'Short',
        ['p0', 'p1', 'p2', 'p3', 'x0', 'x1'],
        [
          ytVideo('x0', { status: { embeddable: false } }),
          ytVideo('x1', { contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }),
        ],
      );

      expect(await submitAndSettle(m, code, 'PLprivate0001')).toMatchObject({
        status: 'REJECTED',
        rejectionCode: 'PLAYLIST_NOT_FOUND',
      });
      expect(await submitAndSettle(m, code, 'PLshort0001')).toMatchObject({
        status: 'REJECTED',
        rejectionCode: 'NOT_ENOUGH_PLAYABLE_SONGS',
        playableCount: 4,
      });
    });
  });

  describe('duplicate songs (D6)', () => {
    it('drops songs already in a ready playlist from the later one only', async () => {
      const { code, members } = await lobby(3);
      const [a, b, c] = members as [Member, Member, Member];
      youtube.addPlaylist('PLaaaa0001', 'A', songs('s', 8));
      youtube.addPlaylist('PLbbbb0001', 'B', [...songs('s', 3), ...songs('b', 6)]);
      youtube.addPlaylist('PLcccc0001', 'C', [...songs('s', 5, 3), ...songs('c', 3)]);

      await submitAndSettle(a, code, 'PLaaaa0001');
      expect(await submitAndSettle(b, code, 'PLbbbb0001')).toMatchObject({
        status: 'READY',
        playableCount: 6,
        duplicateCount: 3,
      });
      expect(await submitAndSettle(c, code, 'PLcccc0001')).toMatchObject({
        status: 'REJECTED',
        rejectionCode: 'NOT_ENOUGH_UNIQUE_SONGS',
        duplicateCount: 5,
        playableCount: 3,
      });

      expect(await mine(a, code)).toMatchObject({ playableCount: 8, duplicateCount: 0 });
      const bTracks = await t.prisma.playlistTrack.findMany({
        where: { playlist: { roomPlayerId: b.playerId } },
        select: { youtubeVideoId: true, status: true },
      });
      expect(
        bTracks
          .filter((tr) => tr.status === 'DUPLICATE')
          .map((tr) => tr.youtubeVideoId)
          .sort(),
      ).toEqual(['s0', 's1', 's2']);
    });

    it('never lets the same video be playable in two playlists, even when five players submit at once', async () => {
      const { code, roomId, members } = await lobby(5);
      members.forEach((_, i) =>
        youtube.addPlaylist(`PLconc000${i}`, `P${i}`, songs('x', 10, i * 3)),
      );

      await Promise.all(
        members.map((m, i) =>
          submit(m, code, `https://www.youtube.com/playlist?list=PLconc000${i}`).expect(202),
        ),
      );
      await idle();

      const playable = await t.prisma.playlistTrack.groupBy({
        by: ['youtubeVideoId'],
        where: { roomId, status: 'PLAYABLE', playlist: { status: 'READY' } },
        _count: { _all: true },
      });
      expect(playable.length).toBeGreaterThan(0);
      expect(Math.max(...playable.map((p) => p._count._all))).toBe(1);
      const statuses = await t.prisma.playlist.findMany({
        where: { roomId },
        select: { status: true },
      });
      expect(statuses.every((s) => s.status !== 'PROCESSING')).toBe(true);
    });
  });

  describe('replacing, removing and leaving', () => {
    it('discards the result of a replaced submission', async () => {
      const { code, members } = await lobby(1);
      const [m] = members as [Member];
      youtube.addPlaylist('PLfirst0001', 'First', songs('f', 6));
      youtube.addPlaylist('PLsecond001', 'Second', songs('g', 6));
      const release = youtube.hold('PLfirst0001');
      const statuses = record(m.socket, 'playlist:my-status');

      await submit(m, code, 'PLfirst0001').expect(202);
      await submitAndSettle(m, code, 'PLsecond001');
      release();
      await idle();

      expect(await mine(m, code)).toMatchObject({ status: 'READY', title: 'Second' });
      expect(statuses.some(([e]) => e.playlist?.title === 'First')).toBe(false);
      expect(
        await t.prisma.playlistTrack.count({ where: { youtubeVideoId: { startsWith: 'f' } } }),
      ).toBe(0);
    });

    it('tells the room when a ready playlist is removed, and deletes it when the player leaves', async () => {
      const { code, members } = await lobby(2);
      const [a, b] = members as [Member, Member];
      youtube.addPlaylist('PLaaaa0001', 'A', songs('a', 6));
      youtube.addPlaylist('PLbbbb0001', 'B', songs('b', 6));
      await submitAndSettle(a, code, 'PLaaaa0001');
      await submitAndSettle(b, code, 'PLbbbb0001');

      const notReady = nextEvent(b.socket, 'playlist:submission-updated', (e) => !e.ready);
      await api()
        .delete(`/api/v1/rooms/${code}/playlist`)
        .set(...bearer(a.guest))
        .expect(204);
      expect((await notReady)[0]).toEqual({ playerId: a.playerId, ready: false });
      expect(await mine(a, code)).toBeNull();

      await api()
        .post(`/api/v1/rooms/${code}/leave`)
        .set(...bearer(b.guest))
        .expect(204);
      expect(await t.prisma.playlist.count({ where: { roomPlayerId: b.playerId } })).toBe(0);
      expect(
        await t.prisma.playlistTrack.count({ where: { youtubeVideoId: { startsWith: 'b' } } }),
      ).toBe(0);
    });
  });

  describe('recovery', () => {
    async function staleRow(roomId: string, playerId: string, attempts: number) {
      return t.prisma.playlist.create({
        data: {
          roomId,
          roomPlayerId: playerId,
          youtubePlaylistId: 'PLlost00001',
          sourceUrl: 'PLlost00001',
          submissionId: crypto.randomUUID(),
          attempts,
          processingStartedAt: new Date(Date.now() - 10 * 60_000),
        },
        select: { id: true },
      });
    }

    it('re-runs a submission whose job was lost, exactly once across concurrent sweeps', async () => {
      const { code, roomId, members } = await lobby(1);
      youtube.addPlaylist('PLlost00001', 'Recovered', songs('r', 6));
      await staleRow(roomId, members[0]!.playerId, 1);
      const recovery = t.app.get(PlaylistRecoveryService);

      const claims = await Promise.all([recovery.recoverStale(), recovery.recoverStale()]);
      await idle();

      expect(claims[0]! + claims[1]!).toBe(1);
      expect(await mine(members[0]!, code)).toMatchObject({ status: 'READY', title: 'Recovered' });
    });

    it('gives up after the maximum number of attempts', async () => {
      const { code, roomId, members } = await lobby(1);
      await staleRow(roomId, members[0]!.playerId, MAX_INGESTION_ATTEMPTS);

      await t.app.get(PlaylistRecoveryService).recoverStale();

      expect(await mine(members[0]!, code)).toMatchObject({
        status: 'REJECTED',
        rejectionCode: 'YOUTUBE_UNAVAILABLE',
      });
    });
  });

  describe('privacy', () => {
    it('never shows anyone another player’s playlist title, URL, playlist ID or songs', async () => {
      const { code, members } = await lobby(3);
      const secrets = members.map((_, i) => ({
        playlistId: `PLsecret${i}abcd`,
        title: `Secret title ${i}`,
        songs: songs(`q${i}x`, 6),
      }));
      secrets.forEach((s) => youtube.addPlaylist(s.playlistId, s.title, s.songs));
      const seen = members.map(() => [] as string[]);
      members.forEach((m, i) =>
        m.socket.onAny((event, ...args) => seen[i]!.push(JSON.stringify([event, args]))),
      );

      for (const [i, m] of members.entries())
        await submitAndSettle(m, code, secrets[i]!.playlistId);
      await idle();
      for (const [i, m] of members.entries()) {
        const snapshot = await api()
          .get(`/api/v1/rooms/${code}`)
          .set(...bearer(m.guest))
          .expect(200);
        const preview = await api()
          .get(`/api/v1/rooms/${code}/preview`)
          .set(...bearer(m.guest))
          .expect(200);
        const own = await api()
          .get(`/api/v1/rooms/${code}/playlist`)
          .set(...bearer(m.guest))
          .expect(200);
        seen[i]!.push(
          JSON.stringify(snapshot.body),
          JSON.stringify(preview.body),
          JSON.stringify(own.body),
        );
        seen[i]!.push(JSON.stringify(okData(await emitAck(m.socket, 'sync:request', {}))));
      }

      for (const [viewer, payloads] of seen.entries()) {
        const text = payloads.join('\n');
        for (const [owner, secret] of secrets.entries()) {
          if (owner === viewer) continue;
          expect(text).not.toContain(secret.title);
          expect(text).not.toContain(secret.playlistId);
          for (const song of secret.songs) expect(text).not.toContain(`"${song}"`);
        }
        // The viewer does see their own title.
        expect(text).toContain(secrets[viewer]!.title);
      }
    });
  });
});
