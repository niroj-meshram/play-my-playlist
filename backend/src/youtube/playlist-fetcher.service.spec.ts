import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { ytVideo } from '../../test/utils/youtube-fixtures.js';
import type { PlaylistCacheService } from './playlist-cache.service.js';
import { PlaylistFetcherService } from './playlist-fetcher.service.js';
import {
  YoutubeClient,
  type FetchedPlaylist,
  type YtPage,
  type YtPlaylist,
  type YtPlaylistItem,
  type YtVideo,
} from './youtube.types.js';

class FakeClient extends YoutubeClient {
  videoCalls: string[][] = [];
  pageCalls = 0;
  constructor(
    private readonly videoIds: string[],
    private readonly videos: Map<string, YtVideo>,
    private readonly exists = true,
  ) {
    super();
  }
  isConfigured() {
    return true;
  }
  async getPlaylist(id: string): Promise<YtPlaylist | null> {
    return this.exists ? { id, snippet: { title: 'Road trip' } } : null;
  }
  async listPlaylistItems(_id: string, pageToken?: string): Promise<YtPage<YtPlaylistItem>> {
    this.pageCalls += 1;
    const start = Number(pageToken ?? 0);
    const items = this.videoIds.slice(start, start + 50).map((videoId) => ({
      snippet: { title: videoId, resourceId: { videoId } },
    }));
    const next = start + 50 < this.videoIds.length ? String(start + 50) : undefined;
    return { items, ...(next ? { nextPageToken: next } : {}) };
  }
  async listVideos(ids: readonly string[]): Promise<YtVideo[]> {
    this.videoCalls.push([...ids]);
    return ids.flatMap((id) => (this.videos.has(id) ? [this.videos.get(id)!] : []));
  }
}

function memoryCache() {
  const store = new Map<string, FetchedPlaylist>();
  return {
    store,
    get: jest.fn(async (id: string) => store.get(id) ?? null),
    has: async (id: string) => store.has(id),
    set: jest.fn(async (id: string, p: FetchedPlaylist) => void store.set(id, p)),
  };
}

const config = (region?: string) =>
  ({ get: () => region }) as unknown as ConfigService<never, true>;
const ids = (n: number, prefix = 'v') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('PlaylistFetcherService', () => {
  it('reads at most 200 items over 4 pages and fetches videos in batches of 50', async () => {
    const all = ids(260);
    const client = new FakeClient(all, new Map(all.map((id) => [id, ytVideo(id)])));
    const fetcher = new PlaylistFetcherService(
      client,
      memoryCache() as unknown as PlaylistCacheService,
      config(),
    );

    const result = await fetcher.fetch('PL1');

    expect(result.title).toBe('Road trip');
    expect(result.tracks).toHaveLength(200);
    expect(result.tracks[0]!.videoId).toBe('v0');
    expect(result.tracks[199]!.videoId).toBe('v199');
    expect(client.pageCalls).toBe(4);
    expect(client.videoCalls.map((c) => c.length)).toEqual([50, 50, 50, 50]);
  });

  it('drops deleted, private and unplayable videos and repeats within the playlist', async () => {
    const list = ['ok1', 'gone', 'private', 'noembed', 'ok1', 'ok2'];
    const videos = new Map([
      ['ok1', ytVideo('ok1')],
      ['private', ytVideo('private', { status: { privacyStatus: 'private' } })],
      ['noembed', ytVideo('noembed', { status: { embeddable: false } })],
      ['ok2', ytVideo('ok2')],
    ]);
    const fetcher = new PlaylistFetcherService(
      new FakeClient(list, videos),
      memoryCache() as unknown as PlaylistCacheService,
      config(),
    );

    const result = await fetcher.fetch('PL1');

    expect(result.tracks.map((t) => t.videoId)).toEqual(['ok1', 'ok2']);
  });

  it('serves repeat fetches from the cache', async () => {
    const cache = memoryCache();
    const client = new FakeClient(['a'], new Map([['a', ytVideo('a')]]));
    const fetcher = new PlaylistFetcherService(
      client,
      cache as unknown as PlaylistCacheService,
      config(),
    );

    const first = await fetcher.fetch('PL1');
    const second = await fetcher.fetch('PL1');

    expect(second).toEqual(first);
    expect(client.pageCalls).toBe(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('reports a private or deleted playlist as PLAYLIST_NOT_FOUND', async () => {
    const fetcher = new PlaylistFetcherService(
      new FakeClient([], new Map(), false),
      memoryCache() as unknown as PlaylistCacheService,
      config(),
    );

    await expect(fetcher.fetch('PL1')).rejects.toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
  });
});
