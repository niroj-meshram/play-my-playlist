import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PlaybackReportRequest } from '@pmp/shared';
import {
  SongPlayback,
  YT_STATE,
  type PlaybackStatus,
  type PlayerPort,
  type SongPlaybackDeps,
} from './song-playback';

function fakePlayer() {
  const calls: string[] = [];
  const state = { currentTime: 0 };
  const player: PlayerPort = {
    loadVideoById: (id, start = 0) => calls.push(`load:${id}@${start}`),
    cueVideoById: (id, start = 0) => calls.push(`cue:${id}@${start}`),
    playVideo: () => calls.push('play'),
    stopVideo: () => calls.push('stop'),
    seekTo: (seconds) => calls.push(`seek:${seconds}`),
    getCurrentTime: () => state.currentTime,
  };
  return { player, calls, state };
}

function setup(deps: Partial<SongPlaybackDeps> = {}) {
  const reports: PlaybackReportRequest[] = [];
  const statuses: PlaybackStatus[] = [];
  const playback = new SongPlayback({
    report: (r) => reports.push(r),
    onStatus: (s) => statuses.push(s),
    autoplayTimeoutMs: 3_000,
    driftCheckMs: 5_000,
    maxDriftSec: 1.5,
    ...deps,
  });
  return { playback, reports, statuses, ...fakePlayer() };
}

const round1 = { roundNumber: 1, videoId: 'aaaaaaaaaaa' };
const round2 = { roundNumber: 2, videoId: 'bbbbbbbbbbb' };

