'use client';

import { useCallback, useEffect, useRef } from 'react';
import { emitWithAck, type GameSocket } from '@/lib/socket-client';

export interface ClockSample {
  /** Client clock when the ping was sent. */
  sentAt: number;
  /** Client clock when the reply arrived. */
  receivedAt: number;
  /** Server clock in the reply. */
  serverTime: number;
}

/**
 * Server clock minus client clock, in ms, from `time:ping` samples. The sample with the
 * shortest round trip is the most accurate; its reply is assumed to have taken half of it.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): number | null {
  let best: ClockSample | null = null;
  for (const s of samples) {
    if (!best || s.receivedAt - s.sentAt < best.receivedAt - best.sentAt) best = s;
  }
  if (!best) return null;
  return best.serverTime - (best.sentAt + (best.receivedAt - best.sentAt) / 2);
}

const SAMPLES = 5;
const RESYNC_MS = 60_000;
const RETRY_MS = 2_000;

/**
 * Estimates the server clock, so devices can start a song at the same point (D3b).
 * Returns a stable `serverNow()`; until the first estimate it falls back to the local clock.
 */
export function useServerClock(getSocket: () => GameSocket | null): () => number {
  const offsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const measure = async () => {
      const socket = getSocket();
      const samples: ClockSample[] = [];
      if (socket?.connected) {
        for (let i = 0; i < SAMPLES && !cancelled; i += 1) {
          const sentAt = Date.now();
          const ack = await emitWithAck(socket, 'time:ping', { clientSentAt: sentAt }, 5_000);
          if (ack.ok)
            samples.push({ sentAt, receivedAt: Date.now(), serverTime: ack.data.serverTime });
        }
      }
      if (cancelled) return;
      const offset = estimateClockOffset(samples);
      if (offset !== null) offsetRef.current = offset;
      timer = setTimeout(() => void measure(), offset === null ? RETRY_MS : RESYNC_MS);
    };
    void measure();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [getSocket]);

  return useCallback(() => Date.now() + offsetRef.current, []);
}
