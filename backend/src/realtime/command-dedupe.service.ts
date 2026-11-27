import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@pmp/shared';
import type { Redis } from 'ioredis';
import { AppException } from '../common/errors/app.exception.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

const TTL_MS = 10 * 60_000;
const PENDING = '__pending__';
const POLL_MS = 50;
const MAX_WAIT_MS = 5_000;

/**
 * Exactly-once execution of socket commands that carry a `clientRequestId`
 * (docs/architecture.md §9). The first request runs and its result is stored for 10 min;
 * a retry with the same ID gets the stored result instead of running again. Keys are
 * scoped to the user, so one player cannot replay another player's request.
 */
@Injectable()
export class CommandDedupeService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async once<T>(userId: string, clientRequestId: string, run: () => Promise<T>): Promise<T> {
    const key = `pmp:cmd:${userId}:${clientRequestId}`;
    const claimed = await this.redis.set(key, PENDING, 'PX', TTL_MS, 'NX');
    if (claimed !== 'OK') return this.waitForResult<T>(key);

    try {
      const result = await run();
      await this.redis.set(key, JSON.stringify({ result }), 'PX', TTL_MS);
      return result;
    } catch (error) {
      // A failed command may be retried with the same ID.
      await this.redis.del(key);
      throw error;
    }
  }

  private async waitForResult<T>(key: string): Promise<T> {
    for (let waited = 0; waited < MAX_WAIT_MS; waited += POLL_MS) {
      const value = await this.redis.get(key);
      if (value === null) break;
      if (value !== PENDING) return (JSON.parse(value) as { result: T }).result;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    throw new AppException(
      ErrorCode.CONFLICT,
      'This request is already being processed. Please try again.',
      HttpStatus.CONFLICT,
    );
  }
}
