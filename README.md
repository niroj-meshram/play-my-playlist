# Play My Playlist

Real-time multiplayer party game: friends submit YouTube playlists, listen to random songs and guess whose playlist each song came from.

- Architecture, game rules and decisions: [`docs/architecture.md`](docs/architecture.md)
- Engineering standards: [`CLAUDE.md`](CLAUDE.md)

## Repository layout

| Path | Contents |
|---|---|
| `frontend/` | Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, Zustand, Socket.IO client |
| `backend/` | NestJS REST API + Socket.IO, Prisma (PostgreSQL), Redis |
| `packages/shared/` | `@pmp/shared`: TypeScript contracts shared by both apps (types only) |
| `infrastructure/docker/` | Local PostgreSQL and Redis |
| `docs/` | Architecture and decisions |

## Prerequisites

- Node.js 24 LTS (`nvm use`, see `.nvmrc`)
- pnpm via Corepack: `corepack enable pnpm`
- Docker with Compose

## Getting started

```bash
pnpm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
pnpm infra:up        # PostgreSQL on localhost:5433, Redis on localhost:6379
pnpm dev             # API http://localhost:4000/api/v1, web http://localhost:3000
```

The API serves Socket.IO on the `/game` namespace at the same origin. If port 3000 is taken, run the web app on another port and allow that origin in the API:

```bash
FRONTEND_ORIGIN=http://localhost:3100 pnpm --filter @pmp/backend dev
pnpm --filter @pmp/frontend exec next dev -p 3100
```

Optional presence timers (`PRESENCE_GRACE_MS`, `PRESENCE_DEBOUNCE_MS`, `GRACE_SWEEP_INTERVAL_MS`) are documented in `backend/.env.example`.

### YouTube API key

Playlist submissions call the YouTube Data API v3. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable **YouTube Data API v3**, create an **API key** (restrict it to that API), and set `YOUTUBE_API_KEY` in `backend/.env`. The free quota is 10,000 units/day; one 200-song playlist costs about 9. Automated tests use a fake YouTube client and never need the key.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test            # unit tests (all packages)
pnpm test:e2e        # backend end-to-end tests (requires `pnpm infra:up`)
pnpm build
pnpm format:check
```
