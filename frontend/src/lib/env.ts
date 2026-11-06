/**
 * Public (browser-visible) configuration. Each variable must be read with a literal
 * `process.env.NEXT_PUBLIC_*` access so Next.js can inline it at build time.
 */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
} as const;
