import type { Prisma, RoomStatus } from '../generated/prisma/client.js';
import { roomNotFound } from './room-code.pipe.js';

export interface LockedRoom {
  id: string;
  status: RoomStatus;
  maxPlayers: number;
  roundCount: number;
  hostPlayerId: string | null;
}

/**
 * Row lock (SELECT … FOR UPDATE) serialising membership, settings and playlist changes
 * of one room. Closed and unknown rooms get the uniform room 404.
 */
export async function lockRoomByCode(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<LockedRoom> {
  const rows = await tx.$queryRaw<LockedRoom[]>`
    SELECT "id", "status", "maxPlayers", "roundCount", "hostPlayerId"
    FROM "Room"
    WHERE "code" = ${code} AND "status" <> 'CLOSED'
    FOR UPDATE`;
  const room = rows[0];
  if (!room) throw roomNotFound();
  return room;
}

/** Same lock by room ID, for callers that already resolved the room (socket commands). */
export async function lockRoomById(
  tx: Prisma.TransactionClient,
  roomId: string,
): Promise<LockedRoom> {
  const rows = await tx.$queryRaw<LockedRoom[]>`
    SELECT "id", "status", "maxPlayers", "roundCount", "hostPlayerId"
    FROM "Room"
    WHERE "id" = ${roomId}::uuid AND "status" <> 'CLOSED'
    FOR UPDATE`;
  const room = rows[0];
  if (!room) throw roomNotFound();
  return room;
}
