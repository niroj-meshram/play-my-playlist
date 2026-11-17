'use client';

import { useEffect } from 'react';
import { refreshSession } from '../session-api';
import { useSessionStore } from '../session-store';

/** Restores the guest session from the refresh cookie once per page load. */
export function useSessionBootstrap(): void {
  const status = useSessionStore((s) => s.status);
  useEffect(() => {
    if (status === 'loading') {
      refreshSession().catch(() => {
        // No or expired cookie: the store is now anonymous and the guest form is shown.
      });
    }
  }, [status]);
}
