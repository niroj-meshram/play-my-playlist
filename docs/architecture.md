# Play My Playlist — Architecture

Status: **Approved — M0–M5 done (M2, M4 and M5 include minimal lobby and game screens pulled forward from M6); next: M6**
Last updated: 2026-11-19

This document is the source of truth for architecture and game rules.
Where it conflicts with `PROJECT_PROMPT.md`, this document wins (see §1 Decision log).

---

## 1. Decision log

| ID | Topic | Decision | Status |
|---|---|---|---|
| D1 | Scoreboard | A **live scoreboard is visible during every phase** and updates after each reveal. A final `SCOREBOARD` phase shows the final ranking and awards after the last round. | Approved |
| D2 | Rounds | A game is **10 songs** by default (host-configurable). Each round plays one random song from one player's playlist. | Approved |
| D2a | Playlist selection | **Balanced random**: playlists are drawn in shuffled rotations, so each one gets a fair share in an unpredictable order. | Approved |
| D3 | Playback | **Only the leader's (host's) device plays the song.** Other devices show the song card. | Approved |
| D3a | Song stop | **The leader stops the song** to move on to discussion. The song ending naturally on the leader's device also moves on. | Approved |
| D4 | Who votes | **Everyone votes, including the owner**, so voting behaviour never reveals the owner. Self-voting is blocked, so the owner's vote can never be correct. | Approved |
| D4a | Voting time | **No voting time limit.** Voting ends when every required player has voted. | Approved |
| D4b | Missing votes | A player who doesn't vote is **not counted**. No automatic random votes. Disconnected players (past the 30 s grace) are skipped, and the **leader can press "Close voting"** at any time. | Approved |
| D5 | Vote candidates | **Only online participants** (connected, or within the 30 s grace) except yourself. Offline players cannot be voted for. | Approved |
| D6 | Duplicate songs | **A song already submitted by another player is rejected (dropped) from the later submission.** If that leaves too few playable songs, the submission is rejected. Submitting the same playlist twice is therefore rejected too. | Approved |
| D7 | Transport split | REST for sessions, rooms, joining and playlist submission. Socket.IO for in-game commands. Both call the same services. | Approved |
| D8 | Host disconnect | **Auto-migrate after 30 s** to the longest-connected player. No PAUSED state. The new host becomes the leader and speaker. | Approved |
| D9 | Late join | Rejected while a game is running. Existing participants can always reconnect. | Approved |
| D10 | Room privacy | MVP: every room is invite-only (code or link). A `visibility` enum is kept for future public rooms. | Approved |
| D12 | Owner offline at reveal | If the playlist owner is offline (past the 30 s grace) when voting closes, the owner gets **0** for that round instead of the "nobody guessed" +10. It is decided at reveal time, so nothing leaks before then. | Approved |
| D11 | Repo hygiene | Files renamed to `CLAUDE.md` / `PROJECT_PROMPT.md`. Git initialised on `main`. | Done |

### Overrides of `PROJECT_PROMPT.md`
- Scoring 100/50 → **10 / 10 / 5** rules (§5).
- The discussion and voting timers are removed. Phases advance on **leader actions** and the **all-voted** condition (§4).
- "Owner cannot vote" → **everyone votes** (D4).
- Voting deadline → leader "Close voting" button (D4b).

---

## 2. Monorepo

```
/
├─ frontend/                     Next.js (App Router), strict TS, Tailwind, shadcn/ui,
│  └─ src/                       Zustand, TanStack Query, Socket.IO client
│     ├─ app/
│     │  ├─ page.tsx                     landing: create / join
│     │  ├─ join/[code]/page.tsx         invite landing (name + avatar)
│     │  └─ room/[code]/page.tsx         ONE route that renders by phase
│     ├─ features/
│     │  ├─ session/ room/ lobby/ playlist/ game/ music-player/
│     │  ├─ voting/ chat/ reveal/ scoreboard/
│     │  │   (each: components/, hooks/, api/, store.ts)
│     ├─ components/ui/          shadcn/ui primitives
│     ├─ components/common/
│     └─ lib/                    api-client, socket-client, query-client, clock-sync
├─ backend/                      NestJS
│  ├─ prisma/ (schema.prisma, migrations/)
│  └─ src/
│     ├─ config/ prisma/ redis/ health/ common/   (filters, pipes, interceptors, guards)
│     ├─ auth/        guest sessions, JWT, refresh rotation
│     ├─ users/
│     ├─ rooms/       rooms, room players, host migration policy
│     ├─ playlists/   submission, ingestion, duplicate-song filtering
│     ├─ youtube/     Data API v3 client, quota guard, cache
│     ├─ games/       domain/ (GameStateMachine, RoundPlanner, TrackSelector — pure)
│     │               application/ (GameOrchestrator, GameQueryService)
│     ├─ voting/      VotingService, VoteCompletionPolicy
│     ├─ scoring/     ScoringPolicy (pure) + ScoringService (transactional)
│     ├─ chat/
│     ├─ realtime/    GameGateway, WsAuth, RoomBroadcaster, PresenceService
│     └─ scheduler/   grace-period sweeper (Redis sorted set)
├─ packages/shared/              @pmp/shared — types only: enums, public DTO interfaces,
│                                socket event maps, error codes, limits. No runtime deps.
├─ infrastructure/docker/        docker-compose (PostgreSQL, Redis), Dockerfiles
├─ docs/
├─ CLAUDE.md  PROJECT_PROMPT.md  README.md
```

