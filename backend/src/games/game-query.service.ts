import { Injectable } from '@nestjs/common';
import type { GameSnapshotDto } from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  IN_ROUND_PHASES,
  RESULTS_PHASES,
  REVEALED_PHASES,
  isViewersRound,
  loadMyVote,
  loadPublicRound,
  loadReveal,
  loadScoreboard,
  parsePlaybackMode,
  toCandidates,
  toResults,
  versioned,
} from './game.mapper.js';
import { VoteCounter } from './vote-counter.service.js';

/** Read side of games: the viewer-specific snapshot used by room snapshots and resyncs. */
@Injectable()
export class GameQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly votes: VoteCounter,
  ) {}

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
        settingsSnapshot: true,
        playlists: { select: { publicLabel: true }, orderBy: { publicLabel: 'asc' } },
      },
    });
    if (!game) return null;

    const inRound = IN_ROUND_PHASES.includes(game.phase);
    const voting = game.phase === 'VOTING';
    const [currentRound, isYourPlaylist, myVote, lastReveal, scoreboard, tally] = await Promise.all(
      [
        inRound ? loadPublicRound(db, game.id, game.currentRound) : null,
        inRound ? isViewersRound(db, game.id, game.currentRound, viewerPlayerId) : false,
        inRound ? loadMyVote(db, game.id, game.currentRound, viewerPlayerId) : null,
        REVEALED_PHASES.includes(game.phase) ? loadReveal(db, game.id) : null,
        loadScoreboard(db, game.id),
        voting ? this.votes.tally(db, roomId, game.id, game.currentRound) : null,
      ],
    );

    return {
      ...versioned(game.stateVersion),
      gameNumber: game.gameNumber,
      playbackMode: parsePlaybackMode(game.settingsSnapshot),
      phase: game.phase,
      roundNumber: game.currentRound,
      totalRounds: game.totalRounds,
      phaseStartedAt: game.phaseStartedAt.toISOString(),
      playlistLabels: game.playlists.map((p) => p.publicLabel),
      currentRound,
      viewer: {
        isYourPlaylist,
        candidates: inRound ? toCandidates(scoreboard, viewerPlayerId) : [],
        myVote,
      },
      voteProgress: tally ? { votesIn: tally.votesIn, expected: tally.expected } : null,
      lastReveal,
      scoreboard,
      results: RESULTS_PHASES.includes(game.phase) ? toResults(scoreboard) : null,
      endReason: game.endReason,
    };
  }
}
