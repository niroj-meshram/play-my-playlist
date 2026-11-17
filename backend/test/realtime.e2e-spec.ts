import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode, type RoomSnapshotDto } from '@pmp/shared';
import { TimerKind } from '../src/realtime/presence/presence.keys.js';
import { PresenceService } from '../src/realtime/presence/presence.service.js';
import { bearer, createGuest, http, type Guest } from './utils/api.js';
import {
  connect,
  delay,
  emitAck,
  nextEvent,
  okData,
  record,
  type ClientSocket,
} from './utils/sockets.js';
import { createTestApp, type TestApp } from './utils/test-app.js';

// Matches test/setup/test-env.js.
const DEBOUNCE_MS = 200;
const GRACE_MS = 600;

describe('Realtime lobby (e2e)', () => {
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

  async function open(guest: Guest): Promise<ClientSocket> {
    const socket = await connect(t.app, guest.accessToken);
    sockets.push(socket);
    return socket;
  }

  async function subscribe(socket: ClientSocket, code: string): Promise<RoomSnapshotDto> {
    return okData(await emitAck(socket, 'room:subscribe', { roomCode: code }));
  }

  async function createRoom(host: Guest): Promise<RoomSnapshotDto> {
    const res = await api()
      .post('/api/v1/rooms')
      .set(...bearer(host))
      .send({})
      .expect(201);
    return res.body as RoomSnapshotDto;
  }

  async function join(guest: Guest, code: string): Promise<RoomSnapshotDto> {
    const res = await api()
      .post(`/api/v1/rooms/${code}/join`)
      .set(...bearer(guest))
      .send({})
      .expect(200);
    return res.body as RoomSnapshotDto;
  }

  interface Member {
    guest: Guest;
    socket: ClientSocket;
    playerId: string;
  }

  /** Host plus `others` players, all joined and subscribed, in join order. */
  async function lobby(others: number): Promise<{ code: string; members: Member[] }> {
    const hostGuest = await createGuest(t.app, 'Player 1');
    const room = await createRoom(hostGuest);
    const members: Member[] = [
      { guest: hostGuest, socket: await open(hostGuest), playerId: room.viewerPlayerId },
    ];
    await subscribe(members[0]!.socket, room.code);
    for (let i = 2; i <= others + 1; i += 1) {
      const guest = await createGuest(t.app, `Player ${i}`);
      const snapshot = await join(guest, room.code);
      const socket = await open(guest);
      await subscribe(socket, room.code);
      members.push({ guest, socket, playerId: snapshot.viewerPlayerId });
    }
    return { code: room.code, members };
  }

  describe('handshake and authorization', () => {
    it('rejects connections without a valid access token', async () => {
      await expect(connect(t.app)).rejects.toThrow('Authentication required.');
      await expect(connect(t.app, 'not-a-jwt')).rejects.toThrow('Authentication required.');
    });

    it('answers non-members, unknown and malformed codes with the same ROOM_NOT_FOUND', async () => {
      const host = await createGuest(t.app, 'Host');
      const room = await createRoom(host);
      const outsider = await open(await createGuest(t.app, 'Outsider'));

      const results = await Promise.all(
        [room.code, 'ZZZZZZ', 'bad!'].map((roomCode) =>
          emitAck(outsider, 'room:subscribe', { roomCode }),
        ),
      );

      for (const ack of results) {
        expect(ack).toEqual({
          ok: false,
          error: { code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found.' },
        });
      }
    });

    it('rejects invalid payloads with VALIDATION_FAILED', async () => {
      const socket = await open(await createGuest(t.app, 'Host'));

      const ack = await emitAck(socket, 'room:subscribe', { roomCode: 42 } as never);

      expect(ack).toMatchObject({ ok: false, error: { code: ErrorCode.VALIDATION_FAILED } });
    });

    it('requires a subscription before sync:request, and answers time:ping', async () => {
      const socket = await open(await createGuest(t.app, 'Host'));

      expect(await emitAck(socket, 'sync:request', {})).toMatchObject({
        ok: false,
        error: { code: ErrorCode.NOT_SUBSCRIBED },
      });
      const before = Date.now();
      const pong = okData(await emitAck(socket, 'time:ping', { clientSentAt: before }));
      expect(pong.serverTime).toBeGreaterThanOrEqual(before);
    });
  });

  describe('five-player lobby', () => {
    it('broadcasts joins, shows everyone online and never exposes user IDs', async () => {
      const { code, members } = await lobby(4);

      const snapshot = okData(await emitAck(members[0]!.socket, 'sync:request', {}));
      expect(snapshot.players.map((p) => p.presence)).toEqual(Array(5).fill('ONLINE'));
      const serialized = JSON.stringify(snapshot);
      for (const m of members) expect(serialized).not.toContain(m.guest.user.id);

      // A sixth player is announced to all five subscribers.
      await api()
        .patch(`/api/v1/rooms/${code}/settings`)
        .set(...bearer(members[0]!.guest))
        .send({ maxPlayers: 6 })
        .expect(200);
      const late = await createGuest(t.app, 'Late');
      const announcements = members.map((m) =>
        nextEvent(m.socket, 'room:player-joined', (e) => e.player.displayName === 'Late'),
      );
      await join(late, code);
      const events = await Promise.all(announcements);
      for (const [event] of events) {
        expect(event.player).toMatchObject({
          displayName: 'Late',
          isHost: false,
          presence: 'ONLINE',
        });
        expect(Object.keys(event.player)).not.toContain('userId');
      }
    });

    it('does not re-announce an idempotent re-join', async () => {
      const { code, members } = await lobby(1);
      const joins = record(members[0]!.socket, 'room:player-joined');

      await join(members[1]!.guest, code);
      await delay(150);

      expect(joins).toHaveLength(0);
    });

    it('broadcasts settings changes to every member', async () => {
      const { code, members } = await lobby(4);
      const updates = members.map((m) => nextEvent(m.socket, 'room:settings-updated'));

      await api()
        .patch(`/api/v1/rooms/${code}/settings`)
        .set(...bearer(members[0]!.guest))
        .send({ roundCount: 12 })
        .expect(200);

      for (const [event] of await Promise.all(updates)) {
        expect(event.settings).toEqual({ maxPlayers: 5, roundCount: 12 });
      }
    });

    it('broadcasts a departing host and hands the role to the longest-present player', async () => {
      const { code, members } = await lobby(4);
      const [host, second, ...rest] = members as [Member, Member, ...Member[]];
      const watchers = [second, ...rest];
      const left = watchers.map((m) => nextEvent(m.socket, 'room:player-left'));
      const hostChanged = watchers.map((m) => nextEvent(m.socket, 'room:host-changed'));

      await api()
        .post(`/api/v1/rooms/${code}/leave`)
        .set(...bearer(host.guest))
        .expect(204);

      for (const [event] of await Promise.all(left)) expect(event.playerId).toBe(host.playerId);
      for (const [event] of await Promise.all(hostChanged)) {
        expect(event.hostPlayerId).toBe(second.playerId);
      }
      // The player who left no longer receives room traffic.
      const leftoverEvents = record(host.socket, 'room:settings-updated');
      await api()
        .patch(`/api/v1/rooms/${code}/settings`)
        .set(...bearer(second.guest))
        .send({ roundCount: 5 })
        .expect(200);
      await delay(150);
      expect(leftoverEvents).toHaveLength(0);
    });
  });

  describe('presence, reconnection and host migration', () => {
    it('does not broadcast a blip shorter than the debounce', async () => {
      const { code, members } = await lobby(2);
      const presenceEvents = record(members[0]!.socket, 'room:presence');

      members[1]!.socket.close();
      const again = await open(members[1]!.guest);
      const snapshot = await subscribe(again, code);
      await delay(DEBOUNCE_MS * 2);

      expect(presenceEvents).toHaveLength(0);
      expect(snapshot.players.find((p) => p.id === members[1]!.playerId)?.presence).toBe('ONLINE');
    });

    it('shows RECONNECTING inside the grace period and ONLINE after a reconnect, keeping the host', async () => {
      const { code, members } = await lobby(4);
      const [host, dropper] = members as [Member, Member];
      const hostChanges = record(host.socket, 'room:host-changed');

      const reconnecting = nextEvent(
        host.socket,
        'room:presence',
        (e) => e.playerId === dropper.playerId && e.presence === 'RECONNECTING',
      );
      dropper.socket.close();
      await reconnecting;

      const online = nextEvent(
        host.socket,
        'room:presence',
        (e) => e.playerId === dropper.playerId && e.presence === 'ONLINE',
      );
      const snapshot = await subscribe(await open(dropper.guest), code);
      await online;

      expect(snapshot.players.find((p) => p.id === dropper.playerId)?.presence).toBe('ONLINE');
      expect(snapshot.hostPlayerId).toBe(host.playerId);
      await delay(GRACE_MS);
      expect(hostChanges).toHaveLength(0);
    });

    it('marks a host AWAY after the grace period and migrates to the longest-present online player', async () => {
      const { members } = await lobby(4);
      const [host, second, third] = members as [Member, Member, Member];
      // The second-longest player is away too, so the role must skip them.
      second.socket.close();
      await nextEvent(
        third.socket,
        'room:presence',
        (e) => e.playerId === second.playerId && e.presence === 'AWAY',
      );

      const away = nextEvent(
        third.socket,
        'room:presence',
        (e) => e.playerId === host.playerId && e.presence === 'AWAY',
      );
      const hostChanged = nextEvent(third.socket, 'room:host-changed');
      host.socket.close();

      await away;
      const [event] = await hostChanged;
      expect(event.hostPlayerId).toBe(third.playerId);
      const snapshot = okData(await emitAck(third.socket, 'sync:request', {}));
      expect(snapshot.players.find((p) => p.id === third.playerId)?.isHost).toBe(true);
    });

    it('gives the host role to the first player back when everyone was away', async () => {
      const { code, members } = await lobby(1);
      const [host, other] = members as [Member, Member];
      other.socket.close();
      host.socket.close();
      await delay(GRACE_MS + 300);

      const snapshot = await subscribe(await open(other.guest), code);

      expect(snapshot.hostPlayerId).toBe(other.playerId);
    });

    it('marks a player who joined over REST but never connected AWAY after the grace period', async () => {
      const host = await createGuest(t.app, 'Host');
      const room = await createRoom(host);
      const hostSocket = await open(host);
      await subscribe(hostSocket, room.code);
      const ghost = await join(await createGuest(t.app, 'Ghost'), room.code);

      const [event] = await nextEvent(
        hostSocket,
        'room:presence',
        (e) => e.playerId === ghost.viewerPlayerId && e.presence === 'AWAY',
      );

      expect(event.presence).toBe('AWAY');
    });
  });

  describe('multiple tabs', () => {
    it('replaces the older connection without the player ever looking offline', async () => {
      const { code, members } = await lobby(1);
      const [host, player] = members as [Member, Member];
      const presenceEvents = record(host.socket, 'room:presence');
      const replaced = nextEvent(player.socket, 'session:replaced');
      const closed = new Promise<void>((resolve) =>
        player.socket.once('disconnect', () => resolve()),
      );

      const newTab = await open(player.guest);
      await subscribe(newTab, code);
      await replaced;
      await closed;
      await delay(GRACE_MS + 200);

      expect(presenceEvents).toHaveLength(0);
      const snapshot = okData(await emitAck(host.socket, 'sync:request', {}));
      expect(snapshot.players.find((p) => p.id === player.playerId)?.presence).toBe('ONLINE');
    });
  });

  describe('grace timers', () => {
    it('hands each due timer to exactly one concurrent claimer', async () => {
      const presence = t.app.get(PresenceService);
      const roomId = crypto.randomUUID();
      const players = Array.from({ length: 20 }, () => crypto.randomUUID());
      await Promise.all(players.map((p) => presence.markJoined(roomId, p)));

      const far = Date.now() + 60_000;
      const [a, b] = await Promise.all([
        presence.claimDue(far, 1000),
        presence.claimDue(far, 1000),
      ]);
      const mine = [...a, ...b].filter((d) => d.roomId === roomId);
      const keys = mine.map((d) => `${d.kind}:${d.playerId}`);

      expect(new Set(keys).size).toBe(keys.length);
      // The app's own sweeper may claim some first; nobody claims the same timer twice.
      expect(keys.length).toBeLessThanOrEqual(players.length * 2);
      expect(mine.filter((d) => d.kind === TimerKind.AWAY).length).toBeGreaterThan(0);
    });
  });
});
