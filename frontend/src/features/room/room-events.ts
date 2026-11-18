import type {
  HostChangedEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlaylistSubmissionUpdatedEvent,
  PresenceChangedEvent,
  RoomSnapshotDto,
  SettingsUpdatedEvent,
} from '@pmp/shared';

/*
 * Pure, idempotent patches applied to the server's lobby snapshot. Receiving an
 * event twice, or one already reflected in a fresh snapshot, leaves the state unchanged.
 */

export function applyPlayerJoined(
  room: RoomSnapshotDto,
  { player }: PlayerJoinedEvent,
): RoomSnapshotDto {
  const others = room.players.filter((p) => p.id !== player.id);
  const players = [...others, player].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id),
  );
  return { ...room, players };
}

export function applyPlayerLeft(
  room: RoomSnapshotDto,
  { playerId }: PlayerLeftEvent,
): RoomSnapshotDto {
  if (!room.players.some((p) => p.id === playerId)) return room;
  return { ...room, players: room.players.filter((p) => p.id !== playerId) };
}

export function applyPresence(
  room: RoomSnapshotDto,
  { playerId, presence }: PresenceChangedEvent,
): RoomSnapshotDto {
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, presence } : p)),
  };
}

export function applyHostChanged(
  room: RoomSnapshotDto,
  { hostPlayerId }: HostChangedEvent,
): RoomSnapshotDto {
  return {
    ...room,
    hostPlayerId,
    players: room.players.map((p) => ({ ...p, isHost: p.id === hostPlayerId })),
  };
}

export function applySettings(
  room: RoomSnapshotDto,
  { settings }: SettingsUpdatedEvent,
): RoomSnapshotDto {
  return { ...room, settings };
}

export function applyPlaylistReady(
  room: RoomSnapshotDto,
  { playerId, ready }: PlaylistSubmissionUpdatedEvent,
): RoomSnapshotDto {
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, playlistReady: ready } : p)),
  };
}
