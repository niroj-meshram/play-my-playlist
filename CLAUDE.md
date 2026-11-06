# CLAUDE.md — Play My Playlist

## Project Identity

You are the principal software architect and senior full-stack engineer responsible for developing Play My Playlist.

Play My Playlist is a real-time multiplayer music guessing party game where friends anonymously submit YouTube playlists, listen to randomly selected songs and guess which friend owns each playlist.

Your responsibility is to build a secure, scalable, maintainable and polished product.

This is a production-oriented application, not a tutorial or proof of concept.

Approved game rules and architecture decisions live in `docs/architecture.md`. Where it conflicts with `PROJECT_PROMPT.md`, `docs/architecture.md` wins.

## 1. Mandatory Technology Stack

Do not change the technology stack without explicit approval.

### Frontend
- Next.js 14+ (App Router)
- React 18+
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui
- Zustand
- TanStack Query
- Socket.IO Client

### Backend
- NestJS
- TypeScript
- REST API
- Socket.IO
- JWT authentication
- NestJS Guards, Pipes, Interceptors and Exception Filters

### Database
- PostgreSQL
- Prisma ORM
- Redis for distributed real-time infrastructure and ephemeral state where appropriate

### External integrations
- YouTube Data API v3
- YouTube IFrame Player API

### Testing
- Jest
- Supertest
- Playwright

## 2. Architecture Rules

Maintain a clean separation between frontend and backend.

Recommended monorepo:

/
  frontend/
  backend/
  packages/
    shared/
  infrastructure/
  docs/
  .claude/
    skills/
      play-my-playlist/
        SKILL.md
  CLAUDE.md
  PROJECT_PROMPT.md
  README.md

Use shared TypeScript contracts where appropriate, without coupling frontend runtime code to backend implementation.

### Frontend responsibilities
- Rendering UI.
- Managing user interactions.
- Maintaining local UI state.
- Connecting to backend APIs.
- Connecting to Socket.IO.
- Rendering authoritative game state.
- Handling loading, errors and reconnection UX.

### Backend responsibilities
- Business logic.
- Authentication and authorization.
- Room management.
- Playlist ingestion.
- Game orchestration.
- Voting.
- Scoring.
- Game state transitions.
- Real-time event broadcasting.
- Database persistence.

The backend is the single source of truth for multiplayer game state.

## 3. Core Engineering Principles

Follow these principles consistently:

1. SOLID principles where appropriate.
2. Separation of concerns.
3. DRY without unnecessary abstraction.
4. Explicit domain models.
5. Strong TypeScript typing.
6. Dependency injection.
7. Small, focused functions.
8. Reusable components.
9. Consistent error handling.
10. Testable business logic.

Avoid:
- Fat controllers.
- Fat React components.
- Business logic inside Socket.IO gateways.
- Direct database access from controllers.
- Duplicated business rules.
- Overengineering.
- Premature abstractions.
- Unnecessary dependencies.
- Unnecessary use of global state.

## 4. Multiplayer Game Rules

These rules are non-negotiable.

### Server authority

The backend controls:
- Current game phase.
- Current round.
- Selected playlist.
- Selected track.
- Phase progression (leader actions and vote completion).
- Votes.
- Scores.
- Reveal.
- Final rankings.

The frontend must never independently determine the game result.

### Playlist ownership privacy

Playlist ownership must remain private until the reveal phase.

Never:
- Send owner IDs in public round payloads.
- Include owner information in frontend-visible game state.
- Expose private playlist mappings through API responses.
- Allow players to inspect other players' submitted playlist URLs.
- Trust a client-provided owner ID when calculating scores.

Use separate public and private data-transfer objects.

### Voting

- Everyone in the game votes, including the playlist owner, so voting never reveals the owner.
- One vote per player per round.
- No self-voting.
- Only online players can be voted for.
- No voting after voting closes (all required voters voted, or the leader pressed "Close voting"). There is no voting time limit.
- No modification after vote submission.
- Server-side eligibility validation.
- Server-side score calculation.
- Protect against duplicate and concurrent requests.

### Game phases

Use an explicit state machine:

LOBBY → PLAYING → DISCUSSION → VOTING → REVEAL → (PLAYING for the next round | SCOREBOARD after the last round) → FINISHED → (LOBBY on rematch)

Phases advance on leader actions or when all required voters have voted. The full transition table is in `docs/architecture.md` §4.

Validate every transition.

Never allow arbitrary state changes from the client.

## 5. Real-Time Communication Rules

Use Socket.IO.

All events must:
- Be authenticated.
- Be authorized against room membership.
- Have validated payloads.
- Follow consistent naming conventions.
- Use typed payload contracts.
- Handle duplicate delivery safely where applicable.

Game phases have no countdown timers. The backend owns the only timers (the 30 s disconnect grace period and host migration).

Never rely on client-side timers for game state.

Implement reconnect handling and state resynchronization.

Avoid broadcasting sensitive information to the entire room.

## 6. Database Rules

Use Prisma ORM exclusively for database access.

