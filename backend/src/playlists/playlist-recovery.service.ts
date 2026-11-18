import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PlaylistRejectionCode } from '@pmp/shared';
import { PlaylistStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlaylistEventsService } from './playlist-events.service.js';
import { PlaylistJobRunner } from './playlist-job-runner.service.js';
import { MY_PLAYLIST_SELECT, toMyPlaylistDto } from './playlist.mapper.js';

/** A job running longer than this is assumed lost (crash, restart, deploy). */
export const STALE_PROCESSING_MS = 2 * 60_000;
export const MAX_INGESTION_ATTEMPTS = 3;
const SWEEP_INTERVAL_MS = 30_000;
const BATCH = 20;

/**
 * Re-runs submissions left PROCESSING by a lost job. Claims use compare-and-set on
 * `processingStartedAt`, so with several API instances each row is retried once.
 */
@Injectable()
export class PlaylistRecoveryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PlaylistRecoveryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: PlaylistJobRunner,
    private readonly events: PlaylistEventsService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.recoverStale().catch((error: unknown) =>
        this.logger.warn(
          `Playlist recovery failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Returns how many rows this instance claimed (retried or gave up on). */
  async recoverStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.playlist.findMany({
      where: {
        status: PlaylistStatus.PROCESSING,
        processingStartedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) },
      },
      select: { id: true, submissionId: true, attempts: true, processingStartedAt: true },
      take: BATCH,
    });

    let claimed = 0;
    for (const row of stale) {
      const where = {
        id: row.id,
        submissionId: row.submissionId,
        status: PlaylistStatus.PROCESSING,
        processingStartedAt: row.processingStartedAt,
      };
      if (row.attempts >= MAX_INGESTION_ATTEMPTS) {
        const { count } = await this.prisma.playlist.updateMany({
          where,
          data: {
            status: PlaylistStatus.REJECTED,
            rejectionCode: PlaylistRejectionCode.YOUTUBE_UNAVAILABLE,
          },
        });
        if (count === 1) {
          claimed += 1;
          await this.publish(row.id);
        }
        continue;
      }
      const { count } = await this.prisma.playlist.updateMany({
        where,
        data: { processingStartedAt: now, attempts: { increment: 1 } },
      });
      if (count === 1) {
        claimed += 1;
        this.logger.warn(
          `Retrying stale ingestion of playlist ${row.id} (attempt ${row.attempts + 1})`,
        );
        this.runner.enqueue({ playlistId: row.id, submissionId: row.submissionId });
      }
    }
    return claimed;
  }

  private async publish(playlistId: string): Promise<void> {
    const row = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { ...MY_PLAYLIST_SELECT, roomId: true, roomPlayerId: true },
    });
    if (row) this.events.publish(row.roomId, row.roomPlayerId, toMyPlaylistDto(row), false);
  }
}
