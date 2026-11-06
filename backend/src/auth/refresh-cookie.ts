import type { CookieOptions } from 'express';

export const REFRESH_COOKIE = 'pmp_refresh';

/** Scoped to the auth routes so the refresh token is never sent anywhere else. */
export function refreshCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}
