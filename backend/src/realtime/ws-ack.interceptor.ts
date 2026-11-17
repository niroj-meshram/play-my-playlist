import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { WsAck } from '@pmp/shared';
import { catchError, map, of, type Observable } from 'rxjs';
import { toErrorResponse } from '../common/errors/to-error-response.js';

/**
 * Wraps every Socket.IO command result in the `{ ok, data | error }` acknowledgement.
 * Validation and domain errors become `{ ok: false }` with the same stable codes as REST;
 * unexpected errors are logged and returned without internals.
 */
@Injectable()
export class WsAckInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WsAckInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<WsAck<unknown>> {
    return next.handle().pipe(
      map((data: unknown): WsAck<unknown> => ({ ok: true, data })),
      catchError((error: unknown) => {
        const { status, body } = toErrorResponse(error, '');
        if (status >= 500) {
          const event = context.switchToWs().getPattern();
          const detail = error instanceof Error ? error.stack : String(error);
          this.logger.error(`Socket command ${event} failed`, detail);
        }
        return of<WsAck<unknown>>({
          ok: false,
          error: { code: body.error.code, message: body.error.message },
        });
      }),
    );
  }
}
