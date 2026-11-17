import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  GAME_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type WsAck,
} from '@pmp/shared';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function serverUrl(app: NestExpressApplication): string {
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}${GAME_NAMESPACE}`;
}

/** Connects a client like the browser does (websocket only, token in the handshake). */
export function connect(app: NestExpressApplication, token?: string): Promise<ClientSocket> {
  const socket: ClientSocket = io(serverUrl(app), {
    transports: ['websocket'],
    auth: token === undefined ? {} : { token },
    reconnection: false,
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

type AckData<E extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[E]>[1]
>[0];

export function emitAck<E extends keyof ClientToServerEvents>(
  socket: ClientSocket,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<AckData<E>> {
  return new Promise((resolve) => {
    // The typed overloads cannot express a generic event name; the contract is checked by E.
    (socket.emit as (e: string, p: unknown, ack: (r: AckData<E>) => void) => void)(
      event,
      payload,
      resolve,
    );
  });
}

export function okData<T>(ack: WsAck<T>): T {
  if (!ack.ok) throw new Error(`expected ok ack, got ${ack.error.code}: ${ack.error.message}`);
  return ack.data;
}

/** Resolves with the first matching event, or rejects after `timeoutMs`. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  predicate: (...args: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
  timeoutMs = 3_000,
): Promise<Parameters<ServerToClientEvents[E]>> {
  return new Promise((resolve, reject) => {
    const listener = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (!predicate(...args)) return;
      clearTimeout(timer);
      socket.off(event, listener as never);
      resolve(args);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener as never);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    socket.on(event, listener as never);
  });
}

/** Records every event of one type, to assert that something did NOT happen. */
export function record<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
): Parameters<ServerToClientEvents[E]>[] {
  const seen: Parameters<ServerToClientEvents[E]>[] = [];
  socket.on(event, ((...args: Parameters<ServerToClientEvents[E]>) => seen.push(args)) as never);
  return seen;
}

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