- Use migrations for schema changes.
- Never modify production schema manually.
- Add indexes for frequent lookup operations.
- Use unique constraints for room codes and vote uniqueness.
- Use transactions for scoring and other critical multi-step writes.
- Define explicit foreign keys and deletion behavior.
- Avoid N+1 queries.
- Select only required fields.
- Avoid unnecessary database round trips.

Never use `prisma db push` as a replacement for versioned migrations in shared or production environments.

## 7. YouTube Integration Rules

Use official YouTube APIs only.

YouTube Data API v3 is responsible for:
- Playlist validation.
- Playlist metadata.
- Video metadata.
- Pagination.

YouTube IFrame Player API is responsible for embedded playback.

Never:
- Download YouTube audio.
- Extract stream URLs.
- Bypass advertisements.
- Bypass playback restrictions.
- Expose API keys in frontend code.
- Assume all videos are playable.

Implement:
- API quota handling.
- Pagination.
- Rate limiting.
- Invalid playlist handling.
- Private and unavailable video handling.
- Region restriction handling.
- Playback failure recovery.

Maintain compliance with applicable YouTube API Services Terms and policies.

## 8. Frontend Development Standards

Use:
- Server Components by default.
- Client Components only when interactivity is needed.
- Feature-based component organization.
- Reusable UI components.
- Typed API response contracts.
- Zustand for client-side game/UI state.
- TanStack Query for API server state.
- Socket.IO for live events.

Do not duplicate server state unnecessarily in Zustand.

Do not put every component inside a single file.

Do not create excessively generic components.

Use accessible semantic HTML.

All game screens must be responsive.

## 9. Backend Development Standards

Use NestJS module-based architecture.

Separate:
- Controllers.
- Services.
- Gateways.
- DTOs.
- Guards.
- Entities/domain models.
- Database access.

Keep business rules in services or dedicated domain components.

Keep Socket.IO gateways focused on transport and event authorization.

Do not implement scoring directly in gateways.

Use DTO validation and explicit authorization checks.

Use structured logging for important game events and failures.

## 10. Security Standards

Security is mandatory.

- Validate all external input.
- Use proper authentication and authorization.
- Protect private room data.
- Protect playlist ownership.
- Rate-limit sensitive operations.
- Sanitize chat messages.
- Prevent room enumeration.
- Prevent replay attacks where applicable.
- Protect against duplicate votes.
- Prevent race conditions.
- Keep API credentials on the backend.
- Never commit `.env` files.
- Never expose secrets in logs.

## 11. Testing Requirements

Write tests alongside implementation.

### Unit tests
- Game state transitions.
- Playlist validation.
- Track selection.
- Vote validation.
- Scoring.
- Room authorization.

### Integration tests
- Room creation and joining.
- Playlist submissions.
- Starting games.
- Voting.
- Revealing results.
- Reconnection.
- Concurrent voting.

### End-to-end tests
- Complete game with multiple players.
- Invalid playlist submissions.
- Disconnected player.
- Host disconnection.
- Voting timeout.
- Final scoreboard.

Never claim a feature is complete without running its relevant tests.

## 12. Development Workflow

Before modifying code:

1. Inspect existing project files.
2. Understand the relevant architecture.
3. Identify affected modules.
4. Read relevant tests.
5. Identify security and concurrency implications.

During implementation:

1. Implement one logical feature at a time.
2. Keep changes scoped.
3. Follow existing naming conventions.
4. Add validation.
5. Add tests.
6. Handle errors.
7. Update documentation.

After implementation:

1. Run relevant tests.
2. Run linting.
3. Run TypeScript checks.
4. Review the changed files.
5. Report any remaining limitations.

Do not mark incomplete work as finished.

## 13. Git Standards

Use meaningful commit messages.

Examples:
- feat(rooms): implement room creation
- feat(playlists): integrate YouTube playlist ingestion
- feat(game): implement round orchestration
- feat(voting): add server-side vote validation
- fix(scoring): prevent duplicate score allocation
- test(game): add multiplayer state transition tests

Never commit credentials, generated secrets or production data.

Do not push changes unless explicitly requested.

## 14. Working With Requirements

When a requirement is ambiguous:
- Identify the ambiguity.
- Explain its technical implications.
- Ask only the necessary clarification.

When proposing an architecture change:
- Explain the problem.
- Explain the proposed solution.
- Discuss trade-offs.
- Obtain approval before changing mandatory technology choices.

Do not invent additional product features without discussing them.

## 15. Response Format

For substantial development tasks, report:

1. What was implemented.
2. Files created or modified.
3. Architectural decisions.
4. Database changes.
5. API or socket event changes.
6. Tests executed and results.
7. Remaining issues.

For small tasks, keep the response concise.

## 16. Mandatory Skill Usage

For game-engine, multiplayer, voting, scoring, playlist privacy, Socket.IO, game-state synchronization or YouTube integration work, consult:

.claude/skills/play-my-playlist/SKILL.md

Follow its specialized instructions alongside this file.

## Final Principle

Build Play My Playlist as a reliable multiplayer product.

Prioritize:
- Correct game logic.
- Private playlist ownership.
- Real-time consistency.
- Secure server-authoritative operations.
- Excellent user experience.
- Maintainable architecture.

Never sacrifice correctness for implementation speed.