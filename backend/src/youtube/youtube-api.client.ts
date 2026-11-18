import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { QuotaService } from './quota.service.js';
import {
  YoutubeClient,
  YoutubeError,
  type YtPage,
  type YtPlaylist,
  type YtPlaylistItem,
  type YtVideo,
} from './youtube.types.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;
const TIMEOUT_MS = 10_000;
const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded']);

interface ApiErrorBody {
  error?: { code?: number; errors?: { reason?: string }[] };
}

/** YouTube Data API v3 over `fetch`. Each request costs 1 quota unit. */
@Injectable()
export class YoutubeApiClient extends YoutubeClient {
  private readonly logger = new Logger(YoutubeApiClient.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly quota: QuotaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    super();
    this.apiKey = config.get('YOUTUBE_API_KEY', { infer: true });
    if (!this.apiKey) {
      this.logger.warn('YOUTUBE_API_KEY is not set: playlist submissions will fail');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async getPlaylist(playlistId: string): Promise<YtPlaylist | null> {
    const page = await this.request<YtPage<YtPlaylist>>('playlists', {
      part: 'snippet',
      id: playlistId,
      maxResults: '1',
    });
    return page?.items[0] ?? null;
  }

  async listPlaylistItems(playlistId: string, pageToken?: string): Promise<YtPage<YtPlaylistItem>> {
    const page = await this.request<YtPage<YtPlaylistItem>>('playlistItems', {
      part: 'snippet',
      playlistId,
      maxResults: String(PAGE_SIZE),
      ...(pageToken ? { pageToken } : {}),
    });
    if (!page) throw new YoutubeError('PLAYLIST_NOT_FOUND', 'Playlist items not found');
    return {
      items: page.items ?? [],
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
    };
  }

  async listVideos(videoIds: readonly string[]): Promise<YtVideo[]> {
    if (videoIds.length === 0) return [];
    if (videoIds.length > PAGE_SIZE) throw new Error(`listVideos accepts at most ${PAGE_SIZE} IDs`);
    const page = await this.request<YtPage<YtVideo>>('videos', {
      part: 'snippet,status,contentDetails',
      id: videoIds.join(','),
      maxResults: String(PAGE_SIZE),
    });
    return page?.items ?? [];
  }

  /** Returns `null` on 404. Retries once on network errors and 5xx. */
  private async request<T>(resource: string, params: Record<string, string>): Promise<T | null> {
    if (!this.apiKey) {
      throw new YoutubeError('YOUTUBE_UNAVAILABLE', 'YouTube is not configured on this server');
    }
    const url = new URL(`${API_BASE}/${resource}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', this.apiKey);

    for (let attempt = 1; ; attempt += 1) {
      await this.quota.consume(1);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt < 2) continue;
        this.logger.warn(`YouTube ${resource} request failed: ${describe(error)}`);
        throw new YoutubeError('YOUTUBE_UNAVAILABLE', `YouTube ${resource} request failed`);
      }

      if (response.ok) return (await response.json()) as T;
      if (response.status === 404) return null;

      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      const reasons = body.error?.errors?.map((e) => e.reason ?? '') ?? [];
      if (response.status === 403 && reasons.some((r) => QUOTA_REASONS.has(r))) {
        if (reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded')) {
          await this.quota.markExhausted();
        }
        throw new YoutubeError('QUOTA_EXHAUSTED', 'YouTube quota exhausted');
      }
      if (response.status >= 500 && attempt < 2) continue;

      this.logger.warn(
        `YouTube ${resource} returned ${response.status} (${reasons.join(',') || 'no reason'})`,
      );
      throw new YoutubeError(
        'YOUTUBE_UNAVAILABLE',
        `YouTube ${resource} returned ${response.status}`,
      );
    }
  }
}

function describe(error: unknown): string {
  // Never include the request URL: it carries the API key.
  return error instanceof Error ? error.name : 'unknown error';
}
