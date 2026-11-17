'use client';

import { DISPLAY_NAME_LIMITS, ErrorCode } from '@pmp/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { useSessionStore } from '../../session/session-store';
import { roomApi } from '../room-api';

/** Invite landing: shows who is in the room and joins with an editable name. */
export function JoinRoom({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const profileName = useSessionStore((s) => s.user?.displayName ?? '');
  const [name, setName] = useState(profileName);
  const preview = useQuery({
    queryKey: ['rooms', roomCode, 'preview'],
    queryFn: () => roomApi.preview(roomCode),
    retry: false,
  });
  const join = useMutation({
    mutationFn: (displayName: string) => roomApi.join(roomCode, { displayName }),
    onSuccess: () => router.push(`/room/${roomCode}`),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) join.mutate(trimmed);
  };

  if (preview.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Looking up room {roomCode}…
      </p>
    );
  }
  if (preview.isError) {
    const notFound =
      preview.error instanceof ApiError && preview.error.code === ErrorCode.ROOM_NOT_FOUND;
    return (
      <Card className="w-full">
        <CardTitle>{notFound ? 'Room not found' : 'Could not load the room'}</CardTitle>
        <CardDescription>
          {notFound ? `Check the code ${roomCode} and try again.` : preview.error.message}
        </CardDescription>
        <Button variant="outline" onClick={() => router.push('/')}>
          Back home
        </Button>
      </Card>
    );
  }

  const room = preview.data;
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          Join room <span className="font-mono tracking-widest">{room.code}</span>
        </CardTitle>
        <CardDescription>
          {room.playerCount}/{room.maxPlayers} players
          {room.status !== 'LOBBY' && ' · a game is in progress'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="join-name">Name in this room</Label>
          <Input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DISPLAY_NAME_LIMITS.maxLength}
            aria-invalid={
              join.error instanceof ApiError && join.error.code === ErrorCode.DISPLAY_NAME_TAKEN
            }
            required
          />
        </div>
        {join.isError && (
          <p role="alert" className="text-sm text-destructive">
            {join.error.message}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!name.trim() || join.isPending}>
          {join.isPending ? 'Joining…' : room.joinable ? 'Join room' : 'Rejoin room'}
        </Button>
      </form>
    </Card>
  );
}
