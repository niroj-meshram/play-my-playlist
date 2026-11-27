import { Injectable, Logger } from '@nestjs/common';
import type { RoomSnapshotDto } from '@pmp/shared';
import { GameOrchestrator } from '../games/game-orchestrator.service.js';
import { HostMigrationService } from '../rooms/host-migration.service.js';
import { RoomsService, type RoomMembership } from '../rooms/rooms.service.js';
import { PresenceService } from './presence/presence.service.js';
import { RoomBroadcaster } from './room-broadcaster.service.js';

/** Connection lifecycle of a player in a room: subscribe, resync, disconnect. */
@Injectable()
export class RoomSessionService {
  private readonly logger = new Logger(RoomSessionService.name);

  constructor(
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
    private readonly broadcaster: RoomBroadcaster,
    private readonly hostMigration: HostMigrationService,
    private readonly games: GameOrchestrator,
  ) {}

  resolveMembership(roomCode: string, userId: string): Promise<RoomMembership> {
    return this.rooms.getMembership(roomCode, userId);
  }

  /**
   * Marks the player online on this socket and returns the authoritative snapshot.
   * The caller must already have joined the socket to the room channels, so no event
   * emitted after the snapshot is read can be missed.
   */
  async attach(
    membership: RoomMembership,
    roomCode: string,
    userId: string,
    socketId: string,
  ): Promise<RoomSnapshotDto> {
    const { roomId, playerId } = membership;
    const result = await this.presence.connect(roomId, playerId, socketId);

    if (result.replacedSocketId) {
      this.broadcaster.replaceSession(result.replacedSocketId);
      this.logger.log(`Player ${playerId} moved to a new connection; old one replaced`);
    }
    if (result.presenceChanged) {
      this.broadcaster.toRoom(roomId, 'room:presence', { playerId, presence: 'ONLINE' });
      // A returning player must vote again; never fail the subscription over it.
      await this.games
        .onPresenceChanged(roomId)
        .catch((error: unknown) =>
          this.logger.warn(
            `Vote re-check after reconnect failed in room ${roomId}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
    await this.hostMigration.onPlayerOnline(roomId, playerId);

    return this.rooms.getSnapshot(roomCode, userId);
  }

  /** Starts the grace period unless a newer connection already owns the player. */
  async detach(membership: RoomMembership, socketId: string): Promise<void> {
    await this.presence.disconnect(membership.roomId, membership.playerId, socketId);
  }

  snapshot(roomCode: string, userId: string): Promise<RoomSnapshotDto> {
    return this.rooms.getSnapshot(roomCode, userId);
  }
}
