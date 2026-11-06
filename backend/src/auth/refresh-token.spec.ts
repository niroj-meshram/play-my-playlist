import { describe, expect, it } from '@jest/globals';
import {
  decideRefresh,
  hashRefreshToken,
  issueRefreshToken,
  parseRefreshToken,
  REFRESH_GRACE_PERIOD_MS,
  type RefreshSessionState,
} from './refresh-token.js';

const now = new Date('2026-11-06T12:00:00Z');
const current = issueRefreshToken();
const previous = issueRefreshToken(current.sessionId);

function session(overrides: Partial<RefreshSessionState> = {}): RefreshSessionState {
  return {
    refreshTokenHash: current.hash,
    previousTokenHash: previous.hash,
    rotatedAt: new Date(now.getTime() - 1_000),
    expiresAt: new Date(now.getTime() + 86_400_000),
    revokedAt: null,
    ...overrides,
  };
}

describe('refresh tokens', () => {
  it('issues unique tokens that embed the session ID and parse back', () => {
    const a = issueRefreshToken();
    const b = issueRefreshToken();

    expect(a.token).not.toBe(b.token);
    expect(parseRefreshToken(a.token)).toEqual({ sessionId: a.sessionId });
    expect(a.hash).toBe(hashRefreshToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    undefined,
    '',
    'garbage',
    'not-a-uuid.abc',
    `${current.sessionId}.short`,
    `${current.token}.extra`,
  ])('rejects malformed token %p', (token) => {
    expect(parseRefreshToken(token)).toBeNull();
  });
});

describe('decideRefresh', () => {
  it('rotates the current token', () => {
    expect(decideRefresh(session(), current.hash, now)).toBe('ROTATE');
  });

  it('accepts the previous token within the grace period', () => {
    expect(decideRefresh(session(), previous.hash, now)).toBe('GRACE');
  });

  it('treats the previous token after the grace period as reuse', () => {
    const rotatedAt = new Date(now.getTime() - REFRESH_GRACE_PERIOD_MS - 1);
    expect(decideRefresh(session({ rotatedAt }), previous.hash, now)).toBe('REUSE_DETECTED');
  });

  it('treats an older token as reuse', () => {
    expect(decideRefresh(session(), issueRefreshToken(current.sessionId).hash, now)).toBe(
      'REUSE_DETECTED',
    );
  });

  it('rejects missing, revoked and expired sessions', () => {
    expect(decideRefresh(null, current.hash, now)).toBe('REJECT');
    expect(decideRefresh(session({ revokedAt: now }), current.hash, now)).toBe('REJECT');
    expect(decideRefresh(session({ expiresAt: now }), current.hash, now)).toBe('REJECT');
  });
});