Principles:
- `@pmp/shared` contains contracts only. Runtime validation lives in backend DTOs (class-validator).
- The frontend uses one `/room/[code]` route, because phase changes are server-driven and a route per phase causes navigation races on reconnect.
- Domain logic (`GameStateMachine`, `RoundPlanner`, `TrackSelector`, `ScoringPolicy`, `VoteCompletionPolicy`) is pure and unit-tested without Nest or Prisma.
- Gateways only handle authentication, payload validation and delegation to services.

---

## 3. Data model

PostgreSQL is authoritative for phases, rounds, votes and scores.
Redis holds presence, socket↔player mapping, idempotency keys, rate limits, the YouTube cache, the Socket.IO adapter and grace-period timers.

```mermaid
erDiagram
  User ||--o{ AuthSession : has
  User ||--o{ RoomPlayer : "joins as"
  Room ||--o{ RoomPlayer : contains
  Room |o--o| RoomPlayer : "hostPlayerId"
  Room ||--o{ Game : "hosts (rematches)"
  Room ||--o{ RoomMessage : has
  RoomPlayer ||--o| Playlist : "submits (PRIVATE link)"
  Playlist ||--o{ PlaylistTrack : contains
  Game ||--o{ GameParticipant : snapshots
  Game ||--o{ GamePlaylist : "uses (anon label)"
  Game ||--o{ GameRound : has
  RoomPlayer ||--o{ GameParticipant : "plays as"
  GameParticipant ||--o| GamePlaylist : "owns (PRIVATE)"
  Playlist |o--o{ GamePlaylist : "songs drawn from (SetNull)"
  GamePlaylist ||--o{ GameRound : "selected in"
  GameRound ||--o{ Vote : receives
  GameRound ||--o{ RoundScore : awards
  GameParticipant ||--o{ Vote : "casts (voter)"
  GameParticipant ||--o{ Vote : "accused (suspect)"
  GameParticipant ||--o{ RoundScore : earns
  RoomPlayer ||--o{ RoomMessage : writes

  User { uuid id PK; string displayName; string avatarId; ts createdAt; ts lastSeenAt }
  AuthSession { uuid id PK; uuid userId FK; string refreshTokenHash UK; string previousTokenHash; ts rotatedAt; ts expiresAt; ts revokedAt }
  Room { uuid id PK; string code UK; uuid hostPlayerId FK "nullable, UK"; enum status "LOBBY|IN_GAME|CLOSED"; enum visibility "INVITE_ONLY"; int maxPlayers; int roundCount; ts lastActivityAt }
  RoomPlayer { uuid id PK; uuid roomId FK; uuid userId FK; string displayName; string avatarId; enum status "ACTIVE|LEFT"; ts joinedAt; ts leftAt }
  Playlist { uuid id PK; uuid roomPlayerId FK "UK = owner"; uuid roomId FK; string youtubePlaylistId; string sourceUrl "PRIVATE"; string title "PRIVATE"; enum status "PROCESSING|READY|REJECTED"; string rejectionCode; int playableCount; int duplicateCount; uuid submissionId; int attempts; ts submittedAt; ts processingStartedAt; ts readyAt }
  PlaylistTrack { uuid id PK; uuid playlistId FK; uuid roomId FK "denormalised"; string youtubeVideoId; string title; string artist; string thumbnailUrl; int durationSec; int position; enum status "PLAYABLE|DUPLICATE|UNPLAYABLE" }
  Game { uuid id PK; uuid roomId FK; int gameNumber; enum phase; int currentRound; int totalRounds; int stateVersion; ts phaseStartedAt; json settingsSnapshot; ts startedAt; ts finishedAt; enum endReason "COMPLETED|NOT_ENOUGH_PLAYERS|OUT_OF_SONGS" }
  GameParticipant { uuid id PK; uuid gameId FK; uuid roomPlayerId FK; int totalScore; int correctGuesses; int ownerPoints }
  GamePlaylist { uuid id PK; uuid gameId FK; uuid ownerParticipantId FK "PRIVATE, UK"; uuid sourcePlaylistId FK "nullable"; string publicLabel }
  GameRound { uuid id PK; uuid gameId FK; int roundNumber; uuid gamePlaylistId FK; enum status "PENDING|ACTIVE|REVEALED"; string youtubeVideoId; string title; string artist; string thumbnailUrl; int durationSec; ts startedAt; ts revealedAt }
  Vote { uuid id PK; uuid roundId FK; uuid voterId FK; uuid suspectId FK; bool isCorrect; uuid clientRequestId; ts createdAt }
  RoundScore { uuid id PK; uuid roundId FK; uuid participantId FK; int points; enum reason "OWNER_UNGUESSED|SOLE_CORRECT|SHARED_CORRECT" }
  RoomMessage { uuid id PK; uuid roomId FK; uuid roomPlayerId FK; uuid gameId FK; string body; ts createdAt }
```

