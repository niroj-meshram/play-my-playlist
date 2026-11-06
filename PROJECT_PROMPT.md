# PLAY MY PLAYLIST — MASTER PROJECT PROMPT

> **Note:** Some rules below were superseded by approved decisions on 2026-11-06 (scoring, voting, timers, playback). `docs/architecture.md` is authoritative where they conflict.

## 1. Project Overview

Build a polished, real-time multiplayer social music guessing game called **Play My Playlist**.

Play My Playlist is a browser-based party game where a group of friends anonymously submits their YouTube playlists. The game randomly selects songs from those playlists, plays them to the group, and challenges everyone to guess which friend owns the playlist.

The objective is to create an entertaining social experience where friends discover each other's music tastes, make guesses, bluff, debate and compete for points.

This must be developed as a production-quality application, not merely a prototype or UI demonstration.

## 2. Product Vision

Create a game that:
- Makes it extremely easy for friends to start playing together.
- Creates suspense around playlist ownership.
- Supports real-time multiplayer interaction.
- Works smoothly on desktop and mobile browsers.
- Provides an engaging game experience with animations and sound feedback.
- Handles disconnections, reconnects, late responses and game-state synchronization reliably.
- Can eventually support public rooms, private rooms, tournaments and additional game modes.

## 3. Core Gameplay

### Step 1: Create a game room

A player creates a new room.

The room creator becomes the host.

Generate:
- A unique room code.
- A shareable invitation URL.
- A unique player session.
- A configurable game lobby.

The host can configure:
- Maximum players.
- Number of rounds (songs per game).
- Minimum playable songs per playlist.
- Game privacy (MVP: invite-only).

Initial recommended settings:
- Minimum players: 3
- Maximum players: 10
- Default players: 5
- Rounds (songs) per game: 10
- Minimum playable songs per playlist: 5
- No discussion or voting time limits; the leader advances phases.

### Step 2: Join the room

Friends join using the invitation link or room code.

Players should be able to:
- Enter their display name.
- Select an avatar.
- See other players in the lobby.
- See who has joined.
- See submission status.

Prevent duplicate player sessions and enforce room capacity.

### Step 3: Submit YouTube playlists

Every player submits a valid YouTube playlist URL.

The system should:
1. Validate the URL.
2. Extract the playlist ID.
3. Retrieve playlist metadata through YouTube Data API v3.
4. Retrieve available playlist videos.
5. Validate that sufficient playable videos exist.
6. Store the playlist information.
7. Associate the playlist with its owner privately.

IMPORTANT:
- Never expose playlist ownership to other players before the reveal.
- Never send internal playlist ownership mappings to frontend clients.
- Do not expose private player-to-playlist associations through REST or WebSocket payloads.
- Handle unavailable, deleted, private and restricted playlists.
- Respect YouTube API quotas.
- Support pagination when retrieving playlist videos.

Players must be able to see their own submission status.

### Step 4: Start the game

Once everyone has submitted a valid playlist, the host can start the game.

The backend must:
- Generate the game rounds.
- Randomize playlist selection.
- Avoid exposing playlist owners.
- Select songs from eligible playlists.
- Randomize selection fairly.
- Prevent repeated songs within the same game wherever possible.

Each round should contain:
- Round number.
- Selected song metadata.
- Anonymous playlist identifier.
- Current game phase.
- Round timer.

### Step 5: Play the song

Display a music player using the YouTube IFrame Player API.

Show:
- Song title.
- Artist.
- Album artwork or YouTube thumbnail where permitted.
- Embedded YouTube player (on the leader's device only).
- Current round number.
- Player list.
- Live scoreboard.

Only the leader's (host's) device plays the song. The leader stops the song to move to discussion.

The playlist owner must remain hidden.

Important YouTube integration requirements:
- Use the official YouTube IFrame Player API.
- Do not download or extract audio from YouTube.
- Do not bypass YouTube advertisements or playback restrictions.
- Respect autoplay restrictions imposed by browsers.
- Display required YouTube branding and player controls.
- Handle unavailable and region-restricted videos.
- Never assume that every playlist video can be embedded or played.

### Step 6: Discussion phase

After the song plays, enter the discussion phase.

Players can discuss who might own the playlist.

Implement:
- Real-time text chat.
- Player presence indicators.
- The leader opens voting when discussion is done.

Chat must be scoped to the current room.

### Step 7: Voting phase

Each player votes for the person they believe owns the currently selected playlist. Everyone votes, including the owner, so voting never reveals the owner.

Requirements:
- Players cannot vote for themselves.
- Each player can submit only one vote, and it cannot be changed.
- There is no voting time limit. Voting closes when every online player has voted, or when the leader presses "Close voting".
- Votes not cast are not counted (no automatic votes).
- Players cannot vote for offline players.
- The backend validates every vote.
- The frontend must never determine voting outcomes.

Voting should be anonymous until the reveal.

### Step 8: Reveal phase

After voting closes, reveal:
- The actual playlist owner.
- The song that was played.
- Who voted for whom.
- Which players guessed correctly.
- The round score.

