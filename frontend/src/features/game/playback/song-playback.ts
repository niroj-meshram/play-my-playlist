import type { PlaybackReportRequest } from '@pmp/shared';

/** YouTube IFrame player states (YT.PlayerState). */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** The player methods this controller uses; the real YT.Player satisfies it. */
export interface PlayerPort {
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  playVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
}

/** The song this device should be playing, or `null` outside PLAYING. */
export interface PlaybackTarget {
  roundNumber: number;
  videoId: string;
  /**
   * Server time (epoch ms) when the song started. Set in EVERY_DEVICE mode only: every
   * device then plays from the same point. Without it the song starts from the beginning.
   */
  startedAtMs?: number;
}

export type PlaybackStatus =
  /** Nothing should play. */
  | 'idle'
  /** A song was loaded and should start by itself. */
  | 'loading'
  /** The browser needs a tap before it plays sound. */
  | 'needs-tap'
  | 'playing'
  | 'paused'
  /** The song cannot play on this device. */
  | 'failed'
  /**
   * Songs keep failing on this device (e.g. YouTube refuses the embed here), so it stopped
   * reporting them: otherwise every song would be skipped within seconds.
   */
  | 'blocked';

export interface SongPlaybackDeps {
  /** Sends a report to the server. Only called while `canReport()` is true. */
  report: (report: PlaybackReportRequest) => void;
  /** Only the leader's device reports: its player decides when a song ended or failed. */
  canReport?: () => boolean;
  onStatus: (status: PlaybackStatus) => void;
  /** Estimated server clock (epoch ms), for synced playback. */
  serverNow?: () => number;
  /** How long a song may take to start by itself before asking for a tap. */
  autoplayTimeoutMs?: number;
  /** How often a synced song checks that it is still in step. */
  driftCheckMs?: number;
  /** Largest tolerated gap, in seconds, before a synced song seeks back into step. */
  maxDriftSec?: number;
}

const DEFAULT_AUTOPLAY_TIMEOUT_MS = 4_000;
const DEFAULT_DRIFT_CHECK_MS = 5_000;
const DEFAULT_MAX_DRIFT_SEC = 1.5;
/** Failures in a row, without any song playing in between, that point at the device. */
const MAX_FAILURES_IN_A_ROW = 2;

/**
 * Drives one device's YouTube player. The server decides which song plays; this follows
 * its target. In LEADER_ONLY mode only the leader's device runs it (D3); in EVERY_DEVICE
 * mode every device does and keeps in step with the server clock (D3b). Videos load by
 * ID only, never with their playlist, so nothing on the player can hint at the owner.
 *
 * Browsers block autoplay with sound until the page gets a tap, so the first song is only
 * cued and waits for `play()` from a click. Later songs autoplay; if one does not start
 * in time, the tap is asked for again.
 */
export class SongPlayback {
  private player: PlayerPort | null = null;
  private target: PlaybackTarget | null = null;
  private status: PlaybackStatus = 'idle';
  private audioUnlocked = false;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private driftTimer: ReturnType<typeof setInterval> | undefined;
  /** One report per song and outcome, however often the player repeats an event. */
  private readonly reported = new Set<string>();
  private failuresInARow = 0;
  /** The video whose failure was counted last; repeated error events for it count once. */
  private failedVideoId: string | null = null;
  /** The YouTube error code of the latest failure on this device. */
  lastErrorCode: number | null = null;

  constructor(private readonly deps: SongPlaybackDeps) {}

  attach(player: PlayerPort): void {
    this.player = player;
    this.apply();
  }

  detach(): void {
    this.clearTimers();
    this.player = null;
  }

  setTarget(target: PlaybackTarget | null): void {
    const same =
      target?.roundNumber === this.target?.roundNumber &&
      target?.videoId === this.target?.videoId &&
      target?.startedAtMs === this.target?.startedAtMs;
    if (same) return;
    this.target = target ? { ...target } : null;
    this.apply();
  }

  /** Starts or resumes the song. Must be called from a user gesture such as a click. */
  play(): void {
    if (!this.player || !this.target) return;
    this.audioUnlocked = true;
    const position = this.syncedPosition();
    if (position !== null) this.player.seekTo(position, true);
    this.player.playVideo();
  }

