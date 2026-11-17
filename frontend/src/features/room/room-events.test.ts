import { describe, expect, it } from '@jest/globals';
import type { RoomPlayerDto, RoomSnapshotDto } from '@pmp/shared';
import {
  applyHostChanged,
  applyPlayerJoined,
  applyPlayerLeft,
  applyPresence,
  applySettings,
} from './room-events';

function player(
  id: string,
  joinedAt: string,
  overrides: Partial<RoomPlayerDto> = {},
): RoomPlayerDto {
  return {
    id,
    displayName: id,
    avatarId: 'avatar-01',
    isHost: false,
    joinedAt,
    presence: 'ONLINE',
    ...overrides,
  };
}

const room: RoomSnapshotDto = {
  code: 'ABC234',
  status: 'LOBBY',
  visibility: 'INVITE_ONLY',
  settings: { maxPlayers: 5, roundCount: 10 },
  hostPlayerId: 'a',
  players: [
    player('a', '2026-01-01T00:00:00Z', { isHost: true }),
    player('b', '2026-01-01T00:01:00Z'),
  ],
  viewerPlayerId: 'b',
};

describe('room event reducers', () => {
  it('adds a joined player in join order, once', () => {
    const early = player('c', '2026-01-01T00:00:30Z');

    const once = applyPlayerJoined(room, { player: early });
    const twice = applyPlayerJoined(once, { player: early });

    expect(once.players.map((p) => p.id)).toEqual(['a', 'c', 'b']);
    expect(twice).toEqual(once);
  });

  it('removes a player who left and ignores unknown players', () => {
    const after = applyPlayerLeft(room, { playerId: 'b' });

    expect(after.players.map((p) => p.id)).toEqual(['a']);
    expect(applyPlayerLeft(after, { playerId: 'b' })).toBe(after);
  });

  it('updates presence of one player only', () => {
    const after = applyPresence(room, { playerId: 'b', presence: 'RECONNECTING' });

    expect(after.players.map((p) => p.presence)).toEqual(['ONLINE', 'RECONNECTING']);
    expect(applyPresence(after, { playerId: 'b', presence: 'RECONNECTING' })).toEqual(after);
  });

  it('moves the host badge with the host', () => {
    const after = applyHostChanged(room, { hostPlayerId: 'b' });

    expect(after.hostPlayerId).toBe('b');
    expect(after.players.map((p) => p.isHost)).toEqual([false, true]);
  });

  it('replaces settings', () => {
    expect(applySettings(room, { settings: { maxPlayers: 8, roundCount: 12 } }).settings).toEqual({
      maxPlayers: 8,
      roundCount: 12,
    });
  });
});
