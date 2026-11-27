import { Injectable, Logger } from '@nestjs/common';
import { RoundScoreReason } from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { parseScoringRules, scoreRound } from './domain/scoring.js';
import { VoteCounter } from './vote-counter.service.js';

type Tx = Prisma.TransactionClient;

const CORRECT_REASONS: readonly RoundScoreReason[] = [
  RoundScoreReason.SOLE_CORRECT,
  RoundScoreReason.SHARED_CORRECT,
];

/**
 * Writes a round's scores. Runs only inside the VOTING → REVEAL transition, which is
 * compare-and-set and holds the room lock, so it happens exactly once per round;
 * UNIQUE (roundId, participantId) on RoundScore rejects any second allocation.
 */
@Injectable()
export class RoundScorer {
  private readonly logger = new Logger(RoundScorer.name);

  constructor(private readonly votes: VoteCounter) {}

  async scoreInTx(tx: Tx, roomId: string, gameId: string, roundNumber: number): Promise<void> {
    const round = await tx.gameRound.findUniqueOrThrow({
      where: { gameId_roundNumber: { gameId, roundNumber } },
      select: {
        id: true,
        game: { select: { settingsSnapshot: true } },
        gamePlaylist: {
          select: {
            owner: {
              select: { id: true, roomPlayerId: true, roomPlayer: { select: { status: true } } },
            },
          },
        },
        votes: { select: { voterId: true, suspectId: true } },
      },
    });
    const owner = round.gamePlaylist.owner;
    // D12: an owner who left or is past the grace period could not be voted for.
    const ownerOnline =
      owner.roomPlayer.status === 'ACTIVE' &&
      (await this.votes.isOnline(roomId, owner.roomPlayerId));
    const { correctVoterIds, awards } = scoreRound(
      { ownerId: owner.id, ownerOnline, votes: round.votes },
      parseScoringRules(round.game.settingsSnapshot),
    );

    await tx.vote.updateMany({
      where: { roundId: round.id, voterId: { in: correctVoterIds } },
      data: { isCorrect: true },
    });
    await tx.vote.updateMany({
      where: { roundId: round.id, voterId: { notIn: correctVoterIds } },
      data: { isCorrect: false },
    });
    await tx.roundScore.createMany({
      data: awards.map((a) => ({ roundId: round.id, ...a })),
    });
    // At most one row per correct guesser (≤ 10 players), or one for the owner.
    for (const award of awards) {
      const correct = CORRECT_REASONS.includes(award.reason) ? 1 : 0;
      const ownerPoints = award.reason === RoundScoreReason.OWNER_UNGUESSED ? award.points : 0;
      if (award.points === 0 && correct === 0) continue;
      await tx.gameParticipant.update({
        where: { id: award.participantId },
        data: {
          totalScore: { increment: award.points },
          correctGuesses: { increment: correct },
          ownerPoints: { increment: ownerPoints },
        },
      });
    }
    this.logger.log(
      `Scored round ${roundNumber} of game ${gameId}: ${round.votes.length} votes, ` +
        `${correctVoterIds.length} correct`,
    );
  }
}
