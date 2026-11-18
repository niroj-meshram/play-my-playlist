import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import type { FetchedPlaylist } from './youtube.types.js';

const TTL_SECONDS = 60 * 60;

/**
 * Caches the fetched, filtered playlist for an hour to save quota on retries and
 * replacements. Playability can change later; playback errors are handled in the game.
 */
@Injectable()
export class PlaylistCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(playlistId: string): Promise<FetchedPlaylist | null> {
    const raw = await this.redis.get(key(playlistId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FetchedPlaylist;
    } catch {
      return null;
    }
  }

  async has(playlistId: string): Promise<boolean> {
    return (await this.redis.exists(key(playlistId))) === 1;
  }

  async set(playlistId: string, playlist: FetchedPlaylist): Promise<void> {
    await this.redis.set(key(playlistId), JSON.stringify(playlist), 'EX', TTL_SECONDS);
  }
}

const key = (playlistId: string) => `pmp:yt:playlist:${playlistId}`;
