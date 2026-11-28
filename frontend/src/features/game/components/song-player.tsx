'use client';

import type { PlaybackMode } from '@pmp/shared';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import type { PlaybackTarget } from '../playback/song-playback';
import { useSongPlayer } from '../playback/use-song-player';
import type { YouTubeApi } from '../playback/youtube-api';

/**
 * The song player. In LEADER_ONLY mode only the leader sees it (D3); in EVERY_DEVICE mode
 * every player does, synced to the server clock (D3b). The player stays visible at
 * 200×200 px or more, as YouTube's embedding policies require.
 */
export function SongPlayer({
  target,
  connection,
  isLeader,
  mode,
  loadApi,
}: {
  target: PlaybackTarget | null;
  connection: RoomConnection;
  isLeader: boolean;
  mode: PlaybackMode;
  /** Replaces the YouTube script loader in tests. */
  loadApi?: () => Promise<YouTubeApi>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, loadFailed, play, retry, errorCode } = useSongPlayer(containerRef, target, {
    getSocket: connection.getSocket,
    isLeader,
    loadApi,
  });

  return (
    <section aria-label="Song player" className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="aspect-video min-h-[200px] w-full min-w-[200px] overflow-hidden rounded-lg bg-black"
      />
      {loadFailed ? (
        <p role="alert" className="text-sm text-destructive">
          The YouTube player could not load. Check your connection, then reload the page.
        </p>
      ) : (
        <>
          {(status === 'needs-tap' || status === 'paused') && target && (
            <div className="flex flex-col gap-1">
              <Button className="self-start" onClick={play}>
                {status === 'paused' ? 'Resume song' : 'Play song'}
              </Button>
              {status === 'needs-tap' && (
                <p className="text-xs text-muted-foreground">
                  Your browser needs a tap before it can play sound.
                </p>
              )}
            </div>
          )}
          {status === 'blocked' && (
            <div role="alert" className="flex flex-col gap-2 text-sm">
              <p className="text-destructive">
                YouTube refused to play several songs in a row on this device
                {errorCode === null ? '' : ` (YouTube error ${errorCode})`}, so songs are no longer
                skipped automatically.
              </p>
              <p className="text-muted-foreground">
                {isLeader
                  ? 'Try again, or use “Stop song” to move on. If it keeps happening, open the game on another device or browser.'
                  : 'Try again, or listen on another device. The game carries on for everyone else.'}
              </p>
              <Button variant="outline" size="sm" className="self-start" onClick={retry}>
                Try again
              </Button>
            </div>
          )}
          {status === 'failed' && (
            <p role="status" className="text-sm text-muted-foreground">
              {isLeader
                ? "This song can't play here. Finding another one from the same playlist…"
                : "This song can't play on your device. The others can still hear it."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {mode === 'EVERY_DEVICE'
              ? 'Everyone hears the song on their own device. Ads may play on some devices; the song catches up afterwards.'
              : "You're the leader: the music plays only on this device, so turn it up."}
          </p>
        </>
      )}
    </section>
  );
}
