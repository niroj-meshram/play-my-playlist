import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@pmp/shared';
import { AppException } from '../errors/app.exception.js';
import type { AuthContext } from './auth-context.js';

export const ACCESS_TOKEN_ISSUER = 'pmp-api';
export const ACCESS_TOKEN_AUDIENCE = 'pmp-web';

interface AccessTokenPayload {
  sub?: unknown;
  sid?: unknown;
}

/** Verifies access JWTs for both HTTP requests and Socket.IO handshakes. */
@Injectable()
export class AccessTokenVerifier {
  constructor(private readonly jwt: JwtService) {}

  /** Returns the identity in a valid token; throws `UNAUTHORIZED` for anything else. */
  async verify(token: unknown): Promise<AuthContext> {
    if (typeof token !== 'string' || token.length === 0) {
      throw unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload & object>(token, {
        algorithms: ['HS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      });
    } catch {
      throw unauthorized();
    }

    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw unauthorized();
    }
    return { userId: payload.sub, sessionId: payload.sid };
  }
}

export function unauthorized(): AppException {
  return new AppException(
    ErrorCode.UNAUTHORIZED,
    'Authentication required.',
    HttpStatus.UNAUTHORIZED,
  );
}
