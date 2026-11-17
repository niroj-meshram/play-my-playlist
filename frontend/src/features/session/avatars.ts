import { AVATAR_IDS, type AvatarId } from '@pmp/shared';

/** Placeholder artwork until real avatars exist: one colour per avatar ID. */
const AVATAR_COLORS: Record<AvatarId, string> = {
  'avatar-01': 'bg-rose-500',
  'avatar-02': 'bg-orange-500',
  'avatar-03': 'bg-amber-500',
  'avatar-04': 'bg-lime-500',
  'avatar-05': 'bg-emerald-500',
  'avatar-06': 'bg-teal-500',
  'avatar-07': 'bg-cyan-500',
  'avatar-08': 'bg-sky-500',
  'avatar-09': 'bg-indigo-500',
  'avatar-10': 'bg-violet-500',
  'avatar-11': 'bg-fuchsia-500',
  'avatar-12': 'bg-pink-500',
};

export const AVATAR_OPTIONS = AVATAR_IDS;

export function avatarColor(id: AvatarId): string {
  return AVATAR_COLORS[id] ?? 'bg-muted';
}
