import type {
  CreateRoomRequest,
  JoinRoomRequest,
  RoomPreviewDto,
  RoomSnapshotDto,
  UpdateRoomSettingsRequest,
} from '@pmp/shared';
import { authedFetch } from '../session/session-api';

const room = (code: string) => `/rooms/${encodeURIComponent(code)}`;

export const roomApi = {
  create: (request: CreateRoomRequest = {}) =>
    authedFetch<RoomSnapshotDto>('/rooms', { method: 'POST', body: JSON.stringify(request) }),
  /** Authenticated (and rate-limited) on the server to make room-code enumeration harder. */
  preview: (code: string) => authedFetch<RoomPreviewDto>(`${room(code)}/preview`),
  join: (code: string, request: JoinRoomRequest = {}) =>
    authedFetch<RoomSnapshotDto>(`${room(code)}/join`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  leave: (code: string) => authedFetch<void>(`${room(code)}/leave`, { method: 'POST' }),
  updateSettings: (code: string, request: UpdateRoomSettingsRequest) =>
    authedFetch<RoomSnapshotDto>(`${room(code)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    }),
};
