import type { YtVideo } from '../../src/youtube/youtube.types.js';

/** A playable public video; override any field to make it unplayable. */
export function ytVideo(
  id: string,
  overrides: {
    title?: string;
    channelTitle?: string;
    status?: Partial<YtVideo['status']>;
    contentDetails?: Partial<YtVideo['contentDetails']>;
    live?: string;
  } = {},
): YtVideo {
  return {
    id,
    snippet: {
      title: overrides.title ?? `Artist ${id} - Song ${id}`,
      channelTitle: overrides.channelTitle ?? `Channel ${id}`,
      liveBroadcastContent: overrides.live ?? 'none',
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    },
    status: {
      privacyStatus: 'public',
      uploadStatus: 'processed',
      embeddable: true,
      ...overrides.status,
    },
    contentDetails: { duration: 'PT3M30S', ...overrides.contentDetails },
  };
}
