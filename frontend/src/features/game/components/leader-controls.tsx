'use client';

import type { ActiveGamePhase, GameSnapshotDto } from '@pmp/shared';
import { Button } from '@/components/ui/button';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import { useGameCommand } from '../use-game-command';

/** The leader's single "next step" button for each phase. */
export function leaderActionLabel(game: GameSnapshotDto): string | null {
  const labels: Record<ActiveGamePhase, string | null> = {
    PLAYING: 'Stop song',
    DISCUSSION: 'Open voting',
    VOTING: 'Close voting',
    REVEAL: game.roundNumber < game.totalRounds ? 'Next song' : 'Final results',
    SCOREBOARD: 'Finish game',
    FINISHED: null,
  };
  return labels[game.phase];
}

export function LeaderControls({
  game,
  connection,
}: {
  game: GameSnapshotDto;
  connection: RoomConnection;
}) {
  const advance = useGameCommand(connection.getSocket, 'game:advance');
  const label = leaderActionLabel(game);
  if (!label) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={advance.pending}
        // The expected phase makes a double click or a stale screen a harmless no-op.
        onClick={() =>
          void advance.run({ expectedPhase: game.phase, roundNumber: game.roundNumber })
        }
      >
        {label}
      </Button>
      {advance.error && (
        <p role="alert" className="text-sm text-destructive">
          {advance.error}
        </p>
      )}
    </div>
  );
}
