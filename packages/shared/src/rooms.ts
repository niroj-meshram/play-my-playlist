import type { AvatarId } from './auth.js';

export const ROOM_CODE_LENGTH = 6;
/** Unambiguous characters only (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const RoomStatus = {
  LOBBY: 'LOBBY',
  IN_GAME: 'IN_GAME',
  CLOSED: 'CLOSED',
} as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

export const RoomVisibility = { INVITE_ONLY: 'INVITE_ONLY' } as const;
export type RoomVisibility = (typeof RoomVisibility)[keyof typeof RoomVisibility];

export interface RoomSettingsDto {
  maxPlayers: number;
  roundCount: number;
}

export interface CreateRoomRequest {
  settings?: Partial<RoomSettingsDto>;
}

export interface JoinRoomRequest {
  /** Defaults to the user's profile name. Must be unique (case-insensitive) among active players. */
  displayName?: string;
  avatarId?: AvatarId;
}

export type UpdateRoomSettingsRequest = Partial<RoomSettingsDto>;

/** Minimal information shown on the join screen. */
export interface RoomPreviewDto {
  code: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  joinable: boolean;
}

export interface RoomPlayerDto {
  id: string;
  displayName: string;
  avatarId: AvatarId;
  isHost: boolean;
  joinedAt: string;
}

/** Full lobby state, visible to active members only. Contains no private game data. */
export interface RoomSnapshotDto {
  code: string;
  status: RoomStatus;
  visibility: RoomVisibility;
  settings: RoomSettingsDto;
  hostPlayerId: string | null;
  players: RoomPlayerDto[];
  /** The requesting member's own player ID. */
  viewerPlayerId: string;
}