describe('SongPlayback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('on the leader in the same room', () => {
    it('waits for a tap before the first song, because browsers block autoplay with sound', () => {
      const { playback, player, calls, statuses } = setup();
      playback.setTarget(round1);
      playback.attach(player);
      expect(calls).toEqual(['cue:aaaaaaaaaaa@0']);
      expect(statuses.at(-1)).toBe('needs-tap');

      playback.play();
      expect(calls.at(-1)).toBe('play');
      playback.onStateChange(YT_STATE.PLAYING);
      expect(statuses.at(-1)).toBe('playing');
    });

    it('autoplays later songs once audio has been unlocked', () => {
      const { playback, player, calls, statuses } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);

      playback.setTarget(null);
      expect(calls.at(-1)).toBe('stop');
      expect(statuses.at(-1)).toBe('idle');
      playback.setTarget(round2);
      expect(calls.at(-1)).toBe('load:bbbbbbbbbbb@0');
      expect(statuses.at(-1)).toBe('loading');
    });

    it('asks for a tap again when autoplay does not start in time', () => {
      const { playback, player, statuses } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);
      playback.setTarget(round2);

      jest.advanceTimersByTime(2_999);
      expect(statuses.at(-1)).toBe('loading');
      jest.advanceTimersByTime(1);
      expect(statuses.at(-1)).toBe('needs-tap');
    });

    it('does not reload the same song when the target is repeated', () => {
      const { playback, player, calls } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.setTarget({ ...round1 });
      expect(calls).toEqual(['cue:aaaaaaaaaaa@0']);
    });

    it('reports the end of the song once, for the song that was playing', () => {
      const { playback, player, reports } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.play();
      playback.onStateChange(YT_STATE.ENDED);
      playback.onStateChange(YT_STATE.ENDED);
      expect(reports).toEqual([{ roundNumber: 1, videoId: 'aaaaaaaaaaa', state: 'ENDED' }]);
    });

    it('reports a player error with its code so the server can replace the song', () => {
      const { playback, player, reports, statuses } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.onError(150);
      playback.onError(150);
      expect(reports).toEqual([
        { roundNumber: 1, videoId: 'aaaaaaaaaaa', state: 'ERROR', ytErrorCode: 150 },
      ]);
      expect(statuses.at(-1)).toBe('failed');

      // The replacement song arrives as a new target for the same round.
      playback.setTarget({ roundNumber: 1, videoId: 'ccccccccccc' });
      expect(statuses.at(-1)).toBe('needs-tap');
    });

    it('stops skipping songs when this device refuses one song after another', () => {
      const { playback, player, calls, reports, statuses } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.onError(150);
      expect(reports).toHaveLength(1); // one broken video is replaced as usual

      playback.setTarget({ roundNumber: 1, videoId: 'ccccccccccc' });
      playback.onError(150);
      expect(reports).toHaveLength(1); // a second failure in a row points at this device
      expect(statuses.at(-1)).toBe('blocked');
      expect(playback.lastErrorCode).toBe(150);

      // Later songs that fail are not reported either, until one plays.
      playback.setTarget(round2);
      playback.onError(101);
      expect(reports).toHaveLength(1);
      expect(statuses.at(-1)).toBe('blocked');

      playback.retry();
      expect(calls.at(-1)).toBe('cue:bbbbbbbbbbb@0');
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);
      playback.setTarget({ roundNumber: 3, videoId: 'ddddddddddd' });
      playback.onError(150);
      expect(reports).toHaveLength(2); // a song played, so this device is trusted again
    });

    it('ignores player events while no song should play', () => {
      const { playback, player, reports, statuses } = setup();
      playback.attach(player);
      playback.onStateChange(YT_STATE.ENDED);
      playback.onError(100);
      expect(reports).toEqual([]);
      expect(statuses).toEqual([]);
    });

    it('shows a paused song as resumable', () => {
      const { playback, player, calls, statuses } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);
      playback.onStateChange(YT_STATE.PAUSED);
      expect(statuses.at(-1)).toBe('paused');
      playback.play();
      expect(calls.at(-1)).toBe('play');
    });

    it('never checks drift for a song that is not synced', () => {
      const { playback, player, calls, state } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);
      state.currentTime = 90;
      jest.advanceTimersByTime(20_000);
      expect(calls.filter((c) => c.startsWith('seek'))).toEqual([]);
    });

    it('stops reacting once detached', () => {
      const { playback, player, calls, statuses } = setup();
      playback.attach(player);
      playback.setTarget(round1);
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);
      playback.setTarget(round2);
      playback.detach();
      jest.advanceTimersByTime(5_000);
      playback.setTarget(null);
      expect(statuses.at(-1)).toBe('loading');
      expect(calls.at(-1)).toBe('load:bbbbbbbbbbb@0');
    });
  });

  describe('on every device (remote)', () => {
    const startedAtMs = 1_000_000;
    const synced = { ...round1, startedAtMs };

    it('joins the song where everyone else is', () => {
      let now = startedAtMs + 12_000;
      const { playback, player, calls } = setup({ serverNow: () => now });
      playback.attach(player);
      playback.setTarget(synced);
      expect(calls).toEqual(['cue:aaaaaaaaaaa@12']);

      now += 3_000; // the player took a while to tap
      playback.play();
      expect(calls.slice(-2)).toEqual(['seek:15', 'play']);
    });

    it('seeks back into step when it drifts, and tolerates small gaps', () => {
      let now = startedAtMs;
      const { playback, player, calls, state } = setup({ serverNow: () => now });
      playback.attach(player);
      playback.setTarget(synced);
      playback.play();
      playback.onStateChange(YT_STATE.PLAYING);

      now += 5_000;
      state.currentTime = 4; // 1 s behind: fine
      jest.advanceTimersByTime(5_000);
      expect(calls.filter((c) => c.startsWith('seek'))).toEqual(['seek:0']);

      now += 5_000;
      state.currentTime = 6; // 4 s behind, e.g. after an ad
      jest.advanceTimersByTime(5_000);
      expect(calls.at(-1)).toBe('seek:10');
    });

    it('lets only the leader report, so other devices never move the game on', () => {
      let leader = false;
      const { playback, player, reports, statuses } = setup({
        serverNow: () => startedAtMs,
        canReport: () => leader,
      });
      playback.attach(player);
      playback.setTarget(synced);
      playback.onError(150);
      playback.onStateChange(YT_STATE.ENDED);
      expect(reports).toEqual([]);
      expect(statuses.at(-1)).toBe('failed');

      // After a host migration this device becomes the leader and reports.
      leader = true;
      playback.setTarget({ ...synced, videoId: 'ddddddddddd' });
      playback.onStateChange(YT_STATE.ENDED);
      expect(reports).toEqual([{ roundNumber: 1, videoId: 'ddddddddddd', state: 'ENDED' }]);
    });
  });
});
