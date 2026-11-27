'use client';

import type { ClientToServerEvents, WsAck } from '@pmp/shared';
import { useCallback, useState } from 'react';
import { emitWithAck, type GameSocket } from '@/lib/socket-client';

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];

interface GameCommand<E extends keyof ClientToServerEvents> {
  run: (payload: Payload<E>) => Promise<void>;
  pending: boolean;
  error: string | null;
}

/**
 * Sends one game command over the room socket and tracks its pending/error state.
 * The resulting state change arrives as a server event, so nothing is applied locally.
 */
export function useGameCommand<E extends keyof ClientToServerEvents>(
  getSocket: () => GameSocket | null,
  event: E,
): GameCommand<E> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (payload: Payload<E>) => {
      const socket = getSocket();
      if (!socket?.connected) {
        setError('Not connected. Please wait a moment.');
        return;
      }
      setPending(true);
      setError(null);
      try {
        const ack = (await emitWithAck(socket, event, payload)) as WsAck<unknown>;
        if (!ack.ok) setError(ack.error.message);
      } finally {
        setPending(false);
      }
    },
    [getSocket, event],
  );

  return { run, pending, error };
}
