'use client';

import { ROOM_CODE_LENGTH } from '@pmp/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '../../session/components/player-avatar';
import { useSessionStore } from '../../session/session-store';
import { roomApi } from '../room-api';

export function HomeActions() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const [code, setCode] = useState('');
  const create = useMutation({
    mutationFn: () => roomApi.create(),
    onSuccess: (room) => router.push(`/room/${room.code}`),
  });

  const normalized = code.trim().toUpperCase();
  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    if (normalized.length === ROOM_CODE_LENGTH) router.push(`/join/${normalized}`);
  };

  return (
    <Card className="w-full">
      {user && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <PlayerAvatar
            avatarId={user.avatarId}
            name={user.displayName}
            className="size-6 text-xs"
          />
          Playing as <span className="font-medium text-foreground">{user.displayName}</span>
        </p>
      )}
      <Button size="lg" disabled={create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? 'Creating…' : 'Create a room'}
      </Button>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {create.error.message}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onJoin} className="flex flex-col gap-2">
        <Label htmlFor="room-code">Join with a code</Label>
        <div className="flex gap-2">
          <Input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={ROOM_CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono tracking-widest uppercase"
            placeholder="ABC234"
          />
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            disabled={normalized.length !== ROOM_CODE_LENGTH}
          >
            Join
          </Button>
        </div>
      </form>
    </Card>
  );
}
