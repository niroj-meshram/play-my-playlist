import type { MyPlaylistDto, PlaylistRejectionCode, PlaylistStatus } from '@pmp/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Fields of the OWNER's view. Only ever loaded for the requesting owner. */
export const MY_PLAYLIST_SELECT = {
  status: true,
  sourceUrl: true,
  title: true,
  playableCount: true,
  duplicateCount: true,
  rejectionCode: true,
  submittedAt: true,
} satisfies Prisma.PlaylistSelect;

export type MyPlaylistRow = Prisma.PlaylistGetPayload<{ select: typeof MY_PLAYLIST_SELECT }>;

export function toMyPlaylistDto(row: MyPlaylistRow): MyPlaylistDto {
  return {
    status: row.status as PlaylistStatus,
    sourceUrl: row.sourceUrl,
    title: row.title,
    playableCount: row.playableCount,
    duplicateCount: row.duplicateCount,
    rejectionCode: row.rejectionCode as PlaylistRejectionCode | null,
    submittedAt: row.submittedAt.toISOString(),
  };
}
