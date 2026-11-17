import { describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@pmp/shared';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  AccessTokenVerifier,
} from './access-token.verifier.js';

const SECRET = 'x'.repeat(48);

function sign(
  payload: object,
  options: { secret?: string; issuer?: string; expiresIn?: number } = {},
) {
  return new JwtService().signAsync(payload, {
    secret: options.secret ?? SECRET,
    algorithm: 'HS256',
    issuer: options.issuer ?? ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: options.expiresIn ?? 60,
  });
}

describe('AccessTokenVerifier', () => {
  const verifier = new AccessTokenVerifier(new JwtService({ secret: SECRET }));

  it('returns the identity of a valid token', async () => {
    const token = await sign({ sub: 'user-1', sid: 'session-1' });

    await expect(verifier.verify(token)).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it.each([
    ['a missing token', undefined],
    ['a non-string token', 42],
    ['an empty token', ''],
    ['garbage', 'not-a-jwt'],
  ])('rejects %s', async (_label, token) => {
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });

  it('rejects tokens with a wrong signature, issuer, expiry or claims', async () => {
    const tokens = await Promise.all([
      sign({ sub: 'u', sid: 's' }, { secret: 'y'.repeat(48) }),
      sign({ sub: 'u', sid: 's' }, { issuer: 'someone-else' }),
      sign({ sub: 'u', sid: 's' }, { expiresIn: -10 }),
      sign({ sub: 'u' }),
    ]);

    for (const token of tokens) {
      await expect(verifier.verify(token)).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
    }
  });
});
