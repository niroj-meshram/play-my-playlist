import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/** Concurrent refreshes (several tabs share one cookie) may present the just-rotated token. */
export const REFRESH_GRACE_PERIOD_MS = 30_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface IssuedRefreshToken {
  sessionId: string;
  token: string;
  hash: string;
}

/** Token format: `<sessionId>.<256-bit secret>`. The session ID lets reuse be traced to its session. */
export function issueRefreshToken(sessionId: string = randomUUID()): IssuedRefreshToken {
  const token = `${sessionId}.${randomBytes(32).toString('base64url')}`;
  return { sessionId, token, hash: hashRefreshToken(token) };
}

export function parseRefreshToken(token: string | undefined): { sessionId: string } | null {
  if (!token) return null;
  const [sessionId, secret, ...rest] = token.split('.');
  if (rest.length > 0 || !sessionId || !secret) return null;
  if (!UUID_PATTERN.test(sessionId) || !SECRET_PATTERN.test(secret)) return null;
  return { sessionId };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesEqual(a: string | null, b: string): boolean {
  if (a === null || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface RefreshSessionState {
  refreshTokenHash: string;
  previousTokenHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type RefreshDecision =
  /** Current token: rotate it. */
  | 'ROTATE'
  /** Token rotated moments ago by a concurrent request: issue an access token, keep the cookie. */
  | 'GRACE'
  /** An old token was replayed: revoke the whole session. */
  | 'REUSE_DETECTED'
  /** Unknown, expired or revoked session. */
  | 'REJECT';

export function decideRefresh(
  session: RefreshSessionState | null,
  tokenHash: string,
  now: Date,
): RefreshDecision {
  if (!session || session.revokedAt !== null || session.expiresAt <= now) return 'REJECT';
  if (hashesEqual(session.refreshTokenHash, tokenHash)) return 'ROTATE';

  const withinGrace =
    session.rotatedAt !== null &&
    now.getTime() - session.rotatedAt.getTime() <= REFRESH_GRACE_PERIOD_MS;
  if (withinGrace && hashesEqual(session.previousTokenHash, tokenHash)) return 'GRACE';

  return 'REUSE_DETECTED';
}
