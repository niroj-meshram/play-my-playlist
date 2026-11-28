import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PLAYLIST_ITEM_CAP } from '@pmp/shared';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PlaylistCacheService } from './playlist-cache.service.js';
import { isPlayable, toFetchedTrack, truncate } from './track-filter.js';
import {
  YoutubeClient,
  YoutubeError,
  type FetchedPlaylist,
  type YtVideo,
} from './youtube.types.js';

const VIDEO_BATCH = 50;
const MAX_TITLE = 200;

/**
 * Reads a playlist (first 200 items) and keeps the songs the IFrame player can actually
 * play. Results are cached per submission, so only retries of the same submission reuse
 * them; every new submission sees the playlist as it is on YouTube now.
 */
@Injectable()
export class PlaylistFetcherService {
  private readonly regionCode: string | undefined;

  constructor(
    private readonly client: YoutubeClient,
    private readonly cache: PlaylistCacheService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.regionCode = config.get('YOUTUBE_REGION_CODE', { infer: true });
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async fetch(playlistId: string, submissionId: string): Promise<FetchedPlaylist> {
    const cached = await this.cache.get(playlistId, submissionId);
    if (cached) return cached;

    const playlist = await this.client.getPlaylist(playlistId);
    if (!playlist) {
      throw new YoutubeError('PLAYLIST_NOT_FOUND', 'Playlist is private, deleted or unknown');
    }

    const videoIds = await this.collectVideoIds(playlistId);
    const videos = new Map<string, YtVideo>();
    for (let i = 0; i < videoIds.length; i += VIDEO_BATCH) {
      for (const video of await this.client.listVideos(videoIds.slice(i, i + VIDEO_BATCH))) {
        videos.set(video.id, video);
      }
    }

    const tracks = videoIds
      .map((id) => videos.get(id))
      .filter((video): video is YtVideo => !!video && isPlayable(video, this.regionCode))
      .map(toFetchedTrack);

    const result: FetchedPlaylist = { title: truncate(playlist.snippet.title, MAX_TITLE), tracks };
    await this.cache.set(playlistId, submissionId, result);
    return result;
  }

  /** Unique video IDs in playlist order, at most PLAYLIST_ITEM_CAP items read. */
  private async collectVideoIds(playlistId: string): Promise<string[]> {
    const ids = new Set<string>();
    let read = 0;
    let pageToken: string | undefined;
    do {
      const page = await this.client.listPlaylistItems(playlistId, pageToken);
      for (const item of page.items) {
        if (read >= PLAYLIST_ITEM_CAP) break;
        read += 1;
        const videoId = item.snippet.resourceId.videoId;
        if (videoId) ids.add(videoId);
      }
      pageToken = page.nextPageToken;
    } while (pageToken && read < PLAYLIST_ITEM_CAP);
    return [...ids];
  }
}
