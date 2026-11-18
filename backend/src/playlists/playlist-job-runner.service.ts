import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { PlaylistJob } from './playlist-job.js';
import { PlaylistIngestionService } from './playlist-ingestion.service.js';

const MAX_CONCURRENT_JOBS = 4;

/**
 * In-process job queue (no external queue needed). Jobs lost to a crash or restart are
 * picked up again by PlaylistRecoveryService, so this only needs to be best effort.
 */
@Injectable()
export class PlaylistJobRunner implements OnApplicationShutdown {
  private readonly logger = new Logger(PlaylistJobRunner.name);
  private readonly queue: PlaylistJob[] = [];
  private active = 0;
  private closed = false;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly ingestion: PlaylistIngestionService) {}

  enqueue(job: PlaylistJob): void {
    if (this.closed) return;
    this.queue.push(job);
    this.drain();
  }

  /** Resolves once no job is queued or running. */
  whenIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  onApplicationShutdown(): void {
    this.closed = true;
    this.queue.length = 0;
  }

  private drain(): void {
    while (this.active < MAX_CONCURRENT_JOBS && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active += 1;
      this.ingestion
        .process(job)
        .catch((error: unknown) =>
          this.logger.error(
            `Ingestion of playlist ${job.playlistId} failed; recovery will retry it`,
            error instanceof Error ? error.stack : String(error),
          ),
        )
        .finally(() => {
          this.active -= 1;
          this.drain();
          if (this.active === 0 && this.queue.length === 0) {
            this.idleWaiters.splice(0).forEach((resolve) => resolve());
          }
        });
    }
  }
}
