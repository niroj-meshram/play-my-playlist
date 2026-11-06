import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@pmp/shared';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception.js';
import type { AuthContext } from './auth-context.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export const ACCESS_TOKEN_ISSUER = 'pmp-api';
export const ACCESS_TOKEN_AUDIENCE = 'pmp-web';

interface AccessTokenPayload {
  sub?: unknown;
  sid?: unknown;
}

/** Global guard: every route requires a valid Bearer access token unless marked `@Public()`. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    request.auth = await this.authenticate(request.header('authorization'));
    return true;
  }

  private async authenticate(header: string | undefined): Promise<AuthContext> {
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
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

function unauthorized(): AppException {
  return new AppException(
    ErrorCode.UNAUTHORIZED,
    'Authentication required.',
    HttpStatus.UNAUTHORIZED,
  );
}
