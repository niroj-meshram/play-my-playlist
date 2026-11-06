import { AVATAR_IDS, type AvatarId, type UpdateProfileRequest } from '@pmp/shared';
import { IsIn, IsOptional } from 'class-validator';
import { IsDisplayName } from '../../common/validation/display-name.js';

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsDisplayName()
  displayName?: string;

  @IsOptional()
  @IsIn(AVATAR_IDS)
  avatarId?: AvatarId;
}
