import { secureRandomInt, takeRandom, type RandomInt } from './random.js';

export interface ReassignCandidate<T> {
  playlistId: string;
  /** Rounds this playlist already has in the game (played or planned). */
  roundCount: number;
  /** Its playable songs not yet used anywhere in this game. */
  unusedTracks: readonly T[];
}

export type ReassignedSlot<T> =
  | { kind: 'keep'; playlistId: string }
  | { kind: 'reassign'; playlistId: string; track: T }
  | { kind: 'drop' };

/**
 * Hands the upcoming rounds of a playlist whose owner left to the remaining playlists
 * (mid-game leave, docs/architecture.md §5). Each freed slot goes to the playlist with the
 * fewest rounds that still has unused songs, avoiding back-to-back repeats where possible.
 * Slots nobody can fill are dropped, which shortens the game.
 *
 * @param previousPlaylistId playlist of the round being played now (before `pending`)
 * @param pending upcoming rounds in play order
 */
export function reassignRounds<T>(
  previousPlaylistId: string | null,
  pending: readonly { playlistId: string }[],
  removedPlaylistId: string,
  candidates: readonly ReassignCandidate<T>[],
  rand: RandomInt = secureRandomInt,
): ReassignedSlot<T>[] {
  const pool = candidates.map((c) => ({
    playlistId: c.playlistId,
    roundCount: c.roundCount,
    unused: [...c.unusedTracks],
  }));
  const result: ReassignedSlot<T>[] = [];
  let previous = previousPlaylistId;

  pending.forEach((slot, index) => {
    if (slot.playlistId !== removedPlaylistId) {
      result.push({ kind: 'keep', playlistId: slot.playlistId });
      previous = slot.playlistId;
      return;
    }
    const next = pending.slice(index + 1).find((s) => s.playlistId !== removedPlaylistId);
    const available = pool.filter((c) => c.unused.length > 0);
    const notAdjacent = available.filter(
      (c) => c.playlistId !== previous && c.playlistId !== next?.playlistId,
    );
    const choice = fewestRounds(notAdjacent.length > 0 ? notAdjacent : available, rand);
    if (!choice) {
      result.push({ kind: 'drop' });
      return;
    }
    const track = takeRandom(choice.unused, rand) as T;
    choice.roundCount += 1;
    previous = choice.playlistId;
    result.push({ kind: 'reassign', playlistId: choice.playlistId, track });
  });
  return result;
}

function fewestRounds<C extends { roundCount: number }>(
  options: readonly C[],
  rand: RandomInt,
): C | undefined {
  if (options.length === 0) return undefined;
  const min = Math.min(...options.map((o) => o.roundCount));
  const tied = options.filter((o) => o.roundCount === min);
  return tied[rand(tied.length)];
}
