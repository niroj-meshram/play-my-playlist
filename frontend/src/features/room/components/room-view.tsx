'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { GameScreen } from '../../game/components/game-screen';
import { isGameRunning } from '../../game/game-events';
import { useRoomConnection } from '../hooks/use-room-connection';
import { useRoomStore } from '../room-store';
import { ConnectionBanner } from './connection-banner';
import { Lobby } from './lobby';

/** Owns the room connection and shows the lobby or the running game. */
export function RoomView({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const onNotMember = useCallback(() => router.replace(`/join/${roomCode}`), [router, roomCode]);
  const connection = useRoomConnection(roomCode, onNotMember);
  const snapshot = useRoomStore((s) => s.snapshot);
  const status = useRoomStore((s) => s.connection);
  const error = useRoomStore((s) => s.error);

  return (
    <div className="flex w-full flex-col gap-4">
      <ConnectionBanner status={status} error={error} onReclaim={connection.reclaim} />
      {snapshot &&
        (isGameRunning(snapshot) ? (
          <GameScreen room={snapshot} connection={connection} />
        ) : (
          <Lobby room={snapshot} connection={connection} />
        ))}
    </div>
  );
}
