'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { emitWithAck, type GameSocket } from '@/lib/socket-client';
import { useServerClock } from './server-clock';
import { SongPlayback, type PlaybackStatus, type PlaybackTarget } from './song-playback';
import { loadYouTubeApi, type YouTubeApi, type YouTubePlayer } from './youtube-api';

export interface SongPlayer {
  status: PlaybackStatus;
  /** The YouTube script or player failed to load. */
  loadFailed: boolean;
  /** Starts or resumes playback; call from a click. */
  play: () => void;
  /** Tries the current song again after songs kept failing on this device. */
  retry: () => void;
  /** YouTube's error code for the latest failure on this device. */
  errorCode: number | null;
}

export interface SongPlayerOptions {
  getSocket: () => GameSocket | null;
  /** Only the leader's device reports song endings and errors (D3, D3b). */
  isLeader: boolean;
  /** Replaces the YouTube script loader in tests. */
  loadApi?: () => Promise<YouTubeApi>;
}

/**
 * Mounts a YouTube player inside `containerRef` and keeps it on the server's target.
 * The leader's song endings and errors go back to the server as `playback:report`; it
 * decides what happens next (discussion, or a replacement song).
 */
export function useSongPlayer(
  containerRef: RefObject<HTMLDivElement | null>,
  target: PlaybackTarget | null,
  { getSocket, isLeader, loadApi = loadYouTubeApi }: SongPlayerOptions,
): SongPlayer {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const controllerRef = useRef<SongPlayback | null>(null);
  const serverNow = useServerClock(getSocket);
  // Leadership can move to this device mid-song (host migration) without a remount.
  const isLeaderRef = useRef(isLeader);
  useEffect(() => {
    isLeaderRef.current = isLeader;
  }, [isLeader]);

  useEffect(() => {
    const controller = new SongPlayback({
      // Fire and forget: the outcome arrives as game events. A stale report is ignored
      // by the server, and a lost one is covered by the leader's "Stop song" button.
      report: (report) => {
        const socket = getSocket();
        if (socket?.connected) void emitWithAck(socket, 'playback:report', report);
      },
      canReport: () => isLeaderRef.current,
      onStatus: (next) => {
        setStatus(next);
        setErrorCode(controller.lastErrorCode);
      },
      serverNow,
    });
    controllerRef.current = controller;

    let player: YouTubePlayer | null = null;
    let cancelled = false;
    // YouTube replaces its element with an iframe, so it gets one React does not manage.
    const host = document.createElement('div');
    host.className = 'size-full';
    containerRef.current?.appendChild(host);

    loadApi().then(
      (api) => {
        if (cancelled) return;
        player = new api.Player(host, {
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: (event) => controller.attach(event.target),
            onStateChange: (event) => controller.onStateChange(event.data),
            onError: (event) => controller.onError(event.data),
          },
        });
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );

    return () => {
      cancelled = true;
      controller.detach();
      controllerRef.current = null;
      player?.destroy();
      host.remove();
    };
  }, [containerRef, getSocket, loadApi, serverNow]);

  const roundNumber = target?.roundNumber;
  const videoId = target?.videoId;
  const startedAtMs = target?.startedAtMs;
  useEffect(() => {
    controllerRef.current?.setTarget(
      roundNumber !== undefined && videoId !== undefined
        ? { roundNumber, videoId, ...(startedAtMs === undefined ? {} : { startedAtMs }) }
        : null,
    );
  }, [roundNumber, videoId, startedAtMs]);

  const play = useCallback(() => controllerRef.current?.play(), []);
  const retry = useCallback(() => controllerRef.current?.retry(), []);
  return { status, loadFailed, play, retry, errorCode };
}
