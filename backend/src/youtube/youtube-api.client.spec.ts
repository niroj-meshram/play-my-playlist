import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { QuotaService } from './quota.service.js';
import { YoutubeApiClient } from './youtube-api.client.js';
import { YoutubeError } from './youtube.types.js';

const KEY = 'AIzaSy-test-key-0123456789abcdef';
const fetchMock = jest.fn<typeof fetch>();

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** The URL of the n-th fetch call (the client passes URL objects). */
const requested = (n = 0) => new URL((fetchMock.mock.calls[n]![0] as URL).href);

function makeClient(apiKey: string | null = KEY) {
  const quota = {
    consume: jest.fn(async (_units: number) => undefined),
    markExhausted: jest.fn(async () => undefined),
  };
  const config = { get: () => apiKey ?? undefined } as unknown as ConfigService<never, true>;
  return { client: new YoutubeApiClient(quota as unknown as QuotaService, config), quota };
}

describe('YoutubeApiClient', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('requests playlist metadata with the key and counts one quota unit', async () => {
    const { client, quota } = makeClient();
    fetchMock.mockResolvedValue(json(200, { items: [{ id: 'PL1', snippet: { title: 'Mine' } }] }));

    await expect(client.getPlaylist('PL1')).resolves.toEqual({
      id: 'PL1',
      snippet: { title: 'Mine' },
    });

    const url = requested();
    expect(url.pathname).toBe('/youtube/v3/playlists');
    expect(url.searchParams.get('id')).toBe('PL1');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(quota.consume).toHaveBeenCalledWith(1);
  });

  it('returns null for a private or unknown playlist', async () => {
    const { client } = makeClient();
    fetchMock.mockResolvedValue(json(200, { items: [] }));

    await expect(client.getPlaylist('PL1')).resolves.toBeNull();
  });

  it('passes page tokens and maps a 404 on items to PLAYLIST_NOT_FOUND', async () => {
    const { client } = makeClient();
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextPageToken: 'next' }));
    fetchMock.mockResolvedValueOnce(json(404, { error: { code: 404 } }));

    await expect(client.listPlaylistItems('PL1', 'tok')).resolves.toEqual({
      items: [],
      nextPageToken: 'next',
    });
    expect(requested().searchParams.get('pageToken')).toBe('tok');
    await expect(client.listPlaylistItems('PL1')).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
    });
  });

  it('requests videos in one batch of up to 50 IDs', async () => {
    const { client } = makeClient();
    fetchMock.mockResolvedValue(json(200, { items: [] }));

    await client.listVideos(['a', 'b']);

    expect(requested().searchParams.get('id')).toBe('a,b');
    await expect(client.listVideos(Array.from({ length: 51 }, (_, i) => `v${i}`))).rejects.toThrow(
      /at most 50/,
    );
  });

  it('marks the day exhausted on quotaExceeded', async () => {
    const { client, quota } = makeClient();
    fetchMock.mockResolvedValue(
      json(403, { error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }),
    );

    await expect(client.getPlaylist('PL1')).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(quota.markExhausted).toHaveBeenCalled();
  });

  it('retries a 5xx or network failure once, then reports YOUTUBE_UNAVAILABLE without the key', async () => {
    const { client } = makeClient();
    fetchMock.mockResolvedValueOnce(json(503, {}));
    fetchMock.mockResolvedValueOnce(
      json(200, { items: [{ id: 'PL1', snippet: { title: 'ok' } }] }),
    );
    await expect(client.getPlaylist('PL1')).resolves.not.toBeNull();

    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ...?key=${KEY}`));
    const error = await client.getPlaylist('PL1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(YoutubeError);
    expect(error).toMatchObject({ code: 'YOUTUBE_UNAVAILABLE' });
    expect(String((error as Error).message)).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('refuses to call YouTube without a key', async () => {
    const { client } = makeClient(null);

    expect(client.isConfigured()).toBe(false);
    await expect(client.getPlaylist('PL1')).rejects.toMatchObject({ code: 'YOUTUBE_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
