import { secureRandomInt, shuffle, takeRandom, type RandomInt } from './random.js';

export interface PlannerPlaylist<T> {
  id: string;
  /** Playable songs; already unique across the room's playlists (D6). */
  tracks: readonly T[];
}

export interface PlannedRound<T> {
  playlistId: string;
  track: T;
}

/**
 * Rounds a game can have so that every playlist keeps its exact fair share: the rotation
 * gives each playlist ⌈rounds / playlists⌉ slots at most, which must fit the smallest one.
 */
export function plannedRoundCount(roundCount: number, trackCounts: readonly number[]): number {
  if (trackCounts.length === 0) return 0;
  return Math.max(0, Math.min(roundCount, trackCounts.length * Math.min(...trackCounts)));
}

/**
 * Balanced random round plan (docs/architecture.md §5):
 * - playlists are drawn in CSPRNG-shuffled rotations, re-shuffled every cycle, so shares
 *   differ by at most one and the order is unpredictable;
 * - the same playlist never plays twice in a row when there is more than one;
 * - each slot gets a random unused song from its playlist.
 */
export function planRounds<T>(
  playlists: readonly PlannerPlaylist<T>[],
  roundCount: number,
  rand: RandomInt = secureRandomInt,
): PlannedRound<T>[] {
  const total = plannedRoundCount(
    roundCount,
    playlists.map((p) => p.tracks.length),
  );
  const pools = new Map(playlists.map((p) => [p.id, [...p.tracks]]));
  const order: string[] = [];

  while (order.length < total) {
    const cycle = shuffle(
      playlists.map((p) => p.id),
      rand,
    );
    // Re-draw the cycle's first pick if it would repeat the previous round's playlist.
    if (cycle.length > 1 && cycle[0] === order.at(-1)) {
      const swapWith = 1 + rand(cycle.length - 1);
      [cycle[0], cycle[swapWith]] = [cycle[swapWith] as string, cycle[0] as string];
    }
    order.push(...cycle.slice(0, total - order.length));
  }

  return order.map((playlistId) => {
    const track = takeRandom(pools.get(playlistId) ?? [], rand);
    if (track === undefined) throw new Error(`Playlist ${playlistId} ran out of songs`);
    return { playlistId, track };
  });
}
