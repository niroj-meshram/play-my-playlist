import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env automatically; Node's built-in loader avoids a dotenv dependency.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file (e.g. CI): rely on the process environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