### Constraints and indexes

| Constraint | Purpose |
|---|---|
| `Room.code` UNIQUE | Room lookup |
| `RoomPlayer (roomId, userId)` UNIQUE | One player per user per room. Reconnecting never creates a duplicate. |
| `Playlist.roomPlayerId` UNIQUE | One submission per player |
| `PlaylistTrack (playlistId, youtubeVideoId)` UNIQUE | Removes duplicates inside one playlist |
| `PlaylistTrack (roomId, youtubeVideoId)` INDEX | Cross-player duplicate lookup (D6) |
| Partial UNIQUE: one non-FINISHED `Game` per room (raw SQL in migration) | Two concurrent starts cannot create two games |
| `Game (roomId, gameNumber)` UNIQUE | Rematch numbering |
| `GameParticipant (gameId, roomPlayerId)` UNIQUE | Participants fixed at game start |
| `GamePlaylist (gameId, publicLabel)`, `(ownerParticipantId)` UNIQUE | One anonymous label per participant |
| `GameRound (gameId, roundNumber)`, `(gameId, youtubeVideoId)` UNIQUE | No repeated song within a game |
| `Vote (roundId, voterId)` UNIQUE + `CHECK (voterId <> suspectId)` | One vote per player per round; self-votes blocked by the DB |
| `RoundScore (roundId, participantId)` UNIQUE | Idempotent score allocation |
| `RoomMessage (roomId, createdAt)` INDEX | Chat history |

- Deletes cascade under `Room`. `Room.hostPlayerId` uses `SetNull`. Votes and scores cascade too, so purging an expired room (§13) removes its whole history. The application never deletes a participant, and only drops rounds that are `PENDING` or still `PLAYING` (which have no votes), so the cascade never touches a live game's votes or scores.
- `Vote.isCorrect` stays `NULL` until the reveal, which sets it in the scoring transaction. A `RoundScore` row with `OWNER_OFFLINE` and 0 points records D12, so every revealed round has at least one score row.
- `CHECK (voterId <> suspectId)` on `Vote` and `CHECK (points >= 0)` on `RoundScore` are hand-written in the migration SQL.
- **Games copy each round's song** (video ID, title, artist, thumbnail, duration) instead of pointing at `PlaylistTrack`, and `GamePlaylist` points at the owning `GameParticipant`. Lobby playlists can therefore be replaced between games, and a leaver's playlist deleted mid-game, without touching game history. `GamePlaylist.sourcePlaylistId` (`SetNull`) is used only to draw replacement songs.
- All IDs are **UUIDv4** (never time-ordered), so IDs cannot leak insertion order.

---

## 4. Game state machine

`LOBBY` is a room state (no game exists yet). The game phases are the rest.
There are **no phase timers**. Phases advance on leader actions or the all-voted condition.

```
                 leader game:start
   ┌───────┐   [≥3 active players,     ┌─────────┐ leader stops song ┌────────────┐
   │ LOBBY │── all playlists READY, ──▶│ PLAYING │── or song ends ──▶│ DISCUSSION │
   └───────┘   no active game]         └─────────┘ (leader device)   └────────────┘
       ▲                                 ▲    │ leader reports            │ leader opens
       │ leader game:rematch             │    │ unplayable video:         │ voting
       │ (new Game, gameNumber+1)        │    └─▶ replace track from      ▼
       │                                 │        same playlist      ┌────────┐
  ┌──────────┐  leader ends  ┌────────────┐  after last   ┌────────┐│ VOTING │
  │ FINISHED │◀──────────────│ SCOREBOARD │◀── round ─────│ REVEAL │◀┤        │
  └──────────┘               └────────────┘               └────────┘│ all required
                                                            │       │ voters voted
                                                            │       └────────┘
                                          leader next song  │
                                          (rounds remain)   └──────▶ PLAYING (round+1)
```

