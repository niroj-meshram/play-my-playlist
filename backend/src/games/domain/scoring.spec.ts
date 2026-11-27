import { describe, expect, it } from '@jest/globals';
import { SCORING_DEFAULTS } from '@pmp/shared';
import { parseScoringRules, scoreRound, type ScoringRules } from './scoring.js';

const rules: ScoringRules = SCORING_DEFAULTS;
const vote = (voterId: string, suspectId: string) => ({ voterId, suspectId });

describe('scoreRound', () => {
  it('gives the owner the points when nobody guesses them', () => {
    const result = scoreRound(
      { ownerId: 'o', ownerOnline: true, votes: [vote('a', 'b'), vote('b', 'a'), vote('o', 'a')] },
      rules,
    );
    expect(result.correctVoterIds).toEqual([]);
    expect(result.awards).toEqual([{ participantId: 'o', points: 10, reason: 'OWNER_UNGUESSED' }]);
  });

  it('gives the owner nothing when nobody guesses them while they are offline (D12)', () => {
    const result = scoreRound({ ownerId: 'o', ownerOnline: false, votes: [vote('a', 'b')] }, rules);
    expect(result.awards).toEqual([{ participantId: 'o', points: 0, reason: 'OWNER_OFFLINE' }]);
  });

  it('gives the full points to a single correct guesser and nothing to the owner', () => {
    const result = scoreRound(
      { ownerId: 'o', ownerOnline: true, votes: [vote('a', 'o'), vote('b', 'a'), vote('o', 'b')] },
      rules,
    );
    expect(result.correctVoterIds).toEqual(['a']);
    expect(result.awards).toEqual([{ participantId: 'a', points: 10, reason: 'SOLE_CORRECT' }]);
  });

  it('splits to the shared points when two or more guess correctly', () => {
    const result = scoreRound(
      { ownerId: 'o', ownerOnline: true, votes: [vote('a', 'o'), vote('b', 'o'), vote('c', 'a')] },
      rules,
    );
    expect(result.correctVoterIds).toEqual(['a', 'b']);
    expect(result.awards).toEqual([
      { participantId: 'a', points: 5, reason: 'SHARED_CORRECT' },
      { participantId: 'b', points: 5, reason: 'SHARED_CORRECT' },
    ]);
  });

  it('still rewards a correct guess made before the owner went offline', () => {
    const result = scoreRound({ ownerId: 'o', ownerOnline: false, votes: [vote('a', 'o')] }, rules);
    expect(result.awards).toEqual([{ participantId: 'a', points: 10, reason: 'SOLE_CORRECT' }]);
  });

  it('scores an empty round like an unguessed one', () => {
    expect(scoreRound({ ownerId: 'o', ownerOnline: true, votes: [] }, rules).awards).toEqual([
      { participantId: 'o', points: 10, reason: 'OWNER_UNGUESSED' },
    ]);
  });

  it('never counts a self-vote by the owner as correct', () => {
    const result = scoreRound({ ownerId: 'o', ownerOnline: true, votes: [vote('o', 'o')] }, rules);
    expect(result.correctVoterIds).toEqual([]);
  });

  it('uses the point values it is given', () => {
    const custom = { ownerUnguessedPoints: 7, soleCorrectPoints: 3, sharedCorrectPoints: 1 };
    expect(
      scoreRound({ ownerId: 'o', ownerOnline: true, votes: [] }, custom).awards[0]?.points,
    ).toBe(7);
  });
});

describe('parseScoringRules', () => {
  it('reads the rules stored in a game settings snapshot', () => {
    const scoring = { ownerUnguessedPoints: 20, soleCorrectPoints: 15, sharedCorrectPoints: 8 };
    expect(parseScoringRules({ roundCount: 10, scoring })).toEqual(scoring);
  });

  it.each([null, 'x', {}, { scoring: { ownerUnguessedPoints: -1 } }, { scoring: { a: 1 } }])(
    'falls back to the defaults for %j',
    (snapshot) => {
      expect(parseScoringRules(snapshot)).toEqual(SCORING_DEFAULTS);
    },
  );
});
