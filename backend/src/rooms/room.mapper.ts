import type {
  AvatarId,
  RoomPlayerDto,
  RoomPreviewDto,
  RoomSnapshotDto,
  RoomStatus,
  RoomVisibility,
} from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Fields loaded for a snapshot. `userId` is used to find the viewer and is never serialised. */
export interface RoomWithActivePlayers {
  code: string;
  status: RoomStatus;
  visibility: RoomVisibility;
  maxPlayers: number;
  roundCount: number;
  hostPlayerId: string | null;
  players: { id: string; userId: string; displayName: string; avatarId: string; joinedAt: Date }[];
}

export const ROOM_SNAPSHOT_SELECT = {
  code: true,
  status: true,
  visibility: true,
  maxPlayers: true,
  roundCount: true,
  hostPlayerId: true,
  players: {
    where: { status: 'ACTIVE' },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, userId: true, displayName: true, avatarId: true, joinedAt: true },
  },
} satisfies Prisma.RoomSelect;

export function toRoomSnapshotDto(
  room: RoomWithActivePlayers,
  viewerPlayerId: string,
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
    })),
    viewerPlayerId,
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
