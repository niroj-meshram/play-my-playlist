import { describe, expect, it } from '@jest/globals';
import { reassignRounds, type ReassignCandidate } from './round-reassigner.js';
import { seededRandom } from './test-random.js';

const slots = (...ids: string[]) => ids.map((playlistId) => ({ playlistId }));
const candidate = (
  playlistId: string,
  roundCount: number,
  unused: number,
): ReassignCandidate<string> => ({
  playlistId,
  roundCount,
  unusedTracks: Array.from({ length: unused }, (_, i) => `${playlistId}-u${i}`),
});

describe('reassignRounds', () => {
  it('keeps rounds of other playlists and reassigns every round of the leaver', () => {
    const result = reassignRounds(
      'A',
      slots('B', 'X', 'C', 'X'),
      'X',
      [candidate('A', 3, 5), candidate('B', 3, 5), candidate('C', 3, 5)],
      seededRandom(1),
    );
    expect(result[0]).toEqual({ kind: 'keep', playlistId: 'B' });
    expect(result[2]).toEqual({ kind: 'keep', playlistId: 'C' });
    expect(result.filter((r) => r.kind === 'reassign')).toHaveLength(2);
    expect(result.some((r) => r.kind === 'reassign' && r.playlistId === 'X')).toBe(false);
  });

  it('avoids back-to-back repeats when another playlist can take the slot', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const result = reassignRounds(
        'A',
        slots('X', 'B'),
        'X',
        [candidate('A', 2, 5), candidate('B', 2, 5), candidate('C', 2, 5)],
        seededRandom(seed),
      );
      expect(result[0]).toMatchObject({ kind: 'reassign', playlistId: 'C' });
    }
  });

  it('gives freed rounds to the playlists with the fewest rounds', () => {
    const result = reassignRounds(
      null,
      slots('X', 'X'),
      'X',
      [candidate('A', 4, 5), candidate('B', 2, 5), candidate('C', 2, 5)],
      seededRandom(5),
    );
    const owners = result.map((r) => (r.kind === 'reassign' ? r.playlistId : r.kind));
    expect(owners.sort()).toEqual(['B', 'C']);
  });

  it('uses each unused song at most once', () => {
    const result = reassignRounds(
      null,
      slots('X', 'X', 'X', 'X'),
      'X',
      [candidate('A', 1, 2), candidate('B', 1, 2)],
      seededRandom(9),
    );
    const songs = result.flatMap((r) => (r.kind === 'reassign' ? [r.track] : []));
    expect(new Set(songs).size).toBe(songs.length);
  });

  it('drops rounds nobody can fill', () => {
    const result = reassignRounds(
      'A',
      slots('X', 'B', 'X', 'X'),
      'X',
      [candidate('A', 3, 1), candidate('B', 3, 0)],
      seededRandom(2),
    );
    expect(result.map((r) => r.kind)).toEqual(['reassign', 'keep', 'drop', 'drop']);
  });
});
