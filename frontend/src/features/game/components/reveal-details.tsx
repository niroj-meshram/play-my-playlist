import type { RoundRevealDto, RoundScoreReason, ScoreboardEntryDto } from '@pmp/shared';

const REASON: Record<RoundScoreReason, string> = {
  SOLE_CORRECT: 'the only correct guess',
  SHARED_CORRECT: 'a shared correct guess',
  OWNER_UNGUESSED: 'nobody guessed their playlist',
  OWNER_OFFLINE: 'nobody guessed, but they were offline',
};

/** Who owned the playlist, who voted for whom, and who scored. */
export function RevealDetails({
  reveal,
  scoreboard,
  viewerPlayerId,
}: {
  reveal: RoundRevealDto;
  scoreboard: ScoreboardEntryDto[];
  viewerPlayerId: string;
}) {
  const nameOf = (id: string) =>
    id === viewerPlayerId
      ? 'You'
      : (scoreboard.find((e) => e.playerId === id)?.displayName ?? 'Someone');
  const owner = reveal.ownerPlayerId === viewerPlayerId ? 'your' : `${reveal.ownerDisplayName}'s`;

  return (
    <section aria-label="Reveal" className="flex flex-col gap-3 rounded-lg border bg-muted p-3">
      <p role="status" className="text-center font-medium">
        {reveal.playlistLabel} was {owner} playlist!
      </p>
      {reveal.votes.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {reveal.votes.map((v) => (
            <li key={v.voterPlayerId} className="flex items-center gap-2">
              <span aria-hidden="true">{v.isCorrect ? '✓' : '✗'}</span>
              <span>
                {nameOf(v.voterPlayerId)} voted for {nameOf(v.suspectPlayerId)}
              </span>
              <span className="sr-only">{v.isCorrect ? '(correct)' : '(wrong)'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody voted this round.</p>
      )}
      <ul className="flex flex-col gap-1 text-sm font-medium">
        {reveal.points.map((p) => (
          <li key={p.playerId}>
            {nameOf(p.playerId)}: +{p.points} ({REASON[p.reason]})
          </li>
        ))}
      </ul>
    </section>
  );
}
