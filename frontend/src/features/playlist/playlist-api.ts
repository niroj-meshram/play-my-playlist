import type {
  GetMyPlaylistResponse,
  SubmitPlaylistRequest,
  SubmitPlaylistResponse,
} from '@pmp/shared';
import { authedFetch } from '../session/session-api';

const path = (code: string) => `/rooms/${encodeURIComponent(code)}/playlist`;

/** TanStack Query key of the viewer's own submission in a room. */
export const myPlaylistKey = (roomCode: string) => ['rooms', roomCode, 'my-playlist'] as const;

export const playlistApi = {
  getMine: (code: string) => authedFetch<GetMyPlaylistResponse>(path(code)),
  submit: (code: string, request: SubmitPlaylistRequest) =>
    authedFetch<SubmitPlaylistResponse>(path(code), {
      method: 'PUT',
      body: JSON.stringify(request),
    }),
  remove: (code: string) => authedFetch<void>(path(code), { method: 'DELETE' }),
};
