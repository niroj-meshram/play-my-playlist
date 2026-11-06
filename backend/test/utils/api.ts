import { CSRF_HEADER, type AccessTokenResponse, type AvatarId } from '@pmp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

export interface Guest {
  accessToken: string;
  /** `name=value` pair for the refresh cookie, ready for a Cookie header. */
  refreshCookie: string;
  user: AccessTokenResponse['user'];
}

export const REFRESH_COOKIE_NAME = 'pmp_refresh';

export function http(app: NestExpressApplication) {
  return request(app.getHttpServer());
}

export function bearer(guest: Guest): [string, string] {
  return ['Authorization', `Bearer ${guest.accessToken}`];
}

export const csrf: [string, string] = [CSRF_HEADER, '1'];

/** Extracts `pmp_refresh=<value>` from a response's Set-Cookie headers, if present. */
export function refreshCookieFrom(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  const pair = match?.split(';')[0];
  return pair && pair !== `${REFRESH_COOKIE_NAME}=` ? pair : undefined;
}

export async function createGuest(
  app: NestExpressApplication,
  displayName: string,
  avatarId: AvatarId = 'avatar-01',
): Promise<Guest> {
  const response = await http(app)
    .post('/api/v1/auth/guest')
    .send({ displayName, avatarId })
    .expect(201);
  const body = response.body as AccessTokenResponse;
  const refreshCookie = refreshCookieFrom(response.headers['set-cookie']);
  if (!refreshCookie) throw new Error('guest session did not set a refresh cookie');
  return { accessToken: body.accessToken, refreshCookie, user: body.user };
}
