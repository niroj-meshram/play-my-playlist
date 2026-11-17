import type { AvatarId } from '@pmp/shared';
import { cn } from '@/lib/utils';
import { avatarColor } from '../avatars';

interface PlayerAvatarProps {
  avatarId: AvatarId;
  name: string;
  className?: string;
}

export function PlayerAvatar({ avatarId, name, className }: PlayerAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white',
        avatarColor(avatarId),
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
