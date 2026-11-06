import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@pmp/shared';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import {
  bearer,
  createGuest,
  csrf,
  http,
  refreshCookieFrom,
  REFRESH_COOKIE_NAME,
} from './utils/api.js';
import { createTestApp, type TestApp } from './utils/test-app.js';

describe('Auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t.app.close();
  });

  const refresh = (cookie: string) =>
    http(t.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set(...csrf);

  describe('POST /auth/guest', () => {
    it('creates a guest, returns an access token and sets a hardened refresh cookie', async () => {
      const response = await http(t.app)
        .post('/api/v1/auth/guest')
        .send({ displayName: '  DJ   Niro ', avatarId: 'avatar-03' })
        .expect(201);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        expiresAt: expect.any(String),
        user: { id: expect.any(String), displayName: 'DJ Niro', avatarId: 'avatar-03' },
      });
      expect(response.headers['cache-control']).toBe('no-store');

      const setCookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []).join('\n');
      expect(setCookie).toMatch(/pmp_refresh=[^;]+; Max-Age=\d+; Path=\/api\/v1\/auth;/);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
    });

    it('stores only a hash of the refresh token', async () => {
      const guest = await createGuest(t.app, 'Asha');
      const token = decodeURIComponent(guest.refreshCookie.split('=')[1]!);
      const sessions = await t.prisma.authSession.findMany();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.refreshTokenHash).toBe(hashRefreshToken(token));
      expect(JSON.stringify(sessions)).not.toContain(token);
    });

    it.each([
      [{ displayName: '', avatarId: 'avatar-01' }, 'displayName'],
      [{ displayName: 'Ok', avatarId: 'avatar-99' }, 'avatarId'],
      [{ displayName: 'Ok', avatarId: 'avatar-01', isAdmin: true }, 'isAdmin'],
    ])('rejects invalid input %j', async (body, field) => {
      const response = await http(t.app).post('/api/v1/auth/guest').send(body).expect(400);

      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    });
  });

  describe('access tokens', () => {
    it('protects /me and returns the profile with a valid token', async () => {
      const guest = await createGuest(t.app, 'Ben');

      const anonymous = await http(t.app).get('/api/v1/me').expect(401);
      expect(anonymous.body.error.code).toBe(ErrorCode.UNAUTHORIZED);

      const me = await http(t.app)
        .get('/api/v1/me')
        .set(...bearer(guest))
        .expect(200);
      expect(me.body).toEqual(guest.user);
    });

    it('rejects tampered tokens and tokens signed with another secret', async () => {
      const guest = await createGuest(t.app, 'Cara');
      const tampered = `${guest.accessToken.slice(0, -2)}xx`;
      const forged = await new JwtService().signAsync(
        { sub: guest.user.id, sid: 'x' },
        {
          secret: 'another-secret-that-is-long-enough-000000',
          issuer: 'pmp-api',
          audience: 'pmp-web',
        },
      );

      for (const token of [tampered, forged, 'not-a-jwt']) {
        await http(t.app).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
      }
    });

    it('updates the profile with normalised values', async () => {
      const guest = await createGuest(t.app, 'Dev');

      const response = await http(t.app)
        .patch('/api/v1/me')
        .set(...bearer(guest))
        .send({ displayName: ' Dev​  Kumar ', avatarId: 'avatar-07' })
        .expect(200);

      expect(response.body).toEqual({
        id: guest.user.id,
        displayName: 'Dev Kumar',
        avatarId: 'avatar-07',
      });
    });
  });

  describe('POST /auth/refresh', () => {
    it('requires the CSRF header', async () => {
      const guest = await createGuest(t.app, 'Eli');

      const response = await http(t.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', guest.refreshCookie)
        .expect(403);
      expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('rotates the refresh token and issues a new access token', async () => {
      const guest = await createGuest(t.app, 'Fay');

      const response = await refresh(guest.refreshCookie).expect(200);
      const rotated = refreshCookieFrom(response.headers['set-cookie']);

      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(guest.refreshCookie);
      expect(response.body.user).toEqual(guest.user);
      await http(t.app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('accepts the just-rotated token during the grace period without rotating again', async () => {
      const guest = await createGuest(t.app, 'Gus');
      await refresh(guest.refreshCookie).expect(200);

      const response = await refresh(guest.refreshCookie).expect(200);

      expect(refreshCookieFrom(response.headers['set-cookie'])).toBeUndefined();
      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('handles concurrent refreshes with one cookie: all succeed, exactly one rotates', async () => {
      const guest = await createGuest(t.app, 'Hana');

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => refresh(guest.refreshCookie)),
      );

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      const rotations = responses.filter((r) => refreshCookieFrom(r.headers['set-cookie']));
      expect(rotations).toHaveLength(1);
    });

    it('revokes the session when an outdated token is replayed', async () => {
      const guest = await createGuest(t.app, 'Ivan');
      const second = refreshCookieFrom((await refresh(guest.refreshCookie)).headers['set-cookie'])!;
      const third = refreshCookieFrom((await refresh(second)).headers['set-cookie'])!;

      // The original token is two rotations old: treated as theft.
      const replay = await refresh(guest.refreshCookie).expect(401);
      expect(replay.body.error.code).toBe(ErrorCode.SESSION_INVALID);
      expect(([] as string[]).concat(replay.headers['set-cookie'] ?? []).join()).toContain(
        `${REFRESH_COOKIE_NAME}=;`,
      );

      // The legitimate holder's latest token no longer works either.
      await refresh(third).expect(401);
    });

    it('rejects a missing or malformed cookie', async () => {
      await http(t.app)
        .post('/api/v1/auth/refresh')
        .set(...csrf)
        .expect(401);
      await refresh(`${REFRESH_COOKIE_NAME}=garbage`).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const guest = await createGuest(t.app, 'Jo');

      const response = await http(t.app)
        .post('/api/v1/auth/logout')
        .set('Cookie', guest.refreshCookie)
        .set(...csrf)
        .expect(204);

      expect(([] as string[]).concat(response.headers['set-cookie'] ?? []).join()).toContain(
        `${REFRESH_COOKIE_NAME}=;`,
      );
      await refresh(guest.refreshCookie).expect(401);
    });
  });
});
