---
name: play-my-playlist
description: Specialized engineering skill for developing Play My Playlist, a real-time multiplayer YouTube playlist guessing party game. Use when implementing game mechanics, room management, Socket.IO events, playlist ingestion, YouTube playback, voting, scoring, privacy, reconnection, synchronization, or multiplayer testing.
---

# Play My Playlist — Engineering Skill

## 1. Role

Act as a senior multiplayer game engineer with expertise in:

- Real-time multiplayer architecture.
- NestJS and Socket.IO.
- Next.js and React.
- PostgreSQL and Prisma.
- Distributed systems.
- State machines.
- Game security.
- YouTube API integration.
- Concurrent operations.
- Automated testing.

Apply these principles to every feature developed for Play My Playlist.

Refer to the repository's root `CLAUDE.md` for general development standards, and to `docs/architecture.md` for the approved game rules (it overrides older rules).

## 2. Product Understanding

Play My Playlist is a social multiplayer music guessing game.

Players:
1. Join a shared game room.
2. Submit their own YouTube playlists.
3. Listen to anonymously selected songs.
4. Discuss which player owns the playlist.
5. Vote for the suspected owner.
6. Discover the actual owner.
7. Earn points based on the guessing and bluffing rules.

The backend controls the entire game lifecycle.

The frontend only displays and interacts with the authoritative game state.

## 3. Critical Domain Concepts

Understand these domain concepts before implementing game features.

### Room

A room represents a multiplayer session.

It has:
- A unique room code.
- A host.
- A collection of players.
- Room settings.
- A current game.
- A lifecycle status.

### Player

A player represents a participant in a room.

A player may have:
- A unique ID.
- A display name.
- An avatar.
- A session identity.
- A connection status.
- A score.

Never assume that a socket ID is a permanent player identity.

Socket IDs can change after reconnection.

### Playlist

A playlist belongs to exactly one player within a room.

It contains:
- YouTube playlist ID.
- Playlist metadata.
- Owner association.
- Imported tracks.
- Validation status.

The owner association is private game information.

### Game

A game is a complete multiplayer session containing multiple rounds.

### Round

A round represents one guessing challenge.

A round contains:
- Selected playlist.
- Selected track.
- Current phase.
- Start and end timestamps.
- Votes.
- Reveal information.
- Score calculation.

## 4. Game State Machine

Use a state-machine approach.

Supported phases:

- LOBBY
- PLAYING
- DISCUSSION
- VOTING
- REVEAL
- SCOREBOARD
- FINISHED

### Transition rules

LOBBY:
- Players can join.
- Players can submit playlists.
- Host can start the game when requirements are met.

PLAYING:
- A round is initialized.
- A track is selected.
- Playback information is broadcast.

PLAYING:
- Only the leader's (host's) device plays the song. The leader stops it (or it ends) to move on.

DISCUSSION:
- Players can discuss the song.
- Ends when the leader opens voting. No timer.

VOTING:
- Everyone votes, including the owner. No time limit.
- Closes when all required (online) voters have voted, or when the leader presses "Close voting".
- Votes are private until reveal.

REVEAL:
- Playlist ownership is revealed.
- Votes are displayed.
- Scores are calculated.

SCOREBOARD:
- Final rankings and awards after the last round.
- A live scoreboard is also visible during every phase.

FINISHED:
- Final scores are available.
- Rematch can be initiated.

### Important implementation rules

- Validate every state transition.
- Never allow arbitrary client-controlled transitions.
- Store timestamps rather than trusting client clocks.
- Phases advance only on leader actions or vote completion; never on client timers.
- Make transitions safe against duplicate events.
- Use atomic operations or database transactions when necessary.

## 5. Playlist Ownership Privacy

This is one of the most important parts of the product.

The application must hide the relationship between playlists and their owners.

### Data separation

Maintain a clear distinction between:

**Private domain data:**
- Playlist ID.
- Owner player ID.
- Original playlist URL.
- Track ownership association.

**Public game data:**
- Anonymous playlist identifier.
- Selected song.
- Current game phase.
- Round information.
- Remaining time.

### Rules

