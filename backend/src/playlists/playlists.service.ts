import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type GetMyPlaylistResponse, type SubmitPlaylistResponse } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import {
  PlaylistStatus,
  RoomPlayerStatus,
  RoomStatus,
  type Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { roomNotFound } from '../rooms/room-code.pipe.js';
import { lockRoomByCode } from '../rooms/room-lock.js';
import { PlaylistFetcherService } from '../youtube/playlist-fetcher.service.js';
import { parsePlaylistId } from '../youtube/playlist-url.parser.js';
import { QuotaService, SUBMISSION_QUOTA_ESTIMATE } from '../youtube/quota.service.js';
import { PlaylistEventsService } from './playlist-events.service.js';
import { PlaylistJobRunner } from './playlist-job-runner.service.js';
import { MY_PLAYLIST_SELECT, toMyPlaylistDto } from './playlist.mapper.js';

type Tx = Prisma.TransactionClient;

/** Submitting, reading and removing the caller's own playlist (docs/architecture.md §7–8). */
@Injectable()
export class PlaylistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: PlaylistFetcherService,
    private readonly quota: QuotaService,
    private readonly runner: PlaylistJobRunner,
    private readonly events: PlaylistEventsService,
  ) {}

  /**
   * Validates the URL and starts background processing. Replacing a submission resets it
   * to PROCESSING; the old job's result is discarded when it finishes.
   */
  async submit(code: string, userId: string, url: string): Promise<SubmitPlaylistResponse> {
    const youtubePlaylistId = parsePlaylistId(url);
    await this.assertCanFetch(youtubePlaylistId);

    const now = new Date();
    const submissionId = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const { roomId, playerId } = await this.lockLobbyMember(tx, code, userId);
      const existing = await tx.playlist.findUnique({
        where: { roomPlayerId: playerId },
        select: { id: true, status: true },
      });
      const data = {
        youtubePlaylistId,
        sourceUrl: url.trim(),
        title: null,
        status: PlaylistStatus.PROCESSING,
        rejectionCode: null,
        playableCount: 0,
        duplicateCount: 0,
        submissionId,
        attempts: 1,
        submittedAt: now,
        processingStartedAt: now,
        readyAt: null,
      };
      if (existing) await tx.playlistTrack.deleteMany({ where: { playlistId: existing.id } });
      const playlist = existing
        ? await tx.playlist.update({
            where: { id: existing.id },
            data,
            select: { id: true, ...MY_PLAYLIST_SELECT },
          })
        : await tx.playlist.create({
            data: { ...data, roomId, roomPlayerId: playerId },
            select: { id: true, ...MY_PLAYLIST_SELECT },
          });
      return { roomId, playerId, playlist, wasReady: existing?.status === PlaylistStatus.READY };
    });

    this.events.publish(
      result.roomId,
      result.playerId,
      toMyPlaylistDto(result.playlist),
      result.wasReady,
    );
    this.runner.enqueue({ playlistId: result.playlist.id, submissionId });
    return { status: 'PROCESSING' };
  }

  async getMine(code: string, userId: string): Promise<GetMyPlaylistResponse> {
    const player = await this.prisma.roomPlayer.findFirst({
      where: {
        userId,
        status: RoomPlayerStatus.ACTIVE,
        room: { code, status: { not: RoomStatus.CLOSED } },
      },
      select: { playlist: { select: MY_PLAYLIST_SELECT } },
    });
    if (!player) throw roomNotFound();
    return { playlist: player.playlist ? toMyPlaylistDto(player.playlist) : null };
  }

  async remove(code: string, userId: string): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const { roomId, playerId } = await this.lockLobbyMember(tx, code, userId);
      const existing = await tx.playlist.findUnique({
        where: { roomPlayerId: playerId },
        select: { id: true, status: true },
      });
      if (!existing) return null;
      await tx.playlist.delete({ where: { id: existing.id } });
      return { roomId, playerId, wasReady: existing.status === PlaylistStatus.READY };
    });
    if (result) this.events.publish(result.roomId, result.playerId, null, result.wasReady);
  }

  /** Fails fast instead of queueing work that cannot succeed. */
  private async assertCanFetch(youtubePlaylistId: string): Promise<void> {
    if (!this.fetcher.isConfigured()) {
      throw new AppException(
        ErrorCode.YOUTUBE_UNAVAILABLE,
        'Playlist checks are unavailable on this server right now.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const cached = await this.fetcher.isCached(youtubePlaylistId);
    if (!cached && !(await this.quota.hasBudget(SUBMISSION_QUOTA_ESTIMATE))) {
      throw new AppException(
        ErrorCode.QUOTA_EXHAUSTED,
        "Today's YouTube limit for this game server has been reached. Please try again tomorrow.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Room row lock + active membership + LOBBY, so submissions cannot race a game start. */
  private async lockLobbyMember(
    tx: Tx,
    code: string,
    userId: string,
  ): Promise<{ roomId: string; playerId: string }> {
    const room = await lockRoomByCode(tx, code);
    const player = await tx.roomPlayer.findFirst({
      where: { roomId: room.id, userId, status: RoomPlayerStatus.ACTIVE },
      select: { id: true },
    });
    if (!player) throw roomNotFound();
    if (room.status !== RoomStatus.LOBBY) {
      throw new AppException(
        ErrorCode.GAME_IN_PROGRESS,
        'Playlists can only be changed in the lobby.',
        HttpStatus.CONFLICT,
      );
    }
    return { roomId: room.id, playerId: player.id };
  }
}
