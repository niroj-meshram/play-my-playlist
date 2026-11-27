export interface VoteTally {
  votesIn: number;
  /** Required voters plus anyone who already voted (a cast vote stays valid). */
  expected: number;
  /** Every required voter has voted, so voting closes by itself (docs/architecture.md §6). */
  complete: boolean;
}

/**
 * Voting progress of a round. `requiredVoterIds` are the participants still in the room
 * who are online or inside the 30 s grace period. With nobody online, voting never closes
 * by itself: it waits for players to come back or for the leader.
 */
export function tallyVotes(
  requiredVoterIds: Iterable<string>,
  voterIds: Iterable<string>,
): VoteTally {
  const required = new Set(requiredVoterIds);
  const voted = new Set(voterIds);
  const expected = new Set([...required, ...voted]).size;
  const complete = required.size > 0 && [...required].every((id) => voted.has(id));
  return { votesIn: voted.size, expected, complete };
}
