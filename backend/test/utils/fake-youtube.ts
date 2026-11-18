import {
  YoutubeClient,
  YoutubeError,
  type YoutubeErrorCode,
  type YtPage,
  type YtPlaylist,
  type YtPlaylistItem,
  type YtVideo,
} from '../../src/youtube/youtube.types.js';
import { ytVideo } from './youtube-fixtures.js';

/** In-memory YouTube Data API: no network, no quota. */
export class FakeYoutube extends YoutubeClient {
  private readonly playlists = new Map<string, { title: string; videoIds: string[] }>();
  private readonly videos = new Map<string, YtVideo>();
  private readonly gates = new Map<string, { promise: Promise<void>; release: () => void }>();
  failure: YoutubeErrorCode | null = null;
  calls = 0;

  reset(): void {
    this.playlists.clear();
    this.videos.clear();
    this.gates.forEach((g) => g.release());
    this.gates.clear();
    this.failure = null;
    this.calls = 0;
  }

  /** Adds a playlist; unknown videos are created playable unless given explicitly. */
  addPlaylist(id: string, title: string, videoIds: string[], videos: YtVideo[] = []): void {
    for (const video of videos) this.videos.set(video.id, video);
    for (const videoId of videoIds)
      if (!this.videos.has(videoId)) this.videos.set(videoId, ytVideo(videoId));
    this.playlists.set(id, { title, videoIds });
  }

  /** Blocks fetching this playlist until the returned function is called. */
  hold(playlistId: string): () => void {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    this.gates.set(playlistId, { promise, release });
    return release;
  }

  isConfigured(): boolean {
    return true;
  }

  async getPlaylist(playlistId: string): Promise<YtPlaylist | null> {
    this.calls += 1;
    await this.gates.get(playlistId)?.promise;
    if (this.failure) throw new YoutubeError(this.failure, 'fake failure');
    const playlist = this.playlists.get(playlistId);
    return playlist ? { id: playlistId, snippet: { title: playlist.title } } : null;
  }

  async listPlaylistItems(playlistId: string, pageToken?: string): Promise<YtPage<YtPlaylistItem>> {
    this.calls += 1;
    const ids = this.playlists.get(playlistId)?.videoIds ?? [];
    const start = Number(pageToken ?? 0);
    const items = ids
      .slice(start, start + 50)
      .map((videoId) => ({ snippet: { title: videoId, resourceId: { videoId } } }));
    return start + 50 < ids.length ? { items, nextPageToken: String(start + 50) } : { items };
  }

  async listVideos(videoIds: readonly string[]): Promise<YtVideo[]> {
    this.calls += 1;
    return videoIds.flatMap((id) => {
      const video = this.videos.get(id);
      return video ? [video] : [];
    });
  }
}
