import {
  PlayerPresence,
  type AvatarId,
  type GameSnapshotDto,
  type RoomPlayerDto,
  type RoomPreviewDto,
  type RoomSnapshotDto,
  type RoomStatus,
  type RoomVisibility,
} from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Fields loaded for a snapshot. `userId` is used to find the viewer and is never serialised. */
export interface RoomWithActivePlayers {
  id: string;
  code: string;
  status: RoomStatus;
  visibility: RoomVisibility;
  maxPlayers: number;
  roundCount: number;
  hostPlayerId: string | null;
  players: {
    id: string;
    userId: string;
    displayName: string;
    avatarId: string;
    joinedAt: Date;
    playlist: { status: string } | null;
  }[];
}

export const ROOM_SNAPSHOT_SELECT = {
  id: true,
  code: true,
  status: true,
  visibility: true,
  maxPlayers: true,
  roundCount: true,
  hostPlayerId: true,
  players: {
    where: { status: 'ACTIVE' },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatarId: true,
      joinedAt: true,
      // Privacy: only the status of a submission is ever read on this public path.
      playlist: { select: { status: true } },
    },
  },
} satisfies Prisma.RoomSelect;

export function toRoomSnapshotDto(
  room: RoomWithActivePlayers,
  viewerPlayerId: string,
  presence: ReadonlyMap<string, PlayerPresence>,
  game: GameSnapshotDto | null,
): RoomSnapshotDto {
  return {
    code: room.code,
    status: room.status,
    visibility: room.visibility,
    settings: { maxPlayers: room.maxPlayers, roundCount: room.roundCount },
    hostPlayerId: room.hostPlayerId,
    players: room.players.map((p): RoomPlayerDto => ({
      id: p.id,
      displayName: p.displayName,
      avatarId: p.avatarId as AvatarId,
      isHost: p.id === room.hostPlayerId,
      joinedAt: p.joinedAt.toISOString(),
      presence: presence.get(p.id) ?? PlayerPresence.AWAY,
      playlistReady: p.playlist?.status === 'READY',
    })),
    viewerPlayerId,
    game,
  };
}

export function toRoomPreviewDto(room: {
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  playerCount: number;
}): RoomPreviewDto {
  return {
    code: room.code,
    status: room.status,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
    joinable: room.status === 'LOBBY' && room.playerCount < room.maxPlayers,
  };
}
