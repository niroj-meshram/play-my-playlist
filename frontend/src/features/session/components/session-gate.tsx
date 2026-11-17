'use client';

import type { ReactNode } from 'react';
import { useSessionBootstrap } from '../hooks/use-session-bootstrap';
import { useSessionStore } from '../session-store';
import { GuestForm } from './guest-form';

/** Renders its children only once a guest session exists; otherwise asks for one. */
export function SessionGate({ children }: { children: ReactNode }) {
  useSessionBootstrap();
  const status = useSessionStore((s) => s.status);

  if (status === 'loading') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (status === 'anonymous') return <GuestForm />;
  return <>{children}</>;
}
