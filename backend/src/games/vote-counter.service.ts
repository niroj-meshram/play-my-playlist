import { Injectable } from '@nestjs/common';
import { PlayerPresence } from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PresenceService } from '../realtime/presence/presence.service.js';
import { tallyVotes, type VoteTally } from './domain/vote-tally.js';

type Db = Prisma.TransactionClient;

/**
 * Who must still vote (docs/architecture.md §6): participants still in the room who are
 * online or inside the 30 s grace period. Presence lives in Redis, votes in PostgreSQL.
 */
@Injectable()
export class VoteCounter {
  constructor(private readonly presence: PresenceService) {}

  async tally(db: Db, roomId: string, gameId: string, roundNumber: number): Promise<VoteTally> {
    const [participants, votes] = await Promise.all([
      db.gameParticipant.findMany({
        where: { gameId, roomPlayer: { status: 'ACTIVE' } },
        select: { id: true, roomPlayerId: true },
      }),
      db.vote.findMany({
        where: { round: { gameId, roundNumber } },
        select: { voterId: true },
      }),
    ]);
    const presence = await this.presence.getMany(
      roomId,
      participants.map((p) => p.roomPlayerId),
    );
    const required = participants
      .filter((p) => presence.get(p.roomPlayerId) !== PlayerPresence.AWAY)
      .map((p) => p.id);
    return tallyVotes(
      required,
      votes.map((v) => v.voterId),
    );
  }

  /** Online for voting purposes: ONLINE or RECONNECTING (D5). */
  async isOnline(roomId: string, playerId: string): Promise<boolean> {
    return (await this.presence.getPresence(roomId, playerId)) !== PlayerPresence.AWAY;
  }
}
