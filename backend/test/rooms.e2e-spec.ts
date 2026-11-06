import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode, type RoomSnapshotDto } from '@pmp/shared';
import { RoomCodeGenerator } from '../src/rooms/room-code.generator.js';
import { bearer, createGuest, http, type Guest } from './utils/api.js';
import { createTestApp, type TestApp } from './utils/test-app.js';

describe('Rooms (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t.app.close();
  });

  const api = () => http(t.app);

  async function createRoom(host: Guest, settings?: object): Promise<RoomSnapshotDto> {
    const response = await api()
      .post('/api/v1/rooms')
      .set(...bearer(host))
      .send(settings ? { settings } : {})
      .expect(201);
    return response.body as RoomSnapshotDto;
  }

  const join = (guest: Guest, code: string, body: object = {}) =>
    api()
      .post(`/api/v1/rooms/${code}/join`)
      .set(...bearer(guest))
      .send(body);

  describe('POST /rooms', () => {
    it('creates a lobby with default settings and the creator as host', async () => {
      const host = await createGuest(t.app, 'Host');

      const room = await createRoom(host);

      expect(room.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
      expect(room).toMatchObject({
        status: 'LOBBY',
        visibility: 'INVITE_ONLY',
        settings: { maxPlayers: 5, roundCount: 10 },
      });
      expect(room.players).toEqual([
        expect.objectContaining({ displayName: 'Host', isHost: true, id: room.viewerPlayerId }),
      ]);
      expect(room.hostPlayerId).toBe(room.viewerPlayerId);
    });

    it('accepts custom settings and rejects out-of-range ones', async () => {
      const host = await createGuest(t.app, 'Host');

      expect((await createRoom(host, { maxPlayers: 8, roundCount: 15 })).settings).toEqual({
        maxPlayers: 8,
        roundCount: 15,
      });

      for (const settings of [
        { maxPlayers: 2 },
        { maxPlayers: 11 },
        { roundCount: 4 },
        { roundCount: 21 },
      ]) {
        const response = await api()
          .post('/api/v1/rooms')
          .set(...bearer(host))
          .send({ settings })
          .expect(400);
        expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('retries with a new code when a generated code already exists', async () => {
      const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
      const collisionApp = await createTestApp((builder) =>
        builder.overrideProvider(RoomCodeGenerator).useValue({ generate: () => codes.shift()! }),
      );
      try {
        const host = await createGuest(collisionApp.app, 'Host');
        const first = await http(collisionApp.app)
          .post('/api/v1/rooms')
          .set(...bearer(host))
          .send({});
        const second = await http(collisionApp.app)
          .post('/api/v1/rooms')
          .set(...bearer(host))
          .send({});

        expect(first.body.code).toBe('AAAAAA');
        expect(second.status).toBe(201);
        expect(second.body.code).toBe('BBBBBB');
      } finally {
        await collisionApp.app.close();
      }
    });
  });

  describe('GET /rooms/:code/preview', () => {
    it('shows minimal join information and accepts lowercase codes', async () => {
      const host = await createGuest(t.app, 'Host');
      const visitor = await createGuest(t.app, 'Visitor');
      const room = await createRoom(host);

      const response = await api()
        .get(`/api/v1/rooms/${room.code.toLowerCase()}/preview`)
        .set(...bearer(visitor))
        .expect(200);

      expect(response.body).toEqual({
        code: room.code,
        status: 'LOBBY',
        playerCount: 1,
        maxPlayers: 5,
        joinable: true,
      });
    });

    it('returns an identical 404 for unknown and malformed codes', async () => {
      const visitor = await createGuest(t.app, 'Visitor');

      const unknown = await api()
        .get('/api/v1/rooms/ZZZZZZ/preview')
        .set(...bearer(visitor))
        .expect(404);
      const malformed = await api()
        .get('/api/v1/rooms/0O1-x/preview')
        .set(...bearer(visitor))
        .expect(404);

      expect(unknown.body.error).toEqual(malformed.body.error);
      expect(unknown.body.error.code).toBe(ErrorCode.ROOM_NOT_FOUND);
    });

    it('requires authentication', async () => {
      await api().get('/api/v1/rooms/ABCDEF/preview').expect(401);
    });
  });

  describe('POST /rooms/:code/join', () => {
    it('adds the player and is idempotent', async () => {
      const host = await createGuest(t.app, 'Host');
      const friend = await createGuest(t.app, 'Friend', 'avatar-05');
      const room = await createRoom(host);

      const first = (await join(friend, room.code).expect(200)).body as RoomSnapshotDto;
      const again = (await join(friend, room.code).expect(200)).body as RoomSnapshotDto;

      expect(first.players.map((p) => p.displayName)).toEqual(['Host', 'Friend']);
      expect(first.players[1]).toMatchObject({ avatarId: 'avatar-05', isHost: false });
      expect(again.viewerPlayerId).toBe(first.viewerPlayerId);
      expect(again.players).toHaveLength(2);
    });

    it('lets a player choose a room-specific name and rejects case-insensitive duplicates', async () => {
      const host = await createGuest(t.app, 'Sam');
      const other = await createGuest(t.app, 'Other');
      const third = await createGuest(t.app, 'SAM');
      const room = await createRoom(host);

      const clash = await join(other, room.code, { displayName: 'sam' }).expect(409);
      expect(clash.body.error.code).toBe(ErrorCode.DISPLAY_NAME_TAKEN);

      const profileClash = await join(third, room.code).expect(409);
      expect(profileClash.body.error.code).toBe(ErrorCode.DISPLAY_NAME_TAKEN);

      const ok = await join(other, room.code, { displayName: 'Sammy' }).expect(200);
      expect(ok.body.players.map((p: { displayName: string }) => p.displayName)).toEqual([
        'Sam',
        'Sammy',
      ]);
    });

    it('lets exactly one of many concurrent joiners take the last seat', async () => {
      const host = await createGuest(t.app, 'Host');
      const room = await createRoom(host, { maxPlayers: 3 });
      await join(await createGuest(t.app, 'Second'), room.code).expect(200);
      const contenders = await Promise.all(
        Array.from({ length: 6 }, (_, i) => createGuest(t.app, `Contender ${i}`)),
      );

      const responses = await Promise.all(contenders.map((guest) => join(guest, room.code)));

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409, 409, 409, 409, 409]);
      expect(
        responses
          .filter((r) => r.status === 409)
          .every((r) => r.body.error.code === ErrorCode.ROOM_FULL),
      ).toBe(true);
      const preview = await api()
        .get(`/api/v1/rooms/${room.code}/preview`)
        .set(...bearer(host))
        .expect(200);
      expect(preview.body).toMatchObject({ playerCount: 3, joinable: false });
    });

    it('rejects joins while a game is in progress', async () => {
      const host = await createGuest(t.app, 'Host');
      const late = await createGuest(t.app, 'Late');
      const room = await createRoom(host);
      await t.prisma.room.update({ where: { code: room.code }, data: { status: 'IN_GAME' } });

      const response = await join(late, room.code).expect(409);
      expect(response.body.error.code).toBe(ErrorCode.GAME_IN_PROGRESS);
      // Existing members are unaffected (idempotent rejoin).
      await join(host, room.code).expect(200);
    });
  });

  describe('GET /rooms/:code', () => {
    it('is visible to members only, with the same 404 as an unknown room for others', async () => {
      const host = await createGuest(t.app, 'Host');
      const outsider = await createGuest(t.app, 'Outsider');
      const room = await createRoom(host);

      await api()
        .get(`/api/v1/rooms/${room.code}`)
        .set(...bearer(host))
        .expect(200);
      const denied = await api()
        .get(`/api/v1/rooms/${room.code}`)
        .set(...bearer(outsider))
        .expect(404);
      expect(denied.body.error.code).toBe(ErrorCode.ROOM_NOT_FOUND);
    });

    it('never exposes user IDs of other players', async () => {
      const host = await createGuest(t.app, 'Host');
      const friend = await createGuest(t.app, 'Friend');
      const room = await createRoom(host);
      await join(friend, room.code).expect(200);

      const response = await api()
        .get(`/api/v1/rooms/${room.code}`)
        .set(...bearer(friend))
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain(host.user.id);
      expect(Object.keys(response.body.players[0]).sort()).toEqual([
        'avatarId',
        'displayName',
        'id',
        'isHost',
        'joinedAt',
      ]);
    });
  });

  describe('POST /rooms/:code/leave', () => {
    it('removes the player, and rejoining reuses the same player record', async () => {
      const host = await createGuest(t.app, 'Host');
      const friend = await createGuest(t.app, 'Friend');
      const room = await createRoom(host);
      const joined = (await join(friend, room.code).expect(200)).body as RoomSnapshotDto;

      await api()
        .post(`/api/v1/rooms/${room.code}/leave`)
        .set(...bearer(friend))
        .expect(204);
      const after = await api()
        .get(`/api/v1/rooms/${room.code}`)
        .set(...bearer(host))
        .expect(200);
      expect(after.body.players).toHaveLength(1);

      const rejoined = (await join(friend, room.code).expect(200)).body as RoomSnapshotDto;
      expect(rejoined.viewerPlayerId).toBe(joined.viewerPlayerId);
    });

    it('hands the host role to the longest-present player and closes the room when empty', async () => {
      const host = await createGuest(t.app, 'Host');
      const second = await createGuest(t.app, 'Second');
      const third = await createGuest(t.app, 'Third');
      const room = await createRoom(host);
      const secondView = (await join(second, room.code).expect(200)).body as RoomSnapshotDto;
      await join(third, room.code).expect(200);

      await api()
        .post(`/api/v1/rooms/${room.code}/leave`)
        .set(...bearer(host))
        .expect(204);
      const afterHostLeft = await api()
        .get(`/api/v1/rooms/${room.code}`)
        .set(...bearer(third))
        .expect(200);
      expect(afterHostLeft.body.hostPlayerId).toBe(secondView.viewerPlayerId);

      await api()
        .post(`/api/v1/rooms/${room.code}/leave`)
        .set(...bearer(second))
        .expect(204);
      await api()
        .post(`/api/v1/rooms/${room.code}/leave`)
        .set(...bearer(third))
        .expect(204);

      await api()
        .get(`/api/v1/rooms/${room.code}/preview`)
        .set(...bearer(third))
        .expect(404);
      await join(third, room.code).expect(404);
    });

    it('returns 404 for non-members', async () => {
      const host = await createGuest(t.app, 'Host');
      const outsider = await createGuest(t.app, 'Outsider');
      const room = await createRoom(host);

      await api()
        .post(`/api/v1/rooms/${room.code}/leave`)
        .set(...bearer(outsider))
        .expect(404);
    });
  });

  describe('PATCH /rooms/:code/settings', () => {
    it('lets only the host change settings', async () => {
      const host = await createGuest(t.app, 'Host');
      const friend = await createGuest(t.app, 'Friend');
      const room = await createRoom(host);
      await join(friend, room.code).expect(200);

      const denied = await api()
        .patch(`/api/v1/rooms/${room.code}/settings`)
        .set(...bearer(friend))
        .send({ roundCount: 12 })
        .expect(403);
      expect(denied.body.error.code).toBe(ErrorCode.NOT_ROOM_HOST);

      const updated = await api()
        .patch(`/api/v1/rooms/${room.code}/settings`)
        .set(...bearer(host))
        .send({ roundCount: 12, maxPlayers: 6 })
        .expect(200);
      expect(updated.body.settings).toEqual({ maxPlayers: 6, roundCount: 12 });
    });

    it('refuses a max player count below the current number of players', async () => {
      const host = await createGuest(t.app, 'Host');
      const room = await createRoom(host);
      for (const name of ['A', 'B', 'C'])
        await join(await createGuest(t.app, name), room.code).expect(200);

      const response = await api()
        .patch(`/api/v1/rooms/${room.code}/settings`)
        .set(...bearer(host))
        .send({ maxPlayers: 3 })
        .expect(409);
      expect(response.body.error.code).toBe(ErrorCode.ROOM_SETTINGS_CONFLICT);
    });
  });
});
