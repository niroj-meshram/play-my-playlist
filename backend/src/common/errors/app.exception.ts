import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@pmp/shared';

/**
 * Exception for expected, client-facing failures. The message and details are
 * returned to the client, so they must never contain private game data.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}
