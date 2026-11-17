import { describe, expect, it } from '@jest/globals';
import { parseTimerMember, TimerKind, timerMember } from './presence.keys.js';

describe('timer members', () => {
  const roomId = '0b9f2d1e-6a4c-4b8e-9c3f-1a2b3c4d5e6f';
  const playerId = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

  it('round-trips every timer kind', () => {
    for (const kind of Object.values(TimerKind)) {
      expect(parseTimerMember(timerMember(kind, roomId, playerId))).toEqual({
        kind,
        roomId,
        playerId,
      });
    }
  });

  it('rejects unknown kinds and malformed members', () => {
    expect(parseTimerMember(`kick:${roomId}:${playerId}`)).toBeNull();
    expect(parseTimerMember(`away:${roomId}`)).toBeNull();
    expect(parseTimerMember(`away:${roomId}:${playerId}:extra`)).toBeNull();
    expect(parseTimerMember('')).toBeNull();
  });
});
