import { describe, expect, it } from '@jest/globals';
import { planRounds, plannedRoundCount, type PlannerPlaylist } from './round-planner.js';
import { seededRandom } from './test-random.js';

function playlists(...sizes: number[]): PlannerPlaylist<string>[] {
  return sizes.map((size, p) => ({
    id: `p${p}`,
    tracks: Array.from({ length: size }, (_, i) => `p${p}-t${i}`),
  }));
}

function countBy(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  return counts;
}

describe('plannedRoundCount', () => {
  it('keeps the requested count when every playlist can cover its fair share', () => {
    expect(plannedRoundCount(10, [20, 8, 5, 50])).toBe(10);
  });

  it('shortens the game so the smallest playlist still covers its share', () => {
    expect(plannedRoundCount(20, [5, 5, 5])).toBe(15);
    expect(plannedRoundCount(20, [40, 6, 30])).toBe(18);
  });

  it('is 0 without playlists', () => {
    expect(plannedRoundCount(10, [])).toBe(0);
  });
});

describe('planRounds', () => {
  it('splits 10 rounds over 4 playlists as 3/3/2/2', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const plan = planRounds(playlists(20, 20, 20, 20), 10, seededRandom(seed));
      const shares = [...countBy(plan.map((r) => r.playlistId)).values()].sort((a, b) => a - b);
      expect(shares).toEqual([2, 2, 3, 3]);
    }
  });

  it('never plays the same playlist twice in a row', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const plan = planRounds(playlists(30, 30, 30), 20, seededRandom(seed));
      plan.slice(1).forEach((round, i) => {
        expect(round.playlistId).not.toBe(plan[i]?.playlistId);
      });
    }
  });

  it('never repeats a song and only uses songs from the slot playlist', () => {
    const plan = planRounds(playlists(6, 7, 9), 18, seededRandom(7));
    expect(plan).toHaveLength(18);
    expect(new Set(plan.map((r) => r.track)).size).toBe(18);
    plan.forEach((r) => expect(r.track.startsWith(`${r.playlistId}-`)).toBe(true));
  });

  it('shortens to 15 rounds for 3 playlists of 5 songs when 20 are requested', () => {
    const plan = planRounds(playlists(5, 5, 5), 20, seededRandom(3));
    expect(plan).toHaveLength(15);
    expect([...countBy(plan.map((r) => r.playlistId)).values()]).toEqual([5, 5, 5]);
  });

  it('is deterministic for a given random source and varies between sources', () => {
    const a = planRounds(playlists(10, 10, 10), 10, seededRandom(42));
    const b = planRounds(playlists(10, 10, 10), 10, seededRandom(42));
    const c = planRounds(playlists(10, 10, 10), 10, seededRandom(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
