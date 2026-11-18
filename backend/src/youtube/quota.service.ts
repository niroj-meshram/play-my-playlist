import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

/** Worst case for one submission: 1 playlists + 4 playlistItems pages + 4 videos batches. */
export const SUBMISSION_QUOTA_ESTIMATE = 9;

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;

/** YouTube resets quotas at midnight Pacific time, so usage is counted per Pacific day. */
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Shared daily quota budget across all API instances (Redis). Every Data API call
 * consumes 1 unit; a real `quotaExceeded` from YouTube closes the day early.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly dailyUnits: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.dailyUnits = config.get('YOUTUBE_DAILY_QUOTA_UNITS', { infer: true });
  }

  async hasBudget(units: number, now = new Date()): Promise<boolean> {
    const day = quotaDay(now);
    const [used, exhausted] = await this.redis.mget(usedKey(day), exhaustedKey(day));
    return !exhausted && Number(used ?? 0) + units <= this.dailyUnits;
  }

  async consume(units: number, now = new Date()): Promise<void> {
    const key = usedKey(quotaDay(now));
    await this.redis.multi().incrby(key, units).expire(key, DAY_TTL_SECONDS).exec();
  }

  async markExhausted(now = new Date()): Promise<void> {
    this.logger.warn('YouTube reported the daily quota as exhausted');
    await this.redis.set(exhaustedKey(quotaDay(now)), '1', 'EX', DAY_TTL_SECONDS);
  }
}

const usedKey = (day: string) => `pmp:yt:quota:${day}:used`;
const exhaustedKey = (day: string) => `pmp:yt:quota:${day}:exhausted`;
