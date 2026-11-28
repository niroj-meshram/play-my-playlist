import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Development only: hosts (e.g. this machine's LAN IP) allowed to load the dev server's
  // assets, so phones on the same network can join a test game. Comma-separated.
  allowedDevOrigins: process.env.DEV_ALLOWED_HOSTS?.split(',').map((h) => h.trim()),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
