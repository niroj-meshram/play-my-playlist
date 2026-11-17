import type { ClientToServerEvents, ServerToClientEvents } from '@pmp/shared';
import type { Namespace, Socket } from 'socket.io';

/** Per-connection state. `userId` comes only from the verified handshake token. */
export interface SocketData {
  userId: string;
  /** Set by `room:subscribe`; a socket follows one room at a time. */
  subscription?: { roomId: string; roomCode: string; playerId: string };
  rate?: { windowStart: number; count: number };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no server-to-server events
type InterServerEvents = {};

export type GameNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const roomChannel = (roomId: string): string => `room:${roomId}`;
export const playerChannel = (playerId: string): string => `player:${playerId}`;
