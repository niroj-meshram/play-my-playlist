import { describe, expect, it } from '@jest/globals';
import { computeAwards, rankScoreboard, type UnrankedEntry } from './final-results.js';

const entry = (
  playerId: string,
  totalScore: number,
  correctGuesses = 0,
  ownerPoints = 0,
): UnrankedEntry => ({
  playerId,
  displayName: playerId.toUpperCase(),
  avatarId: 'avatar-01',
  totalScore,
  correctGuesses,
  ownerPoints,
  hasLeft: false,
});

describe('rankScoreboard', () => {
  it('sorts by score and lets ties share a rank', () => {
    const ranked = rankScoreboard([entry('c', 5), entry('a', 20), entry('d', 0), entry('b', 20)]);
    expect(ranked.map((e) => [e.playerId, e.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('ranks everyone first before any points are scored', () => {
    expect(rankScoreboard([entry('b', 0), entry('a', 0)]).map((e) => e.rank)).toEqual([1, 1]);
  });
});

describe('computeAwards', () => {
  it('awards the most correct guesses and the best bluffer, sharing ties', () => {
    const awards = computeAwards([entry('a', 0, 3, 10), entry('b', 0, 3, 0), entry('c', 0, 1, 20)]);
    expect(awards).toEqual({
      topGuesser: { playerIds: ['a', 'b'], value: 3 },
      bestBluffer: { playerIds: ['c'], value: 20 },
    });
  });

  it('gives no award when nobody earned it', () => {
    expect(computeAwards([entry('a', 0), entry('b', 0)])).toEqual({
      topGuesser: null,
      bestBluffer: null,
    });
  });
});
