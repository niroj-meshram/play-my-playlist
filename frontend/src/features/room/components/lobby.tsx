'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRoomConnection } from '../hooks/use-room-connection';
import { roomApi } from '../room-api';
import { useRoomStore } from '../room-store';
import { ConnectionBanner } from './connection-banner';
import { InviteLink } from './invite-link';
import { PlayerList } from './player-list';
import { RoomSettings } from './room-settings';

export function Lobby({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const onNotMember = useCallback(() => router.replace(`/join/${roomCode}`), [router, roomCode]);
  const connection = useRoomConnection(roomCode, onNotMember);
  const snapshot = useRoomStore((s) => s.snapshot);
  const status = useRoomStore((s) => s.connection);
  const error = useRoomStore((s) => s.error);

  const leave = useMutation({
    mutationFn: () => roomApi.leave(roomCode),
    onSuccess: () => {
      connection.close();
      router.push('/');
    },
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <ConnectionBanner status={status} error={error} onReclaim={connection.reclaim} />
      {snapshot && (
        <Card>
          <InviteLink roomCode={snapshot.code} />
          <p className="text-sm text-muted-foreground">
            Waiting in the lobby. Playlist submission and game start arrive in the next milestones.
          </p>
          <PlayerList
            players={snapshot.players}
            viewerPlayerId={snapshot.viewerPlayerId}
            maxPlayers={snapshot.settings.maxPlayers}
          />
          <RoomSettings
            roomCode={snapshot.code}
            settings={snapshot.settings}
            playerCount={snapshot.players.length}
            isHost={snapshot.hostPlayerId === snapshot.viewerPlayerId}
          />
          {leave.isError && (
            <p role="alert" className="text-sm text-destructive">
              {leave.error.message}
            </p>
          )}
          <Button
            variant="destructive"
            className="self-start"
            disabled={leave.isPending}
            onClick={() => leave.mutate()}
          >
            {leave.isPending ? 'Leaving…' : 'Leave room'}
          </Button>
        </Card>
      )}
    </div>
  );
}
