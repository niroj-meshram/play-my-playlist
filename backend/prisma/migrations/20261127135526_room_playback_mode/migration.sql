-- CreateEnum
CREATE TYPE "PlaybackMode" AS ENUM ('LEADER_ONLY', 'EVERY_DEVICE');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "playbackMode" "PlaybackMode" NOT NULL DEFAULT 'LEADER_ONLY';