| From → To | Trigger | Guard | Side effects (one DB transaction) |
|---|---|---|---|
| LOBBY → PLAYING | leader `game:start` | caller is host; ≥3 active players; all playlists READY; no active game | Create Game, participants, shuffled anonymous labels and the **full 10-round plan** (private) |
| PLAYING → DISCUSSION | leader `game:advance` or leader `playback:report{ENDED}` | phase/version match | — |
| DISCUSSION → VOTING | leader `game:advance` | phase/version match | — |
| VOTING → REVEAL | all required voters have voted (§6), or leader `game:advance` ("Close voting") | phase/version match | Mark `isCorrect`, write `RoundScore`s, update totals |
| REVEAL → PLAYING | leader `game:advance` | `currentRound < totalRounds` | Activate the next round |
| REVEAL → SCOREBOARD | leader `game:advance` | `currentRound = totalRounds` | Compute awards |
| PLAYING/DISCUSSION/VOTING/REVEAL → SCOREBOARD | a leave leaves fewer than 3 participants, or the last round has no playable song left | — | `endReason` = `NOT_ENOUGH_PLAYERS` / `OUT_OF_SONGS` |
| SCOREBOARD → FINISHED | leader `game:advance`, or `game:rematch` | — | Set `finishedAt`; **room back to LOBBY**, playlists kept, so the host can start another game (`gameNumber + 1`). `game:rematch` finishes the game and starts the next one in the same transaction; if the new game cannot start (e.g. too few players), nothing changes. |

**Serialisation.** Every game command (start, advance, playback report) and every leave runs in one transaction that first locks the room row, so they never interleave within a room.

**Exactly-once transitions.** On top of that, every transition is a compare-and-set:
`updateMany({ where: { id, phase: from, stateVersion: v }, data: { phase: to, stateVersion: v + 1 } })`.
A row count of 0 means another trigger already won, and the call is a safe no-op.
Broadcasts are emitted only **after commit**.

---

## 5. Game rules

