import type {
  ActiveGamePhase,
  GameVersioned,
  PublicRoundDto,
  PublicTrackDto,
  RoundRevealDto,
} from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';

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
} as const satisfies Prisma.GameRoundSelect;

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
  };
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
