import { Injectable, Logger } from '@nestjs/common';
import { PlaylistRejectionCode, ROOM_LIMITS } from '@pmp/shared';
import { PlaylistStatus, PlaylistTrackStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlaylistFetcherService } from '../youtube/playlist-fetcher.service.js';
import { YoutubeError, type FetchedPlaylist, type FetchedTrack } from '../youtube/youtube.types.js';
import type { PlaylistJob } from './playlist-job.js';
import { MY_PLAYLIST_SELECT, toMyPlaylistDto, type MyPlaylistRow } from './playlist.mapper.js';
import { PlaylistEventsService } from './playlist-events.service.js';

type Outcome =
  | { kind: 'rejected'; code: PlaylistRejectionCode; title?: string; playableCount?: number }
  | { kind: 'fetched'; playlist: FetchedPlaylist };

/**
 * Background processing of one submission: fetch and filter outside any transaction,
 * then commit under a per-room advisory lock so concurrent submissions see each other's
 * songs and a video is never PLAYABLE in two playlists of the same room (D6).
 */
@Injectable()
export class PlaylistIngestionService {
  private readonly logger = new Logger(PlaylistIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: PlaylistFetcherService,
    private readonly events: PlaylistEventsService,
  ) {}

  async process(job: PlaylistJob): Promise<void> {
    const row = await this.prisma.playlist.findUnique({
      where: { id: job.playlistId },
      select: { submissionId: true, status: true, youtubePlaylistId: true },
    });
    if (!row || row.submissionId !== job.submissionId || row.status !== PlaylistStatus.PROCESSING) {
      return;
    }
    await this.commit(job, await this.fetch(row.youtubePlaylistId, job.submissionId));
  }

  private async fetch(youtubePlaylistId: string, submissionId: string): Promise<Outcome> {
    let playlist: FetchedPlaylist;
    try {
      playlist = await this.fetcher.fetch(youtubePlaylistId, submissionId);
    } catch (error) {
      if (error instanceof YoutubeError) return { kind: 'rejected', code: error.code };
      throw error; // Unexpected: the row stays PROCESSING and recovery retries it.
    }
    if (playlist.tracks.length < ROOM_LIMITS.minPlayableTracks) {
      return {
        kind: 'rejected',
        code: PlaylistRejectionCode.NOT_ENOUGH_PLAYABLE_SONGS,
        title: playlist.title,
        playableCount: playlist.tracks.length,
      };
    }
    return { kind: 'fetched', playlist };
  }

  private async commit(job: PlaylistJob, outcome: Outcome): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.playlist.findUnique({
        where: { id: job.playlistId },
        select: { submissionId: true, status: true, roomId: true, roomPlayerId: true },
      });
      if (!current) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${current.roomId}, 0))`;
      // Re-read under the lock: the submission may have been replaced or removed meanwhile.
      const locked = await tx.playlist.findUnique({
        where: { id: job.playlistId },
        select: { submissionId: true, status: true },
      });
      if (
        locked?.submissionId !== job.submissionId ||
        locked.status !== PlaylistStatus.PROCESSING
      ) {
        return null;
      }

      const row =
        outcome.kind === 'rejected'
          ? await this.reject(tx, job.playlistId, outcome)
          : await this.store(tx, job.playlistId, current.roomId, outcome.playlist);
      return { roomId: current.roomId, playerId: current.roomPlayerId, row };
    });

    if (!result) {
      this.logger.debug(`Discarded stale ingestion of playlist ${job.playlistId}`);
      return;
    }
    const dto = toMyPlaylistDto(result.row);
    this.events.publish(result.roomId, result.playerId, dto, dto.status === 'READY');
    this.logger.log(
      `Playlist ${job.playlistId} ${dto.status}` +
        (dto.rejectionCode
          ? ` (${dto.rejectionCode})`
          : ` (${dto.playableCount} songs, ${dto.duplicateCount} duplicates)`),
    );
  }

  private reject(
    tx: Prisma.TransactionClient,
    playlistId: string,
    outcome: Extract<Outcome, { kind: 'rejected' }>,
    duplicateCount = 0,
  ): Promise<MyPlaylistRow> {
    return tx.playlist.update({
      where: { id: playlistId },
      data: {
        status: PlaylistStatus.REJECTED,
        rejectionCode: outcome.code,
        title: outcome.title ?? null,
        playableCount: outcome.playableCount ?? 0,
        duplicateCount,
      },
      select: MY_PLAYLIST_SELECT,
    });
  }

  private async store(
    tx: Prisma.TransactionClient,
    playlistId: string,
    roomId: string,
    playlist: FetchedPlaylist,
  ): Promise<MyPlaylistRow> {
    const taken = await tx.playlistTrack.findMany({
      where: {
        roomId,
        status: PlaylistTrackStatus.PLAYABLE,
        playlist: { status: PlaylistStatus.READY },
        youtubeVideoId: { in: playlist.tracks.map((t) => t.videoId) },
      },
      select: { youtubeVideoId: true },
    });
    const takenIds = new Set(taken.map((t) => t.youtubeVideoId));
    const unique = playlist.tracks.filter((t) => !takenIds.has(t.videoId));
    const duplicateCount = playlist.tracks.length - unique.length;

    if (unique.length < ROOM_LIMITS.minPlayableTracks) {
      return this.reject(
        tx,
        playlistId,
        {
          kind: 'rejected',
          code: PlaylistRejectionCode.NOT_ENOUGH_UNIQUE_SONGS,
          title: playlist.title,
          playableCount: unique.length,
        },
        duplicateCount,
      );
    }

    await tx.playlistTrack.createMany({
      data: playlist.tracks.map((track: FetchedTrack, position) => ({
        playlistId,
        roomId,
        position,
        youtubeVideoId: track.videoId,
        title: track.title,
        artist: track.artist,
        thumbnailUrl: track.thumbnailUrl,
        durationSec: track.durationSec,
        status: takenIds.has(track.videoId)
          ? PlaylistTrackStatus.DUPLICATE
          : PlaylistTrackStatus.PLAYABLE,
      })),
    });
    return tx.playlist.update({
      where: { id: playlistId },
      data: {
        status: PlaylistStatus.READY,
        rejectionCode: null,
        title: playlist.title,
        playableCount: unique.length,
        duplicateCount,
        readyAt: new Date(),
      },
      select: MY_PLAYLIST_SELECT,
    });
  }
}
