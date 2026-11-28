'use client';

import { ROOM_LIMITS, type RoomSnapshotDto } from '@pmp/shared';
import { Button } from '@/components/ui/button';
import { newRequestId } from '@/lib/request-id';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import { useGameCommand } from '../use-game-command';

/** Why the game cannot start yet, or `null`. The server checks the same rules again. */
export function startBlocker(room: RoomSnapshotDto): string | null {
  if (room.players.length < ROOM_LIMITS.minPlayers) {
    return `At least ${ROOM_LIMITS.minPlayers} players are needed.`;
  }
  const waiting = room.players.filter((p) => !p.playlistReady).length;
  if (waiting > 0) {
    return `Waiting for ${waiting} ${waiting === 1 ? 'player' : 'players'} to add a playlist.`;
  }
  return null;
}

export function StartGameButton({
  room,
  connection,
}: {
  room: RoomSnapshotDto;
  connection: RoomConnection;
}) {
  const start = useGameCommand(connection.getSocket, 'game:start');
  const isHost = room.hostPlayerId === room.viewerPlayerId;
  const blocker = startBlocker(room);

  if (!isHost) {
    return (
      <p className="text-sm text-muted-foreground">
        {blocker ?? 'Everyone is ready. Waiting for the host to start the game.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={blocker !== null || start.pending}
        onClick={() => void start.run({ clientRequestId: newRequestId() })}
      >
        {start.pending ? 'Starting…' : 'Start game'}
      </Button>
      {blocker && <p className="text-sm text-muted-foreground">{blocker}</p>}
      {start.error && (
        <p role="alert" className="text-sm text-destructive">
          {start.error}
        </p>
      )}
    </div>
  );
}
