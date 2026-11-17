/**
 * Public (browser-visible) configuration. Each variable must be read with a literal
 * `process.env.NEXT_PUBLIC_*` access so Next.js can inline it at build time.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const publicEnv = {
  apiUrl,
  /** Socket.IO connects to the API origin; the namespace is appended by the socket client. */
  socketOrigin: new URL(apiUrl).origin,
} as const;
