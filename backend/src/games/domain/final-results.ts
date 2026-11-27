import type { AwardDto, GameAwardsDto, ScoreboardEntryDto } from '@pmp/shared';

export type UnrankedEntry = Omit<ScoreboardEntryDto, 'rank'>;

/**
 * Orders the scoreboard by total score. Ties share a rank (1, 1, 3) and are listed by
 * name, so every client shows the same order.
 */
export function rankScoreboard(entries: readonly UnrankedEntry[]): ScoreboardEntryDto[] {
  const sorted = [...entries].sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      a.displayName.localeCompare(b.displayName) ||
      a.playerId.localeCompare(b.playerId),
  );
  let rank = 0;
  return sorted.map((e, i) => {
    if (i === 0 || e.totalScore !== (sorted[i - 1] as UnrankedEntry).totalScore) rank = i + 1;
    return { ...e, rank };
  });
}

/** Final awards (docs/architecture.md §5): most correct guesses and best bluffer. */
export function computeAwards(entries: readonly UnrankedEntry[]): GameAwardsDto {
  return {
    topGuesser: leaders(entries, (e) => e.correctGuesses),
    bestBluffer: leaders(entries, (e) => e.ownerPoints),
  };
}

function leaders(
  entries: readonly UnrankedEntry[],
  value: (e: UnrankedEntry) => number,
): AwardDto | null {
  const best = Math.max(0, ...entries.map(value));
  if (best === 0) return null;
  return {
    playerIds: entries.filter((e) => value(e) === best).map((e) => e.playerId),
    value: best,
  };
}
