import { AVATAR_IDS, type AvatarId, type JoinRoomRequest } from '@pmp/shared';
import { IsIn, IsOptional } from 'class-validator';
import { IsDisplayName } from '../../common/validation/display-name.js';

export class JoinRoomDto implements JoinRoomRequest {
  @IsOptional()
  @IsDisplayName()
  displayName?: string;

  @IsOptional()
  @IsIn(AVATAR_IDS)
  avatarId?: AvatarId;
}
