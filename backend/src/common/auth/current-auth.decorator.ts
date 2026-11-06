import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';

/** Injects the verified identity. Only usable on routes protected by the access-token guard. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) {
      throw new Error('CurrentAuth used on a route without authentication');
    }
    return request.auth;
  },
);
