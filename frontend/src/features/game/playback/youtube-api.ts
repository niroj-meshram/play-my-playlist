import type { PlayerPort } from './song-playback';

/*
 * Minimal typings for the official YouTube IFrame Player API, covering only what the
 * song player uses. Reference: https://developers.google.com/youtube/iframe_api_reference
 */

export interface YouTubePlayer extends PlayerPort {
  destroy(): void;
}

export interface YouTubePlayerOptions {
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api';

let loading: Promise<YouTubeApi> | null = null;

/** Loads the IFrame Player API script once per page. A failed load can be retried. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error('The YouTube player could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
