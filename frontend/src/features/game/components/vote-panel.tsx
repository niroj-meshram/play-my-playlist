'use client';

import { PlayerPresence, type GameSnapshotDto, type RoomSnapshotDto } from '@pmp/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import { useRoomStore } from '../../room/room-store';
import { applyMyVote } from '../game-events';
import { useGameCommand } from '../use-game-command';

/**
 * Candidates the viewer can pick right now: still in the room and online (D5).
 * Display only; the server validates every vote again.
 */
export function votableIds(room: RoomSnapshotDto): Set<string> {
  const online = room.players.filter((p) => p.presence !== PlayerPresence.AWAY);
  return new Set(online.map((p) => p.id));
}

/** Pick the suspected owner. One vote per round, final once sent. */
export function VotePanel({
  room,
  game,
  connection,
}: {
  room: RoomSnapshotDto;
  game: GameSnapshotDto;
  connection: RoomConnection;
}) {
  const submit = useGameCommand(connection.getSocket, 'vote:submit');
  // One ID per round, so a retry after a lost acknowledgement is not a second vote.
  const [request, setRequest] = useState({ round: 0, id: '' });
  const { candidates, myVote } = game.viewer;
  const votable = votableIds(room);
  const progress = game.voteProgress;
  const votedFor = candidates.find((c) => c.playerId === myVote);

  const vote = async (suspectPlayerId: string) => {
    const clientRequestId = request.round === game.roundNumber ? request.id : crypto.randomUUID();
    setRequest({ round: game.roundNumber, id: clientRequestId });
    const result = await submit.run({
      roundNumber: game.roundNumber,
      suspectPlayerId,
      clientRequestId,
    });
    if (result) useRoomStore.getState().patch((r) => applyMyVote(r, result));
  };

  return (
    <section aria-labelledby="vote-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="vote-heading" className="font-semibold">
          {votedFor ? `You voted for ${votedFor.displayName}` : 'Whose playlist is it?'}
        </h2>
        {progress && (
          <span role="status" className="text-sm text-muted-foreground">
            {progress.votesIn} of {progress.expected} voted
          </span>
        )}
      </div>
      {!myVote && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {candidates.map((c) => {
            const online = votable.has(c.playerId);
            return (
              <li key={c.playerId}>
                <Button
                  variant="outline"
                  className={cn('w-full', !online && 'opacity-50')}
                  disabled={!online || submit.pending}
                  onClick={() => void vote(c.playerId)}
                >
                  {c.displayName}
                  {!online && <span className="sr-only"> (offline)</span>}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {submit.error && (
        <p role="alert" className="text-sm text-destructive">
          {submit.error}
        </p>
      )}
    </section>
  );
}