  onStateChange(state: number): void {
    if (!this.player || !this.target) return;
    switch (state) {
      case YT_STATE.PLAYING:
        clearTimeout(this.watchdog);
        this.audioUnlocked = true;
        this.failuresInARow = 0;
        this.failedVideoId = null;
        this.setStatus('playing');
        this.startDriftChecks();
        break;
      case YT_STATE.PAUSED:
        this.stopDriftChecks();
        this.setStatus('paused');
        break;
      case YT_STATE.ENDED:
        this.stopDriftChecks();
        this.reportOnce({ ...this.reportTarget(), state: 'ENDED' });
        break;
    }
  }

  onError(ytErrorCode: number): void {
    if (!this.player || !this.target) return;
    if (this.failedVideoId === this.target.videoId) return;
    this.failedVideoId = this.target.videoId;
    this.clearTimers();
    this.lastErrorCode = ytErrorCode;
    this.failuresInARow += 1;
    // One failing song is replaced. Song after song failing means YouTube refuses this
    // device, and reporting each would make the server skip (and mark) every song.
    if (this.failuresInARow >= MAX_FAILURES_IN_A_ROW) {
      this.setStatus('blocked');
      return;
    }
    this.setStatus('failed');
    this.reportOnce({ ...this.reportTarget(), state: 'ERROR', ytErrorCode });
  }

  /** Tries the current song again after a block. Failures are not reported until a song plays. */
  retry(): void {
    this.failedVideoId = null;
    this.apply();
  }

  private apply(): void {
    this.clearTimers();
    const player = this.player;
    if (!player) return;
    const target = this.target;
    if (!target) {
      // Something was loaded for the previous target (the leader moved on): silence it.
      if (this.status !== 'idle') player.stopVideo();
      this.setStatus('idle');
      return;
    }
    const start = this.syncedPosition() ?? 0;
    if (!this.audioUnlocked) {
      player.cueVideoById(target.videoId, start);
      this.setStatus('needs-tap');
      return;
    }
    player.loadVideoById(target.videoId, start);
    this.setStatus('loading');
    this.watchdog = setTimeout(() => {
      if (this.status === 'loading') this.setStatus('needs-tap');
    }, this.deps.autoplayTimeoutMs ?? DEFAULT_AUTOPLAY_TIMEOUT_MS);
  }

  /** Seconds into the song every device should be at now, or `null` when not syncing. */
  private syncedPosition(): number | null {
    const startedAtMs = this.target?.startedAtMs;
    if (startedAtMs === undefined || !this.deps.serverNow) return null;
    return Math.max(0, (this.deps.serverNow() - startedAtMs) / 1_000);
  }

  /** Ads and buffering put devices out of step; seek back once the gap gets noticeable. */
  private startDriftChecks(): void {
    this.stopDriftChecks();
    if (this.syncedPosition() === null) return;
    this.driftTimer = setInterval(() => {
      const expected = this.syncedPosition();
      if (!this.player || expected === null || this.status !== 'playing') return;
      const drift = Math.abs(this.player.getCurrentTime() - expected);
      if (drift > (this.deps.maxDriftSec ?? DEFAULT_MAX_DRIFT_SEC)) {
        this.player.seekTo(expected, true);
      }
    }, this.deps.driftCheckMs ?? DEFAULT_DRIFT_CHECK_MS);
  }

  private stopDriftChecks(): void {
    clearInterval(this.driftTimer);
    this.driftTimer = undefined;
  }

  private clearTimers(): void {
    clearTimeout(this.watchdog);
    this.stopDriftChecks();
  }

  private reportTarget(): { roundNumber: number; videoId: string } {
    const { roundNumber, videoId } = this.target as PlaybackTarget;
    return { roundNumber, videoId };
  }

  private reportOnce(report: PlaybackReportRequest): void {
    if (this.deps.canReport && !this.deps.canReport()) return;
    const key = `${report.roundNumber}:${report.videoId}:${report.state}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.deps.report(report);
  }

  private setStatus(status: PlaybackStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.deps.onStatus(status);
  }
}
