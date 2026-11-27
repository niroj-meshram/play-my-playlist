import { RoundScoreReason, SCORING_DEFAULTS } from '@pmp/shared';

/** Point values of one game, snapshotted at start so rule changes never alter old games. */
export interface ScoringRules {
  ownerUnguessedPoints: number;
  soleCorrectPoints: number;
  sharedCorrectPoints: number;
}

export interface RoundVote {
  voterId: string;
  suspectId: string;
}

export interface RoundScoringInput {
  /** Participant who owns the round's playlist. */
  ownerId: string;
  /** Whether the owner was online (or within the grace period) when voting closed. */
  ownerOnline: boolean;
  votes: readonly RoundVote[];
}

export interface RoundAward {
  participantId: string;
  points: number;
  reason: RoundScoreReason;
}

export interface RoundScoringResult {
  correctVoterIds: string[];
  awards: RoundAward[];
}

/**
 * Per-round scoring (docs/architecture.md §5). Deterministic and side-effect free:
 * - nobody correct: the owner gets `ownerUnguessedPoints`, or 0 when offline (D12);
 * - exactly one correct: that guesser gets `soleCorrectPoints`;
 * - two or more correct: each gets `sharedCorrectPoints`.
 * Votes not cast are simply absent and count for nothing.
 */
export function scoreRound(input: RoundScoringInput, rules: ScoringRules): RoundScoringResult {
  const correctVoterIds = input.votes
    .filter((v) => v.suspectId === input.ownerId && v.voterId !== input.ownerId)
    .map((v) => v.voterId);

  if (correctVoterIds.length === 0) {
    const award: RoundAward = input.ownerOnline
      ? {
          participantId: input.ownerId,
          points: rules.ownerUnguessedPoints,
          reason: RoundScoreReason.OWNER_UNGUESSED,
        }
      : { participantId: input.ownerId, points: 0, reason: RoundScoreReason.OWNER_OFFLINE };
    return { correctVoterIds, awards: [award] };
  }

  const [points, reason] =
    correctVoterIds.length === 1
      ? [rules.soleCorrectPoints, RoundScoreReason.SOLE_CORRECT]
      : [rules.sharedCorrectPoints, RoundScoreReason.SHARED_CORRECT];
  return {
    correctVoterIds,
    awards: correctVoterIds.map((participantId) => ({ participantId, points, reason })),
  };
}

/** Reads the rules from `Game.settingsSnapshot`, falling back to the defaults if malformed. */
export function parseScoringRules(settingsSnapshot: unknown): ScoringRules {
  const scoring =
    typeof settingsSnapshot === 'object' && settingsSnapshot !== null
      ? (settingsSnapshot as { scoring?: unknown }).scoring
      : undefined;
  if (typeof scoring !== 'object' || scoring === null) return { ...SCORING_DEFAULTS };

  const read = (key: keyof ScoringRules): number | null => {
    const value = (scoring as Record<string, unknown>)[key];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  };
  const rules = {
    ownerUnguessedPoints: read('ownerUnguessedPoints'),
    soleCorrectPoints: read('soleCorrectPoints'),
    sharedCorrectPoints: read('sharedCorrectPoints'),
  };
  return Object.values(rules).every((v) => v !== null)
    ? (rules as ScoringRules)
    : { ...SCORING_DEFAULTS };
}
