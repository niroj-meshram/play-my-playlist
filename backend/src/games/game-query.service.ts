import { Injectable } from '@nestjs/common';
import type { GameSnapshotDto } from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  IN_ROUND_PHASES,
  REVEALED_PHASES,
  isViewersRound,
  loadPublicRound,
  loadReveal,
  versioned,
} from './game.mapper.js';

/** Read side of games: the viewer-specific snapshot used by room snapshots and resyncs. */
@Injectable()
export class GameQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** The room's latest game as the viewer may see it, or `null` before the first game. */
  async snapshotFor(
    roomId: string,
    viewerPlayerId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<GameSnapshotDto | null> {
    const game = await db.game.findFirst({
      where: { roomId },
      orderBy: { gameNumber: 'desc' },
      select: {
        id: true,
        gameNumber: true,
        phase: true,
        currentRound: true,
        totalRounds: true,
        stateVersion: true,
        phaseStartedAt: true,
        endReason: true,
        playlists: { select: { publicLabel: true }, orderBy: { publicLabel: 'asc' } },
      },
    });
    if (!game) return null;

    const inRound = IN_ROUND_PHASES.includes(game.phase);
    const [currentRound, isYourPlaylist, lastReveal] = await Promise.all([
      inRound ? loadPublicRound(db, game.id, game.currentRound) : null,
      inRound ? isViewersRound(db, game.id, game.currentRound, viewerPlayerId) : false,
      REVEALED_PHASES.includes(game.phase) ? loadReveal(db, game.id) : null,
    ]);

    return {
      ...versioned(game.stateVersion),
      gameNumber: game.gameNumber,
      phase: game.phase,
      roundNumber: game.currentRound,
      totalRounds: game.totalRounds,
      phaseStartedAt: game.phaseStartedAt.toISOString(),
      playlistLabels: game.playlists.map((p) => p.publicLabel),
      currentRound,
      viewer: { isYourPlaylist },
      lastReveal,
      endReason: game.endReason,
    };
  }
}
