import { CSRF_HEADER, type AccessTokenResponse, type GuestSessionRequest } from '@pmp/shared';
import { apiFetch } from '@/lib/api-client';
import { useSessionStore } from './session-store';

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;

let refreshInFlight: Promise<string> | null = null;

export async function createGuestSession(request: GuestSessionRequest): Promise<void> {
  const response = await apiFetch<AccessTokenResponse>('/auth/guest', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  useSessionStore.getState().setSession(response);
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<string> {
  refreshInFlight ??= apiFetch<AccessTokenResponse>('/auth/refresh', {
    method: 'POST',
    headers: { [CSRF_HEADER]: '1' },
  })
    .then((response) => {
      useSessionStore.getState().setSession(response);
      return response.accessToken;
    })
    .catch((error: unknown) => {
      useSessionStore.getState().setAnonymous();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** A valid access token, refreshed when it is about to expire. */
export async function getFreshToken(): Promise<string> {
  const { accessToken, expiresAt } = useSessionStore.getState();
  if (accessToken && expiresAt - Date.now() > REFRESH_MARGIN_MS) return accessToken;
  return refreshSession();
}

/** `apiFetch` with the session's bearer token. */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getFreshToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return apiFetch<T>(path, { ...init, headers });
}
