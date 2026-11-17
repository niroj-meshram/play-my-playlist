import { describe, expect, it } from '@jest/globals';
import type { GameSocket } from './socket-client';
import { emitWithAck } from './socket-client';

/** Minimal stand-in that, like Socket.IO, needs `this` inside emit(). */
function fakeSocket(reply: (event: string, payload: unknown) => unknown, fail = false) {
  return {
    _opts: { timeout: 0 },
    timeout(ms: number) {
      return {
        _opts: { timeout: ms },
        emit(
          this: { _opts: { timeout: number } },
          event: string,
          payload: unknown,
          cb: (err: Error | null, response: unknown) => void,
        ) {
          // Throws "Cannot read properties of undefined" if called unbound.
          expect(this._opts.timeout).toBe(ms);
          cb(fail ? new Error('operation has timed out') : null, reply(event, payload));
        },
      };
    },
  } as unknown as GameSocket;
}

describe('emitWithAck', () => {
  it('resolves with the server acknowledgement', async () => {
    const socket = fakeSocket((event, payload) => ({ ok: true, data: { event, payload } }));

    await expect(emitWithAck(socket, 'time:ping', { clientSentAt: 1 }, 500)).resolves.toEqual({
      ok: true,
      data: { event: 'time:ping', payload: { clientSentAt: 1 } },
    });
  });

  it('turns a timeout into an error acknowledgement', async () => {
    const socket = fakeSocket(() => undefined, true);

    await expect(emitWithAck(socket, 'sync:request', {}, 500)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
});