### Round plan (balanced random)
1. At game start, the playlists of all participants are shuffled with a CSPRNG (Fisher–Yates using `crypto.randomInt`). Labels ("Playlist A", …) follow that shuffle.
2. **Rounds = min(`roundCount`, playlists × smallest playlist's playable songs)**, so every playlist keeps its exact fair share. Example: 3 players with 5 songs each and 20 rounds → 15 rounds.
3. The rotation repeats (re-shuffled each cycle) until all slots are filled. The same playlist never plays twice in a row when more than one playlist exists.
4. Each slot draws a random unused `PLAYABLE` track from its playlist. The full plan, songs included, is stored privately at start.
5. If the leader's player reports a video as unplayable, the server swaps in another unused track **from the same playlist** (YouTube errors 100/101/150 also mark the track `UNPLAYABLE`). Reports carry the `videoId`, so a late report about an already-replaced song is ignored. If that playlist has nothing left, the round is dropped, later rounds are renumbered, and the game moves on (or ends with `OUT_OF_SONGS`).
6. **Mid-game leave:** the leaver's upcoming rounds go to the remaining playlists with unused songs (fewest rounds first, avoiding back-to-back repeats); rounds nobody can fill are dropped. A round already in progress finishes normally. If fewer than 3 participants remain, the game goes to SCOREBOARD with `NOT_ENOUGH_PLAYERS`.

Example: with 4 players and 10 rounds, the split is 3/3/2/2 in an unpredictable order.

### Scoring (per round)

| Correct guesses | Points |
|---|---|
| 0 | Playlist owner **+10** |
| exactly 1 | That guesser **+10** |
| 2 or more | Each correct guesser **+5**; owner 0 |

- The owner's own vote can never be correct (self-voting is blocked), so it needs no special case.
- If the owner is offline (past the grace period) when voting closes, nobody could have voted for them, so the owner gets 0 instead of +10 (D12).
- Votes not cast are not counted.
- The point values are stored in `Game.settingsSnapshot`, so changing rules never alters old games.

### Final awards
Final ranking (ties share a rank), most correct guesses, and best bluffer (most `OWNER_UNGUESSED` points).

---

## 6. Voting

- Everyone in the game votes, including the owner.
- Candidates are **online** participants except the voter (D5). The list is validated on the server when the vote arrives. A vote already cast for a player who later goes offline stays valid.
- A vote is final once submitted.
- **Required voters** are participants who are connected, or who disconnected less than 30 s ago (grace period).
- Voting completes when every required voter has voted. The check runs after every vote, every grace-period expiry and every player leave.
- The leader can press **"Close voting"** at any time. Votes not yet cast are not counted (D4b).
- If a skipped player reconnects before the reveal, they can still vote.
- During voting, clients only see `{votesIn, expected}`. Since everyone votes, the count reveals nothing about the owner.

### Concurrency
- Each vote runs in a transaction (`VotingService`):
  1. Lock the room row (`SELECT … FOR UPDATE`), like every other game command.
  2. If the voter already voted this round: the same `clientRequestId` returns the original acknowledgement (even after voting closed); another ID is `ALREADY_VOTED`.
  3. Check `phase = VOTING`, round number and candidate validity (`VOTING_CLOSED`, `INVALID_SUSPECT`).
  4. Insert the vote, then re-check completion; the last vote moves the game to REVEAL in the same transaction.
- Because the reveal also holds the room lock, a vote and the reveal serialize. Either the vote commits first and counts, or it sees `REVEAL` and is rejected.
- `UNIQUE (roundId, voterId)` and the self-vote `CHECK` back the rules up in the database.
- Completion is re-checked after every vote, every player leave, every player going AWAY and every player coming back (`GameOrchestrator.closeVotingIfCompleteInTx`). With nobody online, voting never closes by itself.
- Scoring (`RoundScorer`) runs inside the same transaction as the VOTING → REVEAL transition, which is compare-and-set, and `UNIQUE (roundId, participantId)` on `RoundScore` rejects any second allocation.
- A game that ends early from VOTING (`NOT_ENOUGH_PLAYERS`) does not score that round.

---

## 7. Playlist ingestion & duplicate songs

1. Parse the URL (`youtube.com/playlist?list=` incl. `www.`/`m.`/`music.`, `watch?v=…&list=`, `youtu.be/…?list=`, or a bare ID). Reject `LL`/`LM` (Liked), `WL` (Watch Later) and `RD…` (generated mixes; YouTube Music's curated `RDCLAK5uy_…` playlists are allowed because the Data API serves them) early with a specific error (`UNSUPPORTED_PLAYLIST`); anything else malformed is `INVALID_PLAYLIST_URL`. Both are synchronous 400s.
2. `PUT` stores the submission as `PROCESSING` with a new `submissionId` (old tracks deleted) and returns 202. Processing runs in the background.
3. `playlists.list` gets metadata (empty → `PLAYLIST_NOT_FOUND`, covering private and deleted playlists). `playlistItems.list` is paginated (50 per page, capped at **200** items).
4. `videos.list` (batches of 50) keeps only public/unlisted, processed, embeddable, non-age-restricted, non-live videos with a duration; videos missing from the response (deleted/private) are dropped. With `YOUTUBE_REGION_CODE` set, region-blocked videos are dropped too. Unplayable videos are not stored.
5. Fewer than `minPlayableTracks` (default 5) playable songs → `REJECTED` (`NOT_ENOUGH_PLAYABLE_SONGS`).
6. **Duplicate songs (D6):** the result is committed in a transaction guarded by a per-room advisory lock (`pg_advisory_xact_lock`). Any song already `PLAYABLE` in another **READY** playlist of the room is marked `DUPLICATE`.
   - A READY playlist never loses songs; only the submission that finishes processing later is affected. (With background processing, "finished first" is the order every instance agrees on, rather than submission time.)
   - Under the lock, the row is re-checked: if its `submissionId` changed (replaced) or it was deleted, the result is discarded.
7. If fewer than `minPlayableTracks` unique songs remain, the submission is `REJECTED` (`NOT_ENOUGH_UNIQUE_SONGS`).
8. The submitter is told **how many** songs were dropped as duplicates, not which ones. This limits probing of other players' playlists.

**Jobs and recovery.** Jobs run in an in-process queue (4 at a time per instance). A sweep every 30 s claims `PROCESSING` rows older than 2 minutes with a compare-and-set on `processingStartedAt` (one instance wins) and re-runs them; after 3 attempts the row becomes `REJECTED` (`YOUTUBE_UNAVAILABLE`). Expected YouTube failures (`PLAYLIST_NOT_FOUND`, `QUOTA_EXHAUSTED`, `YOUTUBE_UNAVAILABLE` after one retry) reject immediately.

**Quota.** Every Data API call costs 1 unit and is counted in Redis per Pacific-time day (YouTube's reset). `PUT` returns 503 `QUOTA_EXHAUSTED` when fewer than 9 units remain (a worst-case submission) unless the playlist is cached; a real `quotaExceeded` from YouTube closes the day. Budget: `YOUTUBE_DAILY_QUOTA_UNITS` (default 10,000).

**Cache.** The fetched, filtered playlist is cached in Redis for 1 hour per playlist ID to save quota on retries and replacements. The cache never assumes a video is still playable: playback errors are handled in the game (M4).

**Leaving** the room deletes the player's playlist in the same transaction.

---

## 8. REST API (`/api/v1`)

| Method & path | Auth | Notes |
|---|---|---|
| `POST /auth/guest` `{displayName, avatarId}` | — | Creates a guest user. Returns `{accessToken, expiresAt, user}` and sets the refresh cookie. |
| `POST /auth/refresh` | cookie + `x-pmp-csrf: 1` | Rotates the refresh token. The just-rotated token is accepted for 30 s (concurrent tabs) without rotating again; any older token revokes the session. |
| `POST /auth/logout` | cookie + `x-pmp-csrf: 1` | Revokes the session and clears the cookie |
| `GET /me`, `PATCH /me` | JWT | |
| `POST /rooms` `{settings?}` | JWT | The creator becomes host/leader. Returns `RoomSnapshotDto`; the frontend builds the invite URL (`/join/{code}`). Settings: `maxPlayers` 3–10 (default 5), `roundCount` 5–20 (default 10). |
| `GET /rooms/:code/preview` | JWT | `{code, status, playerCount, maxPlayers, joinable}`. Unknown, closed and malformed codes return the same 404. Full or in-game rooms return `joinable: false` so invited friends see why. Rate-limited. |
| `POST /rooms/:code/join` `{displayName?, avatarId?}` | JWT | Idempotent. Room row locked, so capacity holds under concurrent joins. Display names are unique per room (case-insensitive). Rejected during a game unless already a participant (D9). |
| `POST /rooms/:code/leave` | member | Also during a game (§5, mid-game leave). A departing host is replaced by the longest-present player; the room closes when empty. |
| `GET /rooms/:code` | member | `RoomSnapshotDto` (same payload as socket `room:state`). Includes `game: GameSnapshotDto \| null`: the latest game as this viewer may see it (public state, the viewer's own `isYourPlaylist`, the latest reveal). |
| `PATCH /rooms/:code/settings` | host, LOBBY | |
| `PUT /rooms/:code/playlist` `{url}` | member, LOBBY | 202 `{status: PROCESSING}`. The result arrives via socket. 400 `INVALID_PLAYLIST_URL` / `UNSUPPORTED_PLAYLIST`; 503 `QUOTA_EXHAUSTED` / `YOUTUBE_UNAVAILABLE` (no key configured). Rate-limited to 6/min per player (players at a party often share one IP), with a 30/min per-IP ceiling. |
| `GET /rooms/:code/playlist` | member | **Own** submission only: `{playlist: MyPlaylistDto \| null}` |
| `DELETE /rooms/:code/playlist` | member, LOBBY | 204 |
| `GET /games/:id/results` | participant, FINISHED | Round history, reveals, ranking, awards |
| `GET /health`, `GET /health/ready` | — | Liveness, plus readiness checks for PostgreSQL and Redis |

Error envelope: `{ error: { code, message, details? }, requestId }`. Error codes are an enum in `@pmp/shared`.

---

## 9. Socket.IO (namespace `/game`)

- **Handshake:** `auth: { token }`, verified in middleware.
- **Socket rooms:** `room:{roomId}` (public), `player:{roomPlayerId}` (private).
- **Client→server commands** use ack callbacks: `{ok:true,data} | {ok:false,error}`. Mutating commands carry a `clientRequestId`, deduplicated with Redis `SET NX` (10 min).
- **Game broadcasts** carry `{stateVersion, serverTime}`. Clients drop events with an older version and call `sync:request` when they detect a gap.

### Client → Server

| Event | Payload | Authorization |
|---|---|---|
| `room:subscribe` | `{roomCode}` | member. Ack returns the full snapshot (also after reconnect). |
| `sync:request` | `{}` | member. Ack returns the full snapshot. |
| `time:ping` | `{clientSentAt}` | Ack returns `{serverTime}` |
| `game:start` | `{clientRequestId}` | leader, LOBBY; ≥3 players, all playlists READY. Ack returns the room snapshot with the game. A retry with the same `clientRequestId` returns the first result. |
| `game:advance` | `{expectedPhase, roundNumber}` | leader. Stop song / open voting / close voting / next song / final results / finish. Ack `{applied}`; a stale `expectedPhase` or `roundNumber` is acknowledged with `applied: false`. |
| `game:rematch` | `{clientRequestId}` | leader, SCOREBOARD or after a game. Ack returns the room snapshot with the new game. A retry with the same `clientRequestId` returns the first result. |
| `playback:report` | `{roundNumber, videoId, state: 'PLAYING'\|'ENDED'\|'ERROR', ytErrorCode?}` | **leader only**, PLAYING. Ignored unless `videoId` is the current song. Ack `{applied}`. |
| `vote:submit` | `{roundNumber, suspectPlayerId, clientRequestId}` | participant still in the room, VOTING. Ack `{roundNumber, suspectPlayerId}`. Errors: `VOTING_CLOSED`, `ALREADY_VOTED`, `INVALID_SUSPECT` (self, unknown, left or offline), `NOT_GAME_PARTICIPANT`. |
| `chat:send` | `{body ≤ 300, clientRequestId}` | member, rate-limited, sanitised |

### Server → Client

| Event | Scope | Payload |
|---|---|---|
| `room:state` | socket | Full snapshot |
| `room:player-joined` / `room:player-left` | room | `{player}` |
| `room:presence` | room | `{playerId, presence: 'ONLINE'\|'RECONNECTING'\|'AWAY'}`. Disconnects shorter than the ~5 s debounce are never broadcast. RECONNECTING = inside the 30 s grace (still counts as online for voting, D5); AWAY = past it. |
| `room:host-changed` | room | `{hostPlayerId}`. The new host's device becomes the speaker. |
| `room:settings-updated` | room | |
| `playlist:submission-updated` | room | `{playerId, ready}` only, and only when `ready` changes. Snapshots carry the same flag as `RoomPlayerDto.playlistReady`. |
| `playlist:my-status` | **player** | `{playlist: {status, sourceUrl, title, playableCount, duplicateCount, rejectionCode, submittedAt} \| null}` (`null` after removal) |
| `game:started` | room | `{gameNumber, totalRounds, playlistLabels}`. Clients resync to get their private context. |
| `game:phase-changed` | room | `{phase, roundNumber, totalRounds, phaseStartedAt, endReason}`. Also sent with the same phase when `totalRounds` shrinks. `endReason` is set from SCOREBOARD on. |
| `game:round-started` | room | `{round: {roundNumber, playlistLabel, track:{videoId,title,artist,thumbnailUrl,durationSec}}}` |
| `game:track-replaced` | room | Same shape as `round-started` |
| `round:viewer-context` | **player** | `{roundNumber, viewer: {isYourPlaylist, candidates: [{playerId, displayName, avatarId}], myVote}}`. Candidates are every other participant still in the room (the same list for everyone but the viewer); clients grey out AWAY ones from live presence. |
| `vote:progress` | room | `{roundNumber, votesIn, expected}`. Sent when voting opens and whenever the counts change. `expected` = online participants plus anyone who already voted. |
| `game:round-revealed` | room | `{reveal: {roundNumber, playlistLabel, ownerPlayerId, ownerDisplayName, votes: [{voterPlayerId, suspectPlayerId, isCorrect}], points: [{playerId, points, reason}]}, scoreboard}` |
| `game:results` | room | `{results: {ranking, awards: {topGuesser, bestBluffer}}}`, when the game reaches SCOREBOARD. Awards are shared on ties and `null` when nobody earned them. |
| `game:finished` | room | `{endReason, results}` |
| `chat:message` | room | `{id, playerId, body, createdAt}` |
| `session:replaced` | socket | Another tab took over this player. The old socket is then disconnected and does not reconnect by itself. |

Command errors are acknowledged as `{ok:false, error:{code, message}}` with the same codes as REST (`ROOM_NOT_FOUND` for non-members, unknown and malformed codes alike; `VALIDATION_FAILED`; `RATE_LIMITED`; `NOT_SUBSCRIBED` for `sync:request` before `room:subscribe`). A rejected handshake fails with `connect_error` and `data.code = 'UNAUTHORIZED'`.

Lobby events (M2) carry no `stateVersion`: their patches are idempotent and every (re)connect or tab refocus resyncs the full snapshot. Every game event carries `{stateVersion, serverTime}` from `Game.stateVersion`. One change can emit several events with the same version (e.g. phase + song + private context), so clients apply equal versions, drop older ones, and call `sync:request` when a version is skipped.

The live scoreboard (D1) is part of every snapshot and updates only in `game:round-revealed`, never during voting. Snapshots also carry `voteProgress` (VOTING only), the viewer's `candidates` and `myVote`, and `results` (SCOREBOARD and FINISHED). Ranking: total score, ties share a rank (1, 1, 3); participants who left stay listed with `hasLeft`.

---

## 10. Authentication & player sessions

- `POST /auth/guest` creates a guest `User` and returns two tokens:
  - an **access JWT** (15 min, `sub=userId`, `sid=sessionId`), kept in memory only;
  - an **opaque refresh token** (30 days), stored as a hash in `AuthSession` and sent as an `httpOnly; Secure; SameSite=Lax` cookie. It's rotated on every refresh, and reuse revokes the session.
- The frontend and API must be same-site (e.g. `app.x.com` and `api.x.com`).
- **Player identity is `(roomId, userId)`, never the socket ID.** Handlers resolve the player from `socket.data.userId` and ignore any player ID the client sends.
- The socket client uses `auth: (cb) => cb({ token: getFreshToken() })`, so every reconnect sends a fresh token.
- **Reconnect flow:**
  1. The handshake verifies the JWT.
  2. `room:subscribe` checks membership.
  3. The server joins the socket to its rooms, marks the player online and cancels the grace timer.
  4. The ack returns the snapshot, and the client replaces its store.
- **Multiple tabs:** the last connection wins. The older socket gets `session:replaced`.
- **Known limitation:** clearing cookies loses the guest identity.

### Grace timers (no BullMQ needed)
Because phases have no deadlines, the only timers are the presence debounce (~5 s) and the 30 s grace period (player away, host migration).
They're stored in a Redis sorted set (`member = kind:roomId:playerId`, `kind = reconnecting|away`, `score = dueAt`).
Socket ownership (`pmp:room:{roomId}:sockets`) and public presence (`pmp:room:{roomId}:presence`) are Redis hashes; every transition (connect, disconnect, expire, join, leave) is one Lua script, so instances cannot interleave.
A REST join starts the player ONLINE with both timers running; the client's socket cancels them on subscribe, and a player who never connects becomes AWAY.
If every player is away when the host's grace ends, the host role stays put and goes to the first player who reconnects.
Each instance runs a 1 s sweeper that claims due entries with `ZREM` (only one instance wins). The sweeper then:
- marks the player away;
- re-checks whether voting is complete;
- migrates the host if needed.

These timers survive restarts and are safe across multiple instances.

---

## 11. Playlist ownership privacy

Enforced in layers:
1. **Query projection.** Public read paths never `select` `Playlist.roomPlayerId`, `sourceUrl` or `title`.
2. **Explicit mappers** (`toPublicRoundDto`, …) copy allowlisted fields only. Entities are never spread or serialised directly.
3. **Typed emission.** All emits go through `RoomBroadcaster`, which is typed against `ServerToClientEvents`.
4. **Reveal gate.** Owner and vote details are read only when `round.status = REVEALED` (`loadReveal` in `games/game.mapper.ts`). Before that, game reads select only the anonymous `publicLabel`; the viewer's own `isYourPlaylist` comes from a count query that returns a boolean, never the owner, and is sent only on the viewer's private channel.
5. **Leak tests.** In a 5-client test with votes cast, every pre-reveal public event is checked for player identifiers, and every viewer's snapshot minus its own `viewer` context must be identical for owner and non-owners. Individual votes are read only through the reveal gate; before it, a viewer learns only their own `myVote`.

| Leak vector | Mitigation |
|---|---|
| Playlist title or `channelTitle` (often the owner's name) | Never public; only shown to the owner |
| IFrame player loaded with `list=` | Videos load by `videoId` only |
| Labels follow submission order | Labels are CSPRNG-shuffled at game start |
| Internal track/playlist IDs | Never sent. Rounds are addressed by `roundNumber`. UUIDv4 everywhere. |
| Who has or hasn't voted | Everyone votes; only counts are shown |
| Duplicate-song feedback | Only the count of dropped songs is shown, not which ones. Submissions are rate-limited. |
| Error messages | Errors only describe the caller's own state |

---

## 12. Open items

1. **Leader AFK:** the game waits on the leader for every phase. Host migration only happens on disconnect.

Approved dependencies: pnpm workspaces, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/throttler`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `class-validator`, `class-transformer`, `ioredis`, `@socket.io/redis-adapter`, `helmet`, `cookie-parser`, `sanitize-html`, `@types/youtube`.

---

## 13. Risks

| Area | Risk | Mitigation |
|---|---|---|
| Sync | Duplicate transitions (leader double-click, all-voted vs. leader racing) | CAS on `(phase, stateVersion)`, `expectedPhase` in commands |
| Sync | Broadcast lost between commit and emit | Version-gap detection, `sync:request` on reconnect/tab focus |
| Sync | Multiple backend instances | Socket.IO Redis adapter; sticky sessions or websocket-only transport |
| Game flow | Game stalls on an idle voter or idle leader | Leader "Close voting"; host migration on disconnect |
| YouTube | 10,000 units/day default quota (~9 units per 200-song playlist) | Cap of ~200 items, Redis cache, per-user rate limit, clear "try later" error, request a quota extension early |
| YouTube | Private / LL / WL / mix playlists | Detected at parse time or from the API error, with a specific message |
| YouTube | Embedding disabled, region-blocked, age-restricted, deleted later | Filtered at ingestion; leader reports runtime errors (100/101/150) and the track is replaced from the same playlist |
| YouTube | Browser autoplay blocking | Only the leader plays: one "Tap to enable audio" gesture; the player instance is reused with `loadVideoById` |
| YouTube | No "artist" field | Parse "Artist - Title", strip " - Topic", best-effort |
| YouTube | Developer Policies on data storage | Purge playlists/tracks when rooms expire (≤ 7 days); privacy policy and attribution |
| Voting | Concurrent or duplicate votes, vote/reveal race | Row lock + unique constraint + idempotency key (§6) |
| Ingestion | Two players submitting the same song at the same moment | Per-room advisory lock during duplicate marking |
| Reconnect | Network blips | Identity tied to the user, 5 s presence debounce, 30 s grace, snapshot resync |

---

## 14. Roadmap

| # | Milestone | Exit criteria |
|---|---|---|
| M0 | Foundation: workspaces, tooling, docker-compose, Nest + Next skeletons, Prisma, Redis, `@pmp/shared`, `/health` | Dev stack starts; lint, typecheck and tests pass |
| M1 | Guest auth, rooms, join/leave, settings, rate limits | Supertest: auth, idempotent join, capacity, uniform 404 |
| M2 | Realtime lobby: WS auth, subscribe/resync, presence, grace sweeper, host migration, multi-tab. Also a minimal lobby UI (create, join by code or link, live player list, host settings) | 5-client socket tests incl. reconnect |
| M3 | Playlist ingestion: parser, Data API, pagination, playability filter, duplicate songs, quota guard, cache | Unit + mocked-API integration tests; lobby leak test |
| M4 | Game engine: state machine, balanced round plan, leader controls, playback reports, track replacement | Transition and exactly-once tests |
| M5 | Voting, scoring (10/10/5), reveal, live scoreboard, awards, rematch | Concurrent-vote, idempotent-scoring and full 5-player game tests; privacy leak test |
| M6 | Game UI: leader player, song card, chat, voting, reveal, scoreboard | Component tests; Playwright happy path with 3+ contexts |
| M7 | Resilience and polish: disconnect UX, animations, sounds, responsive, accessibility | Playwright: disconnect, host drop, invalid playlist |
| M8 | Hardening and deploy: security review, load test, multi-instance test, YouTube compliance | |
