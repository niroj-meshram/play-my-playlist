-- CreateEnum
CREATE TYPE "PlaylistStatus" AS ENUM ('PROCESSING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlaylistTrackStatus" AS ENUM ('PLAYABLE', 'DUPLICATE');

-- CreateTable
CREATE TABLE "Playlist" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "roomPlayerId" UUID NOT NULL,
    "youtubePlaylistId" VARCHAR(64) NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(200),
    "status" "PlaylistStatus" NOT NULL DEFAULT 'PROCESSING',
    "rejectionCode" VARCHAR(40),
    "playableCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "submissionId" UUID NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" UUID NOT NULL,
    "playlistId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "youtubeVideoId" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "artist" VARCHAR(200),
    "thumbnailUrl" VARCHAR(512),
    "durationSec" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "PlaylistTrackStatus" NOT NULL,

    CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_roomPlayerId_key" ON "Playlist"("roomPlayerId");

-- CreateIndex
CREATE INDEX "Playlist_roomId_status_idx" ON "Playlist"("roomId", "status");

-- CreateIndex
CREATE INDEX "Playlist_status_processingStartedAt_idx" ON "Playlist"("status", "processingStartedAt");

-- CreateIndex
CREATE INDEX "PlaylistTrack_roomId_youtubeVideoId_idx" ON "PlaylistTrack"("roomId", "youtubeVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_youtubeVideoId_key" ON "PlaylistTrack"("playlistId", "youtubeVideoId");

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_roomPlayerId_fkey" FOREIGN KEY ("roomPlayerId") REFERENCES "RoomPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
