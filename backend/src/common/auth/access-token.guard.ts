import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccessTokenVerifier, unauthorized } from './access-token.verifier.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/** Global guard: every route requires a valid Bearer access token unless marked `@Public()`. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly verifier: AccessTokenVerifier,
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
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw unauthorized();
    }
    request.auth = await this.verifier.verify(token);
    return true;
  }
}
