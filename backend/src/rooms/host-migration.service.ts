import { Injectable, Logger } from '@nestjs/common';
import { PlayerPresence } from '@pmp/shared';
import { RoomPlayerStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from '../realtime/presence/presence.service.js';
import { RoomBroadcaster } from '../realtime/room-broadcaster.service.js';
import { pickNextHost } from './host-succession.js';

/**
 * Host migration on disconnect (D8). The host role moves to the longest-present online
 * player once the host is AWAY (past the 30 s grace). If nobody is online, the role stays
 * put and moves to the first player who comes back.
 */
@Injectable()
export class HostMigrationService {
  private readonly logger = new Logger(HostMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly broadcaster: RoomBroadcaster,
  ) {}

  /** Called by the grace sweeper when a player becomes AWAY. */
  async onPlayerAway(roomId: string, playerId: string): Promise<void> {
    await this.migrate(roomId, (hostPlayerId) => hostPlayerId === playerId);
  }

  /** Called when a player comes online: claims the host role if the current host is AWAY. */
  async onPlayerOnline(roomId: string, playerId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostPlayerId: true },
    });
    if (!room?.hostPlayerId || room.hostPlayerId === playerId) return;
    if ((await this.presence.getPresence(roomId, room.hostPlayerId)) !== PlayerPresence.AWAY)
      return;
    await this.migrate(roomId, (hostPlayerId) => hostPlayerId === room.hostPlayerId);
  }

  /**
   * Re-checks everything under the room row lock, so concurrent sweeps, joins and
   * leaves cannot migrate twice or migrate away from a host who just reconnected.
   */
  private async migrate(
    roomId: string,
    isExpectedHost: (hostPlayerId: string) => boolean,
  ): Promise<void> {
    const newHostId = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ hostPlayerId: string | null }[]>`
        SELECT "hostPlayerId" FROM "Room"
        WHERE "id" = ${roomId}::uuid AND "status" <> 'CLOSED'
        FOR UPDATE`;
      const hostPlayerId = rows[0]?.hostPlayerId;
      if (!hostPlayerId || !isExpectedHost(hostPlayerId)) return null;
      if ((await this.presence.getPresence(roomId, hostPlayerId)) !== PlayerPresence.AWAY) {
        return null;
      }

      const active = await tx.roomPlayer.findMany({
        where: { roomId, status: RoomPlayerStatus.ACTIVE },
        select: { id: true, joinedAt: true },
      });
      const presence = await this.presence.getMany(
        roomId,
        active.map((p) => p.id),
      );
      const online = active.filter((p) => presence.get(p.id) !== PlayerPresence.AWAY);
      const next = pickNextHost(online, hostPlayerId);
      if (!next) return null;

      await tx.room.update({
        where: { id: roomId },
        data: { hostPlayerId: next.id, lastActivityAt: new Date() },
      });
      return next.id;
    });

    if (newHostId) {
      this.broadcaster.toRoom(roomId, 'room:host-changed', { hostPlayerId: newHostId });
      this.logger.log(`Host of room ${roomId} migrated to ${newHostId}`);
    }
  }
}