Make the reveal visually engaging with animations.

### Step 9: Scoring system

Implement a configurable, server-authoritative scoring system.

Approved scoring rules (per round):

- Nobody guesses the owner: the owner receives +10 points.
- Exactly one player guesses correctly: that player receives +10 points.
- Two or more players guess correctly: each correct guesser receives +5 points, and the owner receives 0.
- No points for invalid or missing votes.
- If the owner is offline when voting closes, the owner receives 0 for that round (nobody could vote for them).

A live scoreboard is visible throughout the game and updates after each reveal.

Make scoring rules configurable and keep scoring logic isolated in a dedicated service.

### Step 10: Final scoreboard

After all rounds:
- Display final rankings.
- Show total scores.
- Highlight the winner.
- Show correct guesses.
- Show best bluffer.
- Show most accurately guessed playlist owner.
- Allow the host to start a rematch.

## 4. Game State Machine

Use an explicit backend-controlled game state machine.

Initial game states:

LOBBY
PLAYING
DISCUSSION
VOTING
REVEAL
SCOREBOARD
FINISHED

Allowed transitions:

LOBBY → PLAYING
PLAYING → DISCUSSION
DISCUSSION → VOTING
VOTING → REVEAL
REVEAL → PLAYING
REVEAL → SCOREBOARD
SCOREBOARD → FINISHED
FINISHED → LOBBY (rematch)

Every transition must be validated on the backend.

The frontend must render according to the latest authoritative game state.

Never allow clients to arbitrarily change game phases.

## 5. Technical Architecture

### Frontend

Technology:
- Next.js 14+ App Router.
- React 18+.
- TypeScript strict mode.
- Tailwind CSS.
- shadcn/ui.
- Zustand.
- TanStack Query.
- Socket.IO Client.

Suggested structure:

frontend/
  src/
    app/
      page.tsx
      create-room/
      join/
      room/[roomCode]/
      game/[roomCode]/
      results/[roomCode]/
    components/
      common/
      lobby/
      game/
      voting/
      scoreboard/
      music-player/
    hooks/
    services/
    stores/
    types/
    lib/

Keep UI components reusable and separate from business logic.

### Backend

Technology:
- NestJS.
- TypeScript.
- Prisma ORM.
- PostgreSQL.
- Socket.IO.
- Redis where required.
- JWT authentication.

Suggested modules:

backend/
  src/
    auth/
    users/
    rooms/
    players/
    playlists/
    youtube/
    games/
    rounds/
    voting/
    scoring/
    chat/
    websocket/
    common/
    prisma/

Use NestJS modules, controllers, providers, guards, gateways and DTOs appropriately.

### Database

Use PostgreSQL with Prisma.

Initial entities:

User
- id
- displayName
- avatar
- createdAt
- updatedAt

GameRoom
- id
- roomCode
- hostId
- status
- settings
- createdAt
- updatedAt

RoomPlayer
- id
- roomId
- userId
- sessionId
- isConnected
- joinedAt

Playlist
- id
- roomId
- ownerPlayerId
- youtubePlaylistId
- title
- status
- createdAt

PlaylistTrack
- id
- playlistId
- youtubeVideoId
- title
- artist
- thumbnail
- duration
- position

Game
- id
- roomId
- status
- currentRound
- startedAt
- finishedAt

GameRound
- id
- gameId
- roundNumber
- selectedPlaylistId
- selectedTrackId
- status
- startedAt
- completedAt

Vote
- id
- roundId
- voterPlayerId
- guessedOwnerPlayerId
- createdAt

PlayerScore
- id
- gameId
- playerId
- totalScore

RoomMessage
- id
- roomId
- playerId
- message
- createdAt

Use appropriate foreign keys, unique constraints, indexes and cascading behavior.

The schema is an initial proposal. Refine it during implementation to support the actual domain requirements.

## 6. Real-Time Architecture

Use Socket.IO for multiplayer communication.

Example events:

Client → Server:
- room:create
- room:join
- room:leave
- playlist:submit
- game:start
- chat:send
- vote:submit
- game:next-round
- game:rematch

Server → Client:
- room:created
- room:player-joined
- room:player-left
- room:updated
- playlist:submission-updated
- game:started
- game:phase-changed
- game:round-started
- game:timer-updated
- vote:submitted
- voting:completed
- game:owner-revealed
- game:score-updated
- game:finished

Use consistent event payloads with TypeScript DTOs.

Implement:
- Socket authentication.
- Room authorization.
- Host authorization.
- Player authorization.
- Input validation.
- Event idempotency where required.
- Reconnection handling.
- Disconnect detection.
- Server-controlled timers.
- Authoritative game state.
- Safe event broadcasting.

Do not trust frontend timers or frontend-submitted game state.

## 7. Security Requirements

Security is a first-class requirement.

