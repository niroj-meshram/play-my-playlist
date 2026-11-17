import {
  GAME_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type WsAck,
} from '@pmp/shared';
import { io, type Socket } from 'socket.io-client';
import { publicEnv } from './env';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates the game socket (not yet connected). The token callback runs on every
 * (re)connection attempt, so reconnects always present a fresh access token.
 */
export function createGameSocket(getToken: () => Promise<string>): GameSocket {
  return io(`${publicEnv.socketOrigin}${GAME_NAMESPACE}`, {
    transports: ['websocket'],
    autoConnect: false,
    auth: (cb) => {
      getToken().then(
        (token) => cb({ token }),
        () => cb({ token: '' }),
      );
    },
  });
}

type AckOf<E extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[E]>[1]
>[0];

/** Emits a command and resolves with its acknowledgement (or a timeout error ack). */
export function emitWithAck<E extends keyof ClientToServerEvents>(
  socket: GameSocket,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
  timeoutMs = 10_000,
): Promise<AckOf<E>> {
  return new Promise((resolve) => {
    // The typed overloads cannot express a generic event name; call it as a method so
    // `this` stays bound to the timeout-wrapped socket.
    const timed = socket.timeout(timeoutMs) as unknown as {
      emit: (e: string, p: unknown, cb: (err: Error | null, response: AckOf<E>) => void) => void;
    };
    timed.emit(event, payload, (err, response) => {
      if (err) {
        resolve({
          ok: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'The server did not respond.' },
        } as WsAck<never> as AckOf<E>);
        return;
      }
      resolve(response);
    });
  });
}
