-- CreateEnum
CREATE TYPE "RoundScoreReason" AS ENUM ('OWNER_UNGUESSED', 'SOLE_CORRECT', 'SHARED_CORRECT', 'OWNER_OFFLINE');

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "voterId" UUID NOT NULL,
    "suspectId" UUID NOT NULL,
    "isCorrect" BOOLEAN,
    "clientRequestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundScore" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "points" SMALLINT NOT NULL,
    "reason" "RoundScoreReason" NOT NULL,

    CONSTRAINT "RoundScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vote_roundId_voterId_key" ON "Vote"("roundId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundScore_roundId_participantId_key" ON "RoundScore"("roundId", "participantId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "GameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "GameParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_suspectId_fkey" FOREIGN KEY ("suspectId") REFERENCES "GameParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundScore" ADD CONSTRAINT "RoundScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "GameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundScore" ADD CONSTRAINT "RoundScore_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "GameParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express CHECK constraints.
-- Self-votes are blocked by the database as well as by VotingService.
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_no_self_vote" CHECK ("voterId" <> "suspectId");
ALTER TABLE "RoundScore" ADD CONSTRAINT "RoundScore_points_nonneg" CHECK ("points" >= 0);
