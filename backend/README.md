# @pmp/backend

NestJS API and (from M2) Socket.IO server for Play My Playlist. See `../docs/architecture.md`.

```bash
cp .env.example .env          # once
pnpm infra:up                 # from repo root: PostgreSQL (5433) + Redis (6379)
pnpm dev                      # http://localhost:4000/api/v1/health
pnpm test                     # unit tests (Jest, native ESM)
pnpm test:e2e                 # needs PostgreSQL + Redis running
```
