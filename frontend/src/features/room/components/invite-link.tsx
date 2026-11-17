'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function InviteLink({ roomCode }: { roomCode: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}/join/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt('Copy this invite link:', url);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted-foreground">
        Room code{' '}
        <span className="font-mono text-2xl font-bold tracking-widest text-foreground">
          {roomCode}
        </span>
      </p>
      <Button size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? 'Link copied' : 'Copy invite link'}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Invite link copied to clipboard' : ''}
      </span>
    </div>
  );
}