Before the reveal:
- Never expose owner IDs.
- Never expose playlist ownership mappings.
- Never return original playlist URLs to other players.
- Never expose private playlist metadata unnecessarily.
- Never include owner information in WebSocket broadcasts.

After the reveal:
- Reveal only the information required by the game.

Do not rely on hiding frontend elements for security.

The backend response itself must not contain unauthorized information.

Create dedicated public and private DTOs.

## 6. Track Selection Engine

Implement track selection as a dedicated service.

Responsibilities:
- Retrieve eligible playlists.
- Select a playlist randomly.
- Select an eligible track.
- Avoid duplicate tracks.
- Avoid selecting unavailable videos.
- Maintain fair selection.
- Track previously used songs.

### Selection requirements

The selection algorithm should:
- Use balanced random: draw playlists in CSPRNG-shuffled rotations; never the same playlist twice in a row when alternatives exist.
- Play 10 rounds (songs) per game by default.
- Ensure every eligible playlist receives reasonable selection opportunities.
- Prevent predictable selection patterns.
- Avoid duplicate tracks within a game.

Use a cryptographically secure random source when appropriate.

Do not allow the frontend to submit the selected playlist or track.

The server determines both.

## 7. Multiplayer Synchronization

Use Socket.IO for real-time communication.

The backend is authoritative.

### Connection lifecycle

Support:
- Initial connection.
- Authentication.
- Room joining.
- Player presence.
- Unexpected disconnect.
- Reconnection.
- Session recovery.
- State resynchronization.

### Reconnection strategy

A player should reconnect using a persistent session credential.

Do not use socket ID as the only player identifier.

When reconnecting:
1. Authenticate the player session.
2. Validate room membership.
3. Associate the new socket with the existing player.
4. Restore room membership.
5. Send the latest authorized game state.
6. Resume participation if the phase permits.

Do not create duplicate player records during reconnection.

### Event consistency

For important events, consider:
- Unique event identifiers.
- Idempotency keys.
- Sequence numbers.
- Acknowledgements.
- Server timestamps.

Use these mechanisms where they materially improve reliability.

Never assume Socket.IO delivery alone guarantees that a game action has been persisted.

## 8. Voting Engine

Implement voting through a dedicated voting service.

### Validation

Before accepting a vote, validate:

1. Player is authenticated.
2. Player belongs to the room.
3. Player belongs to the active game.
4. Current phase is VOTING.
5. Voting has not been closed.
6. Player is a participant of the game (the owner votes too).
7. Player is not voting for themselves.
8. Selected suspect is an online participant of the current game.
9. Player has not already voted.

### Concurrency

Protect against two simultaneous voting requests from the same player.

Use a database uniqueness constraint for:

(roundId, voterPlayerId)

Use transactions where required.

A vote should be accepted or rejected atomically.

### Vote privacy

Do not broadcast individual votes while voting remains open.

Only expose aggregated voting status if the game design requires it.

Reveal individual votes after voting closes.

## 9. Scoring Engine

Implement scoring in a dedicated service.

Approved configurable rules (per round):

Nobody guesses the owner:
Owner +10 points.

Exactly one correct guess:
That player +10 points.

Two or more correct guesses:
Each correct guesser +5 points; owner 0.

Missing or invalid votes:
0 points (not counted).

Owner offline when voting closes:
Owner 0 points (nobody could vote for them).

### Implementation requirements

- Score calculation must be deterministic.
- Never calculate final scores in React.
- Never trust client-provided scores.
- Prevent duplicate score allocation.
- Make score allocation idempotent.
- Store score history per round.
- Maintain a consistent leaderboard.

Consider a dedicated RoundScore entity rather than storing only aggregate totals.

This allows historical scoring to be audited and recalculated if game rules change.

## 10. Timers and Timeouts

All authoritative timers must be managed by the backend.

Game phases have no countdowns (approved decision). The remaining timers are:
- The 30 s disconnect grace period.
- Host migration after 30 s.

Store:
- Phase start timestamp.
- Current phase.
- Grace deadlines (Redis sorted set).

Do not change backend timers based on client requests.

Do not assume that an in-memory setTimeout is sufficient for production.

For distributed deployment, consider Redis-backed jobs or another durable scheduling mechanism.

