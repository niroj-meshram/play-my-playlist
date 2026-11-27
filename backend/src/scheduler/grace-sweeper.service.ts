import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerPresence } from '@pmp/shared';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { DueTimer } from '../realtime/presence/presence.keys.js';
import { PresenceService } from '../realtime/presence/presence.service.js';
import { RoomBroadcaster } from '../realtime/room-broadcaster.service.js';
import { GameOrchestrator } from '../games/game-orchestrator.service.js';
import { HostMigrationService } from '../rooms/host-migration.service.js';

/**
 * Processes due grace timers (docs/architecture.md §10). Every instance runs it; Redis
 * hands each timer to exactly one instance, and timers survive restarts.
 */
@Injectable()
export class GraceSweeperService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GraceSweeperService.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  /** The pass in progress, so shutdown can wait for it. */
  private running: Promise<void> | null = null;

  constructor(
    private readonly presence: PresenceService,
    private readonly broadcaster: RoomBroadcaster,
    private readonly hostMigration: HostMigrationService,
    private readonly games: GameOrchestrator,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.intervalMs = config.get('GRACE_SWEEP_INTERVAL_MS', { infer: true });
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref();
  }

  /**
   * Stops sweeping at the very start of shutdown and waits for a pass in progress, so it
   * never runs against database, Redis or Socket.IO connections that are closing.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** One pass. Overlapping passes on the same instance are skipped. */
  sweep(now = Date.now()): Promise<void> {
    if (this.running) return this.running;
    this.running = this.runPass(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runPass(now: number): Promise<void> {
    try {
      for (const due of await this.presence.claimDue(now)) {
        await this.process(due).catch((error: unknown) =>
          this.logger.error(
            `Failed to process ${due.kind} timer for player ${due.playerId}`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
      }
    } catch (error) {
      this.logger.warn(
        `Grace sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async process(due: DueTimer): Promise<void> {
    const presence = await this.presence.expire(due);
    if (!presence) return;

    this.broadcaster.toRoom(due.roomId, 'room:presence', { playerId: due.playerId, presence });
    if (presence === PlayerPresence.AWAY) {
      this.logger.log(`Player ${due.playerId} in room ${due.roomId} is away`);
      await this.hostMigration.onPlayerAway(due.roomId, due.playerId);
      // An away player is no longer waited for, which may complete the voting.
      await this.games.onPresenceChanged(due.roomId);
    }
  }
}
