'use client';

import { DISPLAY_NAME_LIMITS, type AvatarId } from '@pmp/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AVATAR_OPTIONS, avatarColor } from '../avatars';
import { createGuestSession } from '../session-api';

/** Creates the anonymous guest identity: a name and an avatar colour. */
export function GuestForm() {
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<AvatarId>(AVATAR_OPTIONS[0]);
  const mutation = useMutation({ mutationFn: createGuestSession });

  const trimmed = name.trim();
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) mutation.mutate({ displayName: trimmed, avatarId });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Who&apos;s playing?</CardTitle>
        <CardDescription>Pick a name and a colour. No account needed.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="guest-name">Your name</Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DISPLAY_NAME_LIMITS.maxLength}
            autoComplete="nickname"
            required
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {AVATAR_OPTIONS.map((id, index) => (
              <label key={id} className="cursor-pointer">
                <input
                  type="radio"
                  name="avatar"
                  value={id}
                  checked={avatarId === id}
                  onChange={() => setAvatarId(id)}
                  className="peer sr-only"
                  aria-label={`Colour ${index + 1}`}
                />
                <span
                  className={cn(
                    'block size-8 rounded-full ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                    avatarColor(id),
                  )}
                />
              </label>
            ))}
          </div>
        </fieldset>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!trimmed || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </Card>
  );
}
