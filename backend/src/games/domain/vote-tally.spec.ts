import { describe, expect, it } from '@jest/globals';
import { tallyVotes } from './vote-tally.js';

describe('tallyVotes', () => {
  it('is complete once every required voter has voted', () => {
    expect(tallyVotes(['a', 'b', 'c'], ['a', 'b'])).toEqual({
      votesIn: 2,
      expected: 3,
      complete: false,
    });
    expect(tallyVotes(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual({
      votesIn: 3,
      expected: 3,
      complete: true,
    });
  });

  it('keeps a vote from someone who went offline and no longer waits for others offline', () => {
    // "d" voted and then went away; "c" is away and never voted.
    expect(tallyVotes(['a', 'b'], ['a', 'b', 'd'])).toEqual({
      votesIn: 3,
      expected: 3,
      complete: true,
    });
  });

  it('never completes on its own when nobody is online', () => {
    expect(tallyVotes([], ['a']).complete).toBe(false);
    expect(tallyVotes([], [])).toEqual({ votesIn: 0, expected: 0, complete: false });
  });

  it('counts each voter once', () => {
    expect(tallyVotes(['a', 'b'], ['a', 'a'])).toMatchObject({ votesIn: 1, complete: false });
  });
});