- Validate all incoming data.
- Authenticate socket connections.
- Verify room membership before processing events.
- Verify host privileges before host operations.
- Prevent unauthorized voting.
- Prevent duplicate votes.
- Prevent self-voting.
- Protect hidden playlist ownership.
- Never expose sensitive game mappings through public APIs.
- Rate-limit room joining, playlist submissions and chat.
- Prevent room-code enumeration.
- Sanitize user-generated content.
- Never expose YouTube API keys in frontend code.
- Keep secrets in environment variables.
- Use transactions for critical scoring and voting operations.
- Prevent race conditions during phase transitions.
- Prevent replay of expired or duplicate game actions.

## 8. UI/UX Direction

Design a modern, premium, playful and visually appealing party-game experience.

Visual direction:
- Dark-first interface.
- Deep navy and charcoal backgrounds.
- Vibrant purple, blue and pink accents.
- Smooth gradients.
- Rounded cards.
- Subtle shadows and borders.
- Smooth micro-interactions.
- Animated transitions between game phases.
- Large, readable typography.
- Responsive layouts.

Avoid:
- Generic admin-dashboard designs.
- Excessive gradients.
- Overloaded screens.
- Unnecessary animations.
- Complicated onboarding.

The application should feel like a polished social gaming product.

## 9. Testing Requirements

Backend:
- Unit tests for scoring.
- Unit tests for game state transitions.
- Unit tests for playlist validation.
- Integration tests for room management.
- Integration tests for voting.
- Socket.IO integration tests.
- Authorization tests.
- Concurrency and duplicate-event tests.

Frontend:
- Component tests for critical game components.
- State-management tests.
- API integration tests.
- Playwright end-to-end tests.

Critical scenarios:
1. Five players successfully create and join a room.
2. Every player submits a playlist.
3. The host starts the game.
4. A random playlist is selected.
5. All players receive the same round information.
6. No player can identify the owner before reveal.
7. Every eligible player votes.
8. Votes are counted correctly.
9. Scores are calculated correctly.
10. A player disconnects and reconnects.
11. The host disconnects and another host is assigned or the room is safely paused.
12. Two players attempt conflicting actions simultaneously.

## 10. Development Guidelines

Work incrementally.

Do not generate the entire application in one response.

Follow this development order:

Phase 1: Project foundation
- Monorepo setup.
- Frontend initialization.
- Backend initialization.
- Database configuration.
- Prisma setup.
- Environment configuration.
- Health-check endpoint.

Phase 2: User and room management
- Anonymous player sessions.
- Room creation.
- Room joining.
- Lobby.
- Player presence.

Phase 3: Playlist integration
- YouTube URL validation.
- YouTube API integration.
- Playlist ingestion.
- Track storage.
- Playlist privacy.

Phase 4: Game engine
- Game state machine.
- Round generation.
- Random track selection.
- Timers.
- Game orchestration.

Phase 5: Multiplayer
- Socket authentication.
- Real-time room events.
- Chat.
- Reconnection.
- Synchronization.

Phase 6: Voting and scoring
- Voting engine.
- Vote validation.
- Owner reveal.
- Score calculation.
- Leaderboard.

Phase 7: UI polish
- Animations.
- Responsive layouts.
- Sound effects.
- Loading states.
- Error handling.

Phase 8: Testing and deployment
- Automated testing.
- Performance optimization.
- Security review.
- Production deployment.

## 11. Expected Engineering Standards

- Follow SOLID principles where appropriate.
- Use clean architecture and separation of concerns.
- Keep controllers thin.
- Keep business logic inside services.
- Avoid massive components and services.
- Use typed DTOs.
- Use Prisma transactions for critical operations.
- Avoid N+1 database queries.
- Add indexes based on query patterns.
- Handle errors consistently.
- Write meaningful tests.
- Avoid unnecessary dependencies.
- Never hardcode credentials.
- Never use `any` unless there is a documented reason.
- Never leave incomplete TODO implementations.
- Keep documentation updated.

## 12. Working Instructions for AI Developer

Act as a senior software architect and full-stack engineer.

Before implementing any feature:
1. Understand the existing project structure.
2. Review the relevant files.
3. Identify dependencies.
4. Explain the implementation approach.
5. Identify possible edge cases.
6. Implement the feature.
7. Add tests.
8. Verify that existing functionality is not broken.
9. Update documentation if required.

Do not rewrite existing code unnecessarily.

Do not introduce new libraries without explaining why they are needed.

Do not assume that frontend validation is sufficient.

Do not expose private game information.

When requirements are unclear, ask a focused clarification question rather than inventing business rules.

Always prioritize correctness, maintainability, security and user experience.

## 13. Initial Task

Start by inspecting the existing repository.

Do not immediately implement the entire product.

First provide:
- Proposed monorepo structure.
- High-level architecture.
- Initial database ERD.
- Game state machine diagram.
- API endpoint plan.
- Socket.IO event specification.
- Security considerations.
- Development milestones.

Wait for approval before implementing the foundation.

The final objective is to deliver a scalable, secure and enjoyable multiplayer music guessing game that friends can play together in real time.

**Product name:** Play My Playlist

**Product category:** Multiplayer Social Party Game

**Primary experience:** Guess which friend owns the playlist based on the songs they submitted.