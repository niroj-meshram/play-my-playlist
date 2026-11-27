import type { ScoreboardEntryDto } from '@pmp/shared';
import { cn } from '@/lib/utils';

/** Live scoreboard (D1). The server ranks it; ties share a rank. */
export function Scoreboard({
  entries,
  viewerPlayerId,
  title = 'Scores',
}: {
  entries: ScoreboardEntryDto[];
  viewerPlayerId: string;
  title?: string;
}) {
  return (
    <section aria-labelledby="scoreboard-heading" className="flex flex-col gap-2">
      <h2 id="scoreboard-heading" className="text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      <ol className="flex flex-col gap-1">
        {entries.map((e) => (
          <li
            key={e.playerId}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm',
              e.playerId === viewerPlayerId && 'border-primary',
              e.hasLeft && 'opacity-60',
            )}
          >
            <span className="w-6 text-muted-foreground">#{e.rank}</span>
            <span className="flex-1 truncate">
              {e.displayName}
              {e.playerId === viewerPlayerId && (
                <span className="text-xs text-muted-foreground"> (you)</span>
              )}
              {e.hasLeft && <span className="text-xs text-muted-foreground"> (left)</span>}
            </span>
            <span className="font-semibold tabular-nums">{e.totalScore}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
