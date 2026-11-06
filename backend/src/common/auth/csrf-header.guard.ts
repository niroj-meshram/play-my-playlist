import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { CSRF_HEADER, ErrorCode } from '@pmp/shared';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception.js';

/**
 * Required on cookie-authenticated endpoints. Cross-site HTML forms cannot add custom
 * headers, and cross-origin scripts trigger a CORS preflight that the allow-list rejects.
 */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header(CSRF_HEADER) !== '1') {
      throw new AppException(ErrorCode.FORBIDDEN, 'Missing CSRF header.', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
