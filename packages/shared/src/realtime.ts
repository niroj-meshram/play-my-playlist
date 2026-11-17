import type { ErrorCode } from './errors.js';
import type { RoomPlayerDto, RoomSettingsDto, RoomSnapshotDto } from './rooms.js';

/** Socket.IO namespace for all room and game traffic. */
export const GAME_NAMESPACE = '/game';

/**
 * Public connection state of a room player (docs/architecture.md §9–10).
 * - ONLINE: connected, or disconnected for less than the presence debounce (~5 s).
 * - RECONNECTING: disconnected, still inside the 30 s grace period.
 * - AWAY: disconnected past the grace period (or never connected).
 * ONLINE and RECONNECTING players count as online for voting (D5).
 */
export const PlayerPresence = {
  ONLINE: 'ONLINE',
  RECONNECTING: 'RECONNECTING',
  AWAY: 'AWAY',
} as const;
export type PlayerPresence = (typeof PlayerPresence)[keyof typeof PlayerPresence];

/** Error payload carried in a failed acknowledgement. */
export interface WsError {
  code: ErrorCode;
  message: string;
}

/** Every client→server command is acknowledged with this envelope. */
export type WsAck<T> = { ok: true; data: T } | { ok: false; error: WsError };
export type AckCallback<T> = (response: WsAck<T>) => void;

/** Sent in the handshake: `io(url, { auth: { token } })`. */
export interface SocketAuthPayload {
  token: string;
}

export interface RoomSubscribeRequest {
  roomCode: string;
}

export interface TimePingRequest {
  clientSentAt: number;
}

export interface TimePingResponse {
  /** Server clock in epoch milliseconds. */
  serverTime: number;
}

export interface PlayerJoinedEvent {
  player: RoomPlayerDto;
}

export interface PlayerLeftEvent {
  playerId: string;
}

export interface PresenceChangedEvent {
  playerId: string;
  presence: PlayerPresence;
}

export interface HostChangedEvent {
  hostPlayerId: string;
}

export interface SettingsUpdatedEvent {
  settings: RoomSettingsDto;
}

export interface ClientToServerEvents {
  'room:subscribe': (payload: RoomSubscribeRequest, ack: AckCallback<RoomSnapshotDto>) => void;
  'sync:request': (payload: Record<string, never>, ack: AckCallback<RoomSnapshotDto>) => void;
  'time:ping': (payload: TimePingRequest, ack: AckCallback<TimePingResponse>) => void;
}

export interface ServerToClientEvents {
  'room:player-joined': (event: PlayerJoinedEvent) => void;
  'room:player-left': (event: PlayerLeftEvent) => void;
  'room:presence': (event: PresenceChangedEvent) => void;
  'room:host-changed': (event: HostChangedEvent) => void;
  'room:settings-updated': (event: SettingsUpdatedEvent) => void;
  /** This connection was replaced by a newer tab or device of the same player. */
  'session:replaced': () => void;
}
