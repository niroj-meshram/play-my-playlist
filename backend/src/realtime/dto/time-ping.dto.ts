import type { TimePingRequest } from '@pmp/shared';
import { IsNumber } from 'class-validator';

export class TimePingDto implements TimePingRequest {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  clientSentAt: number;
}
