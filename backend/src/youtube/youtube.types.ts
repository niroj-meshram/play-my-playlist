import type { PlaylistRejectionCode } from '@pmp/shared';

/** The subset of YouTube Data API v3 resources the app reads. */
export interface YtPlaylist {
  id: string;
  snippet: { title: string };
}

export interface YtPlaylistItem {
  snippet: {
    title: string;
    resourceId: { videoId?: string };
    videoOwnerChannelTitle?: string;
  };
}

export interface YtVideo {
  id: string;
  snippet: {
    title: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url: string; width?: number; height?: number } | undefined>;
  };
  status: {
    privacyStatus?: string;
    uploadStatus?: string;
    embeddable?: boolean;
  };
  contentDetails: {
    duration?: string;
    contentRating?: { ytRating?: string };
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
}

export interface YtPage<T> {
  items: T[];
  nextPageToken?: string;
}

/** Playable song kept from a playlist. */
export interface FetchedTrack {
  videoId: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number;
}

export interface FetchedPlaylist {
  title: string;
  /** Playable songs, in playlist order, without repeats. */
  tracks: FetchedTrack[];
}

export type YoutubeErrorCode = Extract<
  PlaylistRejectionCode,
  'PLAYLIST_NOT_FOUND' | 'QUOTA_EXHAUSTED' | 'YOUTUBE_UNAVAILABLE'
>;

/** Expected YouTube failure. Messages are safe to log: they never contain the API key. */
export class YoutubeError extends Error {
  constructor(
    readonly code: YoutubeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'YoutubeError';
  }
}

/**
 * Low-level Data API access, one method per endpoint. An abstract class so it doubles
 * as the DI token; tests replace it with an in-memory fake.
 */
export abstract class YoutubeClient {
  abstract isConfigured(): boolean;
  /** `null` for private, deleted or unknown playlists. */
  abstract getPlaylist(playlistId: string): Promise<YtPlaylist | null>;
  abstract listPlaylistItems(
    playlistId: string,
    pageToken?: string,
  ): Promise<YtPage<YtPlaylistItem>>;
  /** At most 50 IDs. Unknown, deleted and private videos are simply absent. */
  abstract listVideos(videoIds: readonly string[]): Promise<YtVideo[]>;
}
