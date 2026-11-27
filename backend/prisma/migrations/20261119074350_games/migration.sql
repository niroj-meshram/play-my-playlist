-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('PLAYING', 'DISCUSSION', 'VOTING', 'REVEAL', 'SCOREBOARD', 'FINISHED');

-- CreateEnum
CREATE TYPE "GameRoundStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVEALED');

-- CreateEnum
CREATE TYPE "GameEndReason" AS ENUM ('COMPLETED', 'NOT_ENOUGH_PLAYERS', 'OUT_OF_SONGS');

-- AlterEnum
ALTER TYPE "PlaylistTrackStatus" ADD VALUE 'UNPLAYABLE';

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "gameNumber" SMALLINT NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "currentRound" SMALLINT NOT NULL,
    "totalRounds" SMALLINT NOT NULL,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "phaseStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settingsSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "endReason" "GameEndReason",

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "roomPlayerId" UUID NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "correctGuesses" SMALLINT NOT NULL DEFAULT 0,
    "ownerPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlaylist" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "ownerParticipantId" UUID NOT NULL,
    "sourcePlaylistId" UUID,
    "publicLabel" VARCHAR(16) NOT NULL,

    CONSTRAINT "GamePlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRound" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "roundNumber" SMALLINT NOT NULL,
    "gamePlaylistId" UUID NOT NULL,
    "status" "GameRoundStatus" NOT NULL DEFAULT 'PENDING',
    "youtubeVideoId" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "artist" VARCHAR(200),
    "thumbnailUrl" VARCHAR(512),
    "durationSec" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_roomId_gameNumber_key" ON "Game"("roomId", "gameNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GameParticipant_gameId_roomPlayerId_key" ON "GameParticipant"("gameId", "roomPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlaylist_gameId_publicLabel_key" ON "GamePlaylist"("gameId", "publicLabel");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlaylist_ownerParticipantId_key" ON "GamePlaylist"("ownerParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_gameId_roundNumber_key" ON "GameRound"("gameId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_gameId_youtubeVideoId_key" ON "GameRound"("gameId", "youtubeVideoId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_roomPlayerId_fkey" FOREIGN KEY ("roomPlayerId") REFERENCES "RoomPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlaylist" ADD CONSTRAINT "GamePlaylist_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlaylist" ADD CONSTRAINT "GamePlaylist_ownerParticipantId_fkey" FOREIGN KEY ("ownerParticipantId") REFERENCES "GameParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlaylist" ADD CONSTRAINT "GamePlaylist_sourcePlaylistId_fkey" FOREIGN KEY ("sourcePlaylistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_gamePlaylistId_fkey" FOREIGN KEY ("gamePlaylistId") REFERENCES "GamePlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one game that is not FINISHED per room, so two concurrent starts cannot both succeed.
-- Prisma cannot express partial indexes; keep this in raw SQL (docs/architecture.md §3).
CREATE UNIQUE INDEX "Game_one_active_per_room" ON "Game"("roomId") WHERE "phase" <> 'FINISHED';
