import type {
  ActiveGamePhase,
  GameResultsDto,
  GameVersioned,
  PublicRoundDto,
  PublicTrackDto,
  RoundRevealDto,
  ScoreboardEntryDto,
  VoteCandidateDto,
} from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { computeAwards, rankScoreboard } from './domain/final-results.js';

type Db = Prisma.TransactionClient;

/** Phases in which a round's song is on screen. */
export const IN_ROUND_PHASES: readonly ActiveGamePhase[] = [
  'PLAYING',
  'DISCUSSION',
  'VOTING',
  'REVEAL',
];
/** Phases in which the latest reveal stays visible. */
export const REVEALED_PHASES: readonly ActiveGamePhase[] = ['REVEAL', 'SCOREBOARD', 'FINISHED'];
/** Phases that show the final ranking and awards. */
export const RESULTS_PHASES: readonly ActiveGamePhase[] = ['SCOREBOARD', 'FINISHED'];

/** Song fields copied into a round; the same shape is read back for public payloads. */
export const SONG_SELECT = {
  youtubeVideoId: true,
  title: true,
  artist: true,
  thumbnailUrl: true,
  durationSec: true,
} as const satisfies Prisma.PlaylistTrackSelect;

export type Song = Prisma.PlaylistTrackGetPayload<{ select: typeof SONG_SELECT }>;

/**
 * Public view of a round. Privacy: selects only the anonymous label of its playlist,
 * never the owner (docs/architecture.md §11).
 */
export const PUBLIC_ROUND_SELECT = {
  roundNumber: true,
  ...SONG_SELECT,
  gamePlaylist: { select: { publicLabel: true } },
} as const satisfies Prisma.GameRoundSelect;

type PublicRoundRow = Prisma.GameRoundGetPayload<{ select: typeof PUBLIC_ROUND_SELECT }>;

/**
 * The reveal gate: the owner is read only together with `status: REVEALED`, so an
 * unrevealed round's owner can never reach this mapper.
 */
const REVEAL_SELECT = {
  roundNumber: true,
  gamePlaylist: {
    select: {
      publicLabel: true,
      owner: { select: { roomPlayer: { select: { id: true, displayName: true } } } },
    },
  },
  votes: {
    orderBy: { createdAt: 'asc' },
    select: {
      isCorrect: true,
      voter: { select: { roomPlayerId: true } },
      suspect: { select: { roomPlayerId: true } },
    },
  },
  scores: {
    select: { points: true, reason: true, participant: { select: { roomPlayerId: true } } },
  },
} as const satisfies Prisma.GameRoundSelect;

/** Scores are public at all times: they only change when a round is revealed. */
const SCOREBOARD_SELECT = {
  roomPlayerId: true,
  totalScore: true,
  correctGuesses: true,
  ownerPoints: true,
  roomPlayer: { select: { displayName: true, avatarId: true, status: true } },
} as const satisfies Prisma.GameParticipantSelect;

export function toPublicTrack(song: Song): PublicTrackDto {
  return {
    videoId: song.youtubeVideoId,
    title: song.title,
    artist: song.artist,
    thumbnailUrl: song.thumbnailUrl,
    durationSec: song.durationSec,
  };
}

export function toPublicRound(row: PublicRoundRow): PublicRoundDto {
  return {
    roundNumber: row.roundNumber,
    playlistLabel: row.gamePlaylist.publicLabel,
    track: toPublicTrack(row),
  };
}

export function versioned(stateVersion: number): GameVersioned {
  return { stateVersion, serverTime: Date.now() };
}

export async function loadPublicRound(
  db: Db,
  gameId: string,
  roundNumber: number,
): Promise<PublicRoundDto | null> {
  const row = await db.gameRound.findUnique({
    where: { gameId_roundNumber: { gameId, roundNumber } },
    select: PUBLIC_ROUND_SELECT,
  });
  return row ? toPublicRound(row) : null;
}

/** Latest revealed round of a game, or a specific one. Never reads unrevealed owners. */
export async function loadReveal(
  db: Db,
  gameId: string,
  roundNumber?: number,
): Promise<RoundRevealDto | null> {
  const row = await db.gameRound.findFirst({
    where: { gameId, status: 'REVEALED', ...(roundNumber === undefined ? {} : { roundNumber }) },
    orderBy: { roundNumber: 'desc' },
    select: REVEAL_SELECT,
  });
  if (!row) return null;
  const owner = row.gamePlaylist.owner.roomPlayer;
  return {
    roundNumber: row.roundNumber,
    playlistLabel: row.gamePlaylist.publicLabel,
    ownerPlayerId: owner.id,
    ownerDisplayName: owner.displayName,
    votes: row.votes.map((v) => ({
      voterPlayerId: v.voter.roomPlayerId,
      suspectPlayerId: v.suspect.roomPlayerId,
      isCorrect: v.isCorrect === true,
    })),
    points: row.scores.map((s) => ({
      playerId: s.participant.roomPlayerId,
      points: s.points,
      reason: s.reason,
    })),
  };
}

/** The live scoreboard of a game, ranked. Participants who left stay listed. */
export async function loadScoreboard(db: Db, gameId: string): Promise<ScoreboardEntryDto[]> {
  const rows = await db.gameParticipant.findMany({
    where: { gameId },
    select: SCOREBOARD_SELECT,
  });
  return rankScoreboard(
    rows.map((p) => ({
      playerId: p.roomPlayerId,
      displayName: p.roomPlayer.displayName,
      avatarId: p.roomPlayer.avatarId,
      totalScore: p.totalScore,
      correctGuesses: p.correctGuesses,
      ownerPoints: p.ownerPoints,
      hasLeft: p.roomPlayer.status !== 'ACTIVE',
    })),
  );
}

export function toResults(scoreboard: ScoreboardEntryDto[]): GameResultsDto {
  return { ranking: scoreboard, awards: computeAwards(scoreboard) };
}

/**
 * Who the viewer may vote for: every other participant still in the room, in name order.
 * The same list for everyone but the viewer, so it says nothing about the owner. Whether
 * a candidate is online is checked against live presence (server on submit, client in UI).
 */
export function toCandidates(
  scoreboard: readonly ScoreboardEntryDto[],
  viewerPlayerId: string,
): VoteCandidateDto[] {
  return scoreboard
    .filter((e) => !e.hasLeft && e.playerId !== viewerPlayerId)
    .map((e) => ({ playerId: e.playerId, displayName: e.displayName, avatarId: e.avatarId }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The player the viewer voted for in a round, or `null`. Only ever sent to the viewer. */
export async function loadMyVote(
  db: Db,
  gameId: string,
  roundNumber: number,
  viewerPlayerId: string,
): Promise<string | null> {
  const vote = await db.vote.findFirst({
    where: { round: { gameId, roundNumber }, voter: { roomPlayerId: viewerPlayerId } },
    select: { suspect: { select: { roomPlayerId: true } } },
  });
  return vote?.suspect.roomPlayerId ?? null;
}

/** Whether the viewer owns the playlist of a round. Returns only a boolean, never the owner. */
export async function isViewersRound(
  db: Db,
  gameId: string,
  roundNumber: number,
  viewerPlayerId: string,
): Promise<boolean> {
  const owned = await db.gameRound.count({
    where: { gameId, roundNumber, gamePlaylist: { owner: { roomPlayerId: viewerPlayerId } } },
  });
  return owned > 0;
}

/** "Playlist A", "Playlist B", … in shuffled order (max 10 players). */
export function playlistLabel(index: number): string {
  return `Playlist ${String.fromCharCode(65 + index)}`;
}
