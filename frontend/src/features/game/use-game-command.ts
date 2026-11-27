'use client';

import type { ClientToServerEvents, WsAck } from '@pmp/shared';
import { useCallback, useState } from 'react';
import { emitWithAck, type GameSocket } from '@/lib/socket-client';

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type Result<E extends keyof ClientToServerEvents> =
  Parameters<Parameters<ClientToServerEvents[E]>[1]>[0] extends WsAck<infer T> ? T : never;

interface GameCommand<E extends keyof ClientToServerEvents> {
  /** Resolves with the acknowledged result, or `null` when the command failed. */
  run: (payload: Payload<E>) => Promise<Result<E> | null>;
  pending: boolean;
  error: string | null;
}

/**
 * Sends one game command over the room socket and tracks its pending/error state.
 * State changes arrive as server events; a caller may also use the acknowledged result.
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
        return null;
      }
      setPending(true);
      setError(null);
      try {
        const ack = (await emitWithAck(socket, event, payload)) as WsAck<Result<E>>;
        if (ack.ok) return ack.data;
        setError(ack.error.message);
        return null;
      } finally {
        setPending(false);
      }
    },
    [getSocket, event],
  );

  return { run, pending, error };
}
