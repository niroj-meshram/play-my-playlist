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

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test            # unit tests (all packages)
pnpm test:e2e        # backend end-to-end tests (requires `pnpm infra:up`)
pnpm build
pnpm format:check
```
