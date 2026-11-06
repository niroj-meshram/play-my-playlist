import { AVATAR_IDS, type AvatarId, type GuestSessionRequest } from '@pmp/shared';
import { IsIn } from 'class-validator';
import { IsDisplayName } from '../../common/validation/display-name.js';

export class GuestSessionDto implements GuestSessionRequest {
  @IsDisplayName()
  displayName: string;

  @IsIn(AVATAR_IDS)
  avatarId: AvatarId;
}
