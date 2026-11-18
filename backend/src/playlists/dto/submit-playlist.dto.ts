import type { SubmitPlaylistRequest } from '@pmp/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitPlaylistDto implements SubmitPlaylistRequest {
  /** Parsed by `parsePlaylistId`, which returns specific, user-facing errors. */
  @IsString()
  @MinLength(2)
  @MaxLength(2048)
  url: string;
}
