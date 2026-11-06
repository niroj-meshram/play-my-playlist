import type { AvatarId, PublicUserDto } from '@pmp/shared';

export function toPublicUserDto(user: {
  id: string;
  displayName: string;
  avatarId: string;
}): PublicUserDto {
  return { id: user.id, displayName: user.displayName, avatarId: user.avatarId as AvatarId };
}
