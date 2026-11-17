import {
  HttpStatus,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ErrorCode } from '@pmp/shared';
import type { Observable } from 'rxjs';
import { AppException } from '../common/errors/app.exception.js';
import type { GameSocket } from './socket.types.js';

export const WS_RATE_LIMIT = { limit: 30, windowMs: 10_000 } as const;

/**
 * Per-connection command budget. Over the limit, commands are rejected; at twice the
 * limit the socket is disconnected. Kept in memory: a connection lives on one instance.
 */
@Injectable()
export class WsRateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WsRateLimitInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const socket = context.switchToWs().getClient<GameSocket>();
    const now = Date.now();
    const rate = socket.data.rate;
    if (!rate || now - rate.windowStart >= WS_RATE_LIMIT.windowMs) {
      socket.data.rate = { windowStart: now, count: 1 };
    } else {
      rate.count += 1;
      if (rate.count > WS_RATE_LIMIT.limit * 2) {
        this.logger.warn(`Disconnecting socket of user ${socket.data.userId}: rate limit abuse`);
        socket.disconnect(true);
      }
      if (rate.count > WS_RATE_LIMIT.limit) {
        throw new AppException(
          ErrorCode.RATE_LIMITED,
          'Too many requests. Please slow down and try again shortly.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return next.handle();
  }
}
