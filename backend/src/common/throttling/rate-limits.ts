import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE_MS = 60_000;

/** Per-IP limits. Use with `@Throttle({ default: RATE_LIMITS.x })`. */
export const RATE_LIMITS = {
  global: { limit: 120, ttl: MINUTE_MS },
  createGuest: { limit: 10, ttl: MINUTE_MS },
  refreshSession: { limit: 30, ttl: MINUTE_MS },
  createRoom: { limit: 10, ttl: MINUTE_MS },
  previewRoom: { limit: 30, ttl: MINUTE_MS },
  joinRoom: { limit: 20, ttl: MINUTE_MS },
} as const satisfies Record<string, Pick<ThrottlerOptions, 'limit' | 'ttl'>>;
