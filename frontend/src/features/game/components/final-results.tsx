'use client';

import type { AwardDto, GameResultsDto, ScoreboardEntryDto } from '@pmp/shared';
import { Button } from '@/components/ui/button';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import { useGameCommand } from '../use-game-command';
import { Scoreboard } from './scoreboard';

function awardText(award: AwardDto | null, ranking: ScoreboardEntryDto[], unit: string) {
  if (!award) return 'Nobody';
  const names = award.playerIds.map(
    (id) => ranking.find((e) => e.playerId === id)?.displayName ?? 'Someone',
  );
  return `${names.join(' & ')} (${award.value} ${unit})`;
}

/** Final ranking and awards in SCOREBOARD; the leader can start another game. */
export function FinalResults({
  results,
  viewerPlayerId,
  isLeader,
  connection,
}: {
  results: GameResultsDto;
  viewerPlayerId: string;
  isLeader: boolean;
  connection: RoomConnection;
}) {
  const rematch = useGameCommand(connection.getSocket, 'game:rematch');
  const { ranking, awards } = results;

  return (
    <section aria-label="Final results" className="flex flex-col gap-4">
      <Scoreboard entries={ranking} viewerPlayerId={viewerPlayerId} title="Final ranking" />
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Sharpest ears</dt>
          <dd className="font-medium">
            {awardText(awards.topGuesser, ranking, 'correct guesses')}
          </dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Best bluffer</dt>
          <dd className="font-medium">{awardText(awards.bestBluffer, ranking, 'points')}</dd>
        </div>
      </dl>
      {isLeader && (
        <div className="flex flex-col gap-2">
          <Button
            className="self-start"
            disabled={rematch.pending}
            onClick={() => void rematch.run({ clientRequestId: crypto.randomUUID() })}
          >
            {rematch.pending ? 'Starting…' : 'Play again'}
          </Button>
          {rematch.error && (
            <p role="alert" className="text-sm text-destructive">
              {rematch.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
