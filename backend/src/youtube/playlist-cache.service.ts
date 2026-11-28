import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import type { FetchedPlaylist } from './youtube.types.js';

const TTL_SECONDS = 60 * 60;

/**
 * Caches a fetched, filtered playlist for the retries of ONE submission (job failures,
 * recovery), keyed by its submissionId. A new submission or replacement always reads
 * YouTube again, so edits a player makes to their playlist are never hidden by the cache.
 */
@Injectable()
export class PlaylistCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(playlistId: string, submissionId: string): Promise<FetchedPlaylist | null> {
    const raw = await this.redis.get(key(playlistId, submissionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FetchedPlaylist;
    } catch {
      return null;
    }
  }

  async set(playlistId: string, submissionId: string, playlist: FetchedPlaylist): Promise<void> {
    await this.redis.set(
      key(playlistId, submissionId),
      JSON.stringify(playlist),
      'EX',
      TTL_SECONDS,
    );
  }
}

const key = (playlistId: string, submissionId: string) =>
  `pmp:yt:playlist:${playlistId}:${submissionId}`;
