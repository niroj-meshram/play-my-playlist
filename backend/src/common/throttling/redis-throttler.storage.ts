import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants.js';

/** Mirrors @nestjs/throttler's record shape (not exported from the package root). */
export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Fixed-window counter with a block period, executed atomically in Redis so limits
 * hold across multiple API instances. Returns {hits, windowTtlMs, blocked, blockTtlMs}.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local windowTtl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, windowTtl, 1, tonumber(ARGV[3])}
end
return {hits, windowTtl, 0, 0}
`;

const toSeconds = (ms: number): number => Math.ceil(ms / 1000);

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // Hash tag keeps both keys in one cluster slot.
    const base = `throttle:{${throttlerName}:${key}}`;
    const [hits, windowTtl, blocked, blockTtl] = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      blockDuration > 0 ? blockDuration : ttl,
    )) as [number, number, number, number];

    return {
      totalHits: hits,
      timeToExpire: toSeconds(windowTtl),
      isBlocked: blocked === 1,
      timeToBlockExpire: toSeconds(blockTtl),
    };
  }
}