Timeout processing must be idempotent.

## 11. YouTube Integration

Use the official YouTube APIs.

### Data API v3

Use for:
- Playlist lookup.
- Playlist metadata.
- Playlist item retrieval.
- Video metadata.
- Pagination.

### IFrame Player API

Use for:
- Embedded video playback.
- Playback state.
- Playback errors.
- Player initialization.
- Playback control.

### Error handling

Handle:
- Invalid playlist IDs.
- Private playlists.
- Deleted videos.
- Restricted videos.
- Region restrictions.
- Embedding disabled.
- API quota exhaustion.
- Network failures.
- Player initialization errors.

Never download YouTube audio or extract video streams.

Respect YouTube branding, playback and API policies.

### Caching

Cache appropriate playlist metadata to reduce unnecessary API requests.

Use cache expiration and invalidation policies.

Do not assume cached data means a video is still playable.

## 12. Security and Authorization

Every game action must be authorized server-side.

Create reusable authorization checks for:
- Room membership.
- Host privileges.
- Player identity.
- Active game membership.
- Voting eligibility.
- Game phase.

Protect against:
- Unauthorized room access.
- Room-code enumeration.
- Duplicate votes.
- Self-voting.
- Score manipulation.
- Playlist ownership leaks.
- Socket event spoofing.
- Replayed actions.
- Chat spam.
- Race conditions.

Use validation pipes and DTOs in NestJS.

Never trust the player ID supplied by a frontend event when an authenticated server-side identity is available.

## 13. Database Design

Use PostgreSQL and Prisma.

Maintain:
- Explicit relations.
- Referential integrity.
- Unique constraints.
- Proper indexes.
- Version-controlled migrations.
- Transactional writes.

Review database query patterns before adding indexes.

Important uniqueness constraints should include:
- Room code.
- Player session identity within its intended scope.
- One vote per player per round.
- One score allocation per player per round.

Use transactions for critical game operations.

Avoid unnecessary queries inside loops.

## 14. Testing Strategy

Test domain behavior independently from transport behavior.

### Unit tests

Test:
- Game state transitions.
- Track selection.
- Playlist eligibility.
- Vote validation.
- Score calculation.
- Timeout processing.
- Host authorization.

### Integration tests

Test:
- Creating rooms.
- Joining rooms.
- Submitting playlists.
- Starting games.
- Voting.
- Revealing owners.
- Reconnecting players.
- Concurrent voting.
- Duplicate event handling.

### Multiplayer scenarios

Simulate at least five players.

Verify:
- All players receive consistent public game state.
- No player sees private playlist ownership.
- Every eligible player can vote.
- Duplicate votes are rejected.
- Scores are consistent across clients.
- Disconnection does not corrupt game state.
- Reconnection restores the correct player.
- Phase transitions occur only once.

## 15. Development Decision Process

Before implementing any significant feature:

1. Identify the domain requirement.
2. Inspect the existing implementation.
3. Identify the relevant module.
4. Determine API and Socket.IO changes.
5. Review database implications.
6. Identify security implications.
7. Consider concurrent execution.
8. Define test cases.
9. Implement.
10. Verify.

Prefer small, incremental changes.

Do not introduce unnecessary abstractions.

Do not duplicate business logic between frontend and backend.

Do not silently change scoring or game rules.

Ask for clarification if a product decision is ambiguous.

## 16. Definition of Done

A feature is complete only when:

- The implementation matches the requirement.
- Backend authorization is implemented.
- Input validation is present.
- Relevant edge cases are handled.
- Database changes are migrated.
- Tests are added.
- Tests pass.
- TypeScript checks pass.
- Linting passes.
- Documentation is updated where necessary.
- No private game information is exposed.

## 17. Core Engineering Philosophy

The most important engineering priorities for Play My Playlist are:

1. Correctness of multiplayer game logic.
2. Privacy of playlist ownership.
3. Consistency of game state across clients.
4. Protection against concurrent and duplicate actions.
5. Reliable player reconnection.
6. Fair scoring and voting.
7. Excellent user experience.
8. Maintainable and testable code.

Treat multiplayer correctness and game fairness as core product requirements, not optional enhancements.