import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type VoteSubmitRequest, type VoteSubmitResponse } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockRoomById } from '../rooms/room-lock.js';
import { GameEventsService, type GameNotice } from './game-events.service.js';
import { GameOrchestrator } from './game-orchestrator.service.js';
import { VoteCounter } from './vote-counter.service.js';

type Tx = Prisma.TransactionClient;

type VoteOutcome = { response: VoteSubmitResponse; notices: GameNotice[] };

/**
 * Vote submission (docs/architecture.md §6). Each vote runs in one transaction holding the
 * room lock, like every other game command, so a vote and the reveal never interleave:
 * either the vote commits first and counts, or it sees the reveal and is rejected.
 * UNIQUE (roundId, voterId) and the self-vote CHECK back the rules up in the database.
 */
@Injectable()
export class VotingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: GameOrchestrator,
    private readonly votes: VoteCounter,
    private readonly events: GameEventsService,
  ) {}

  async submit(
    roomId: string,
    playerId: string,
    request: VoteSubmitRequest,
  ): Promise<VoteSubmitResponse> {
    let outcome: VoteOutcome;
    try {
      outcome = await this.prisma.$transaction((tx) =>
        this.submitInTx(tx, roomId, playerId, request),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw alreadyVoted();
      }
      throw error;
    }
    this.events.publish(roomId, outcome.notices);
    return outcome.response;
  }

  private async submitInTx(
    tx: Tx,
    roomId: string,
    playerId: string,
    request: VoteSubmitRequest,
  ): Promise<VoteOutcome> {
    await lockRoomById(tx, roomId);
    const game = await tx.game.findFirst({
      where: { roomId, phase: { not: 'FINISHED' } },
      select: { id: true, phase: true, currentRound: true },
    });
    if (!game) {
      throw new AppException(
        ErrorCode.NO_ACTIVE_GAME,
        'There is no game in progress in this room.',
        HttpStatus.CONFLICT,
      );
    }
    const voter = await tx.gameParticipant.findFirst({
      where: { gameId: game.id, roomPlayerId: playerId, roomPlayer: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!voter) {
      throw new AppException(
        ErrorCode.NOT_GAME_PARTICIPANT,
        'Only players in this game can vote.',
        HttpStatus.FORBIDDEN,
      );
    }

    // A retry of an accepted vote returns the same result, even after voting closed.
    const existing = await tx.vote.findFirst({
      where: { voterId: voter.id, round: { gameId: game.id, roundNumber: request.roundNumber } },
      select: { clientRequestId: true, suspect: { select: { roomPlayerId: true } } },
    });
    if (existing) {
      if (existing.clientRequestId !== request.clientRequestId) throw alreadyVoted();
      return {
        response: {
          roundNumber: request.roundNumber,
          suspectPlayerId: existing.suspect.roomPlayerId,
        },
        notices: [],
      };
    }

    if (game.phase !== 'VOTING' || game.currentRound !== request.roundNumber) {
      throw new AppException(
        ErrorCode.VOTING_CLOSED,
        'Voting is closed for this round.',
        HttpStatus.CONFLICT,
      );
    }
    if (request.suspectPlayerId === playerId) {
      throw invalidSuspect("You can't vote for yourself.");
    }
    const suspect = await tx.gameParticipant.findFirst({
      where: {
        gameId: game.id,
        roomPlayerId: request.suspectPlayerId,
        roomPlayer: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    // D5: only participants who are online (or inside the grace period) can be voted for.
    if (!suspect || !(await this.votes.isOnline(roomId, request.suspectPlayerId))) {
      throw invalidSuspect('That player cannot be voted for right now.');
    }

    const round = await tx.gameRound.findUniqueOrThrow({
      where: { gameId_roundNumber: { gameId: game.id, roundNumber: game.currentRound } },
      select: { id: true },
    });
    await tx.vote.create({
      data: {
        roundId: round.id,
        voterId: voter.id,
        suspectId: suspect.id,
        clientRequestId: request.clientRequestId,
      },
    });

    return {
      response: { roundNumber: game.currentRound, suspectPlayerId: request.suspectPlayerId },
      notices: await this.orchestrator.closeVotingIfCompleteInTx(tx, roomId),
    };
  }
}

function alreadyVoted(): AppException {
  return new AppException(
    ErrorCode.ALREADY_VOTED,
    'You have already voted this round.',
    HttpStatus.CONFLICT,
  );
}

function invalidSuspect(message: string): AppException {
  return new AppException(ErrorCode.INVALID_SUSPECT, message, HttpStatus.UNPROCESSABLE_ENTITY);
}
