import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE_MS = 60_000;

type Limit = Pick<ThrottlerOptions, 'limit' | 'ttl'>;

/**
 * Per-IP limits. Use with `@Throttle({ default: RATE_LIMITS.x })`. Players at one party
 * usually share a Wi-Fi IP, so per-IP limits on player actions are abuse ceilings only;
 * the per-player limit lives in `PLAYER_RATE_LIMITS`.
 */
export const RATE_LIMITS = {
  global: { limit: 120, ttl: MINUTE_MS },
  createGuest: { limit: 10, ttl: MINUTE_MS },
  refreshSession: { limit: 30, ttl: MINUTE_MS },
  createRoom: { limit: 10, ttl: MINUTE_MS },
  previewRoom: { limit: 30, ttl: MINUTE_MS },
  joinRoom: { limit: 20, ttl: MINUTE_MS },
  submitPlaylist: { limit: 30, ttl: MINUTE_MS },
} as const satisfies Record<string, Limit>;

/** Per-authenticated-player limits. Use with `@PlayerRateLimit('name')`. */
export const PLAYER_RATE_LIMITS = {
  submitPlaylist: { limit: 6, ttl: MINUTE_MS },
} as const satisfies Record<string, Limit>;

export type PlayerRateLimitName = keyof typeof PLAYER_RATE_LIMITS;
