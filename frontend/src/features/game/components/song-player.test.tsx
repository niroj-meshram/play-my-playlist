import { describe, expect, it } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { GameSocket } from '@/lib/socket-client';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import type { YouTubeApi, YouTubePlayer, YouTubePlayerOptions } from '../playback/youtube-api';
import { SongPlayer } from './song-player';

/** Stands in for YT.Player: records calls and lets the test fire player events. */
function fakeYouTube() {
  const calls: string[] = [];
  let options: YouTubePlayerOptions | undefined;
  let instance: YouTubePlayer | undefined;
  class Player implements YouTubePlayer {
    constructor(_el: HTMLElement, opts: YouTubePlayerOptions) {
      options = opts;
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- captured for the test
      instance = this;
    }
    loadVideoById = (id: string, start = 0) => calls.push(`load:${id}@${Math.round(start)}`);
    cueVideoById = (id: string, start = 0) => calls.push(`cue:${id}@${Math.round(start)}`);
    playVideo = () => calls.push('play');
    stopVideo = () => calls.push('stop');
    seekTo = (seconds: number) => calls.push(`seek:${Math.round(seconds)}`);
    getCurrentTime = () => 0;
    destroy = () => calls.push('destroy');
  }
  const api: YouTubeApi = { Player };
  return {
    calls,
    loadApi: () => Promise.resolve(api),
    ready: () => act(() => options?.events?.onReady?.({ target: instance as YouTubePlayer })),
    state: (data: number) => act(() => options?.events?.onStateChange?.({ data })),
    error: (data: number) => act(() => options?.events?.onError?.({ data })),
    get options() {
      return options;
    },
  };
}

function fakeConnection() {
  const emitted: [string, unknown][] = [];
  const socket = {
    connected: true,
    timeout: () => ({
      emit: (event: string, payload: unknown, cb: (err: null, res: unknown) => void) => {
        if (event === 'time:ping') {
          // The fake server clock runs exactly in step with the test's clock.
          cb(null, { ok: true, data: { serverTime: Date.now() } });
          return;
        }
        emitted.push([event, payload]);
        cb(null, { ok: true, data: { applied: true } });
      },
    }),
  } as unknown as GameSocket;
  const connection: RoomConnection = {
    reclaim: () => {},
    close: () => {},
    getSocket: () => socket,
  };
  return { connection, emitted };
}

const target = { roundNumber: 3, videoId: 'abcdefghijk' };

async function mount(
  yt: ReturnType<typeof fakeYouTube>,
  connection: RoomConnection,
  props: Partial<Parameters<typeof SongPlayer>[0]> = {},
) {
  const view = render(
    <SongPlayer
      target={target}
      connection={connection}
      isLeader
      mode="LEADER_ONLY"
      loadApi={yt.loadApi}
      {...props}
    />,
  );
  await act(async () => {}); // let the API promise resolve
  yt.ready();
  return view;
}

describe('SongPlayer', () => {
  it('loads the video by ID only, never with its playlist', async () => {
    const yt = fakeYouTube();
    await mount(yt, fakeConnection().connection);
    expect(yt.calls).toEqual(['cue:abcdefghijk@0']);
    expect(JSON.stringify(yt.options?.playerVars)).not.toMatch(/list/);
    // Standard host: privacy-enhanced mode (youtube-nocookie.com) is suspected of refusing
    // label music videos (every song failed with it on 2026-11-28).
    expect(JSON.stringify(yt.options)).not.toMatch(/nocookie/);
  });

  it('asks the leader for a tap before playing sound', async () => {
    const yt = fakeYouTube();
    await mount(yt, fakeConnection().connection);
    expect(screen.getByText(/needs a tap/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play song' }));
    expect(yt.calls.at(-1)).toBe('play');
    yt.state(1);
    expect(screen.queryByRole('button', { name: 'Play song' })).not.toBeInTheDocument();
  });

  it('reports the end of the song to the server', async () => {
    const yt = fakeYouTube();
    const { connection, emitted } = fakeConnection();
    await mount(yt, connection);
    yt.state(0);
    expect(emitted).toEqual([
      ['playback:report', { roundNumber: 3, videoId: 'abcdefghijk', state: 'ENDED' }],
    ]);
  });

  it('reports an unplayable video and says a replacement is coming', async () => {
    const yt = fakeYouTube();
    const { connection, emitted } = fakeConnection();
    await mount(yt, connection);
    yt.error(101);
    expect(emitted[0]?.[1]).toMatchObject({ state: 'ERROR', ytErrorCode: 101 });
    expect(screen.getByRole('status')).toHaveTextContent(/Finding another one/);
  });

  it('stops skipping and explains when YouTube refuses songs on this device', async () => {
    const yt = fakeYouTube();
    const { connection, emitted } = fakeConnection();
    const view = await mount(yt, connection);
    yt.error(150);
    view.rerender(
      <SongPlayer
        target={{ ...target, videoId: 'zzzzzzzzzzz' }}
        connection={connection}
        isLeader
        mode="LEADER_ONLY"
        loadApi={yt.loadApi}
      />,
    );
    yt.error(150);
    expect(emitted).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/refused to play several songs.*error 150/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(yt.calls.at(-1)).toBe('cue:zzzzzzzzzzz@0');
  });

  it('stops the song when the round moves on, and cleans up on unmount', async () => {
    const yt = fakeYouTube();
    const { connection } = fakeConnection();
    const view = await mount(yt, connection);
    view.rerender(
      <SongPlayer
        target={null}
        connection={connection}
        isLeader
        mode="LEADER_ONLY"
        loadApi={yt.loadApi}
      />,
    );
    expect(yt.calls.at(-1)).toBe('stop');
    view.unmount();
    expect(yt.calls.at(-1)).toBe('destroy');
  });

  it('starts a remote player where the song already is', async () => {
    const yt = fakeYouTube();
    await mount(yt, fakeConnection().connection, {
      target: { ...target, startedAtMs: Date.now() - 30_000 },
      mode: 'EVERY_DEVICE',
    });
    expect(yt.calls[0]).toMatch(/^cue:abcdefghijk@(30|31)$/);
    expect(screen.getByText(/Ads may play on some devices/)).toBeInTheDocument();
  });

  it('never reports from a device that is not the leader', async () => {
    const yt = fakeYouTube();
    const { connection, emitted } = fakeConnection();
    await mount(yt, connection, { isLeader: false, mode: 'EVERY_DEVICE' });
    yt.error(150);
    yt.state(0);
    expect(emitted).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent(/can't play on your device/);
  });

  it('explains when the YouTube player cannot load', async () => {
    render(
      <SongPlayer
        target={target}
        connection={fakeConnection().connection}
        isLeader
        mode="LEADER_ONLY"
        loadApi={() => Promise.reject(new Error('blocked'))}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/);
  });
});
