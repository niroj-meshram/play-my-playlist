import {
  applyDecorators,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { REDIS_CLIENT } from '../../redis/redis.constants.js';
import { PLAYER_RATE_LIMITS, type PlayerRateLimitName } from './rate-limits.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const PLAYER_RATE_LIMIT_KEY = 'pmp:player-rate-limit';

/**
 * Limits a route per authenticated player rather than per IP. Runs as a route guard, so
 * after the global AccessTokenGuard has set `request.auth`. Counters live in Redis and
 * are shared across API instances.
 */
@Injectable()
export class PlayerRateLimitGuard implements CanActivate {
  private readonly storage: RedisThrottlerStorage;
  private readonly enabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.storage = new RedisThrottlerStorage(redis);
    this.enabled = config.get('THROTTLE_ENABLED', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<PlayerRateLimitName | undefined>(
      PLAYER_RATE_LIMIT_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<Request>();
    if (!this.enabled || !name || !request.auth) return true;

    const { limit, ttl } = PLAYER_RATE_LIMITS[name];
    const record = await this.storage.increment(
      request.auth.userId,
      ttl,
      limit,
      ttl,
      `player-${name}`,
    );
    if (!record.isBlocked) return true;

    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(record.timeToBlockExpire));
    throw new ThrottlerException(
      'You are doing that too often. Please wait a moment and try again.',
    );
  }
}

/** Applies the named per-player limit from `PLAYER_RATE_LIMITS` to a route. */
export const PlayerRateLimit = (name: PlayerRateLimitName) =>
  applyDecorators(SetMetadata(PLAYER_RATE_LIMIT_KEY, name), UseGuards(PlayerRateLimitGuard));
