import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@pmp/shared';

export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** CSPRNG room codes: 31^6 ≈ 887 million combinations. Injectable so tests can force collisions. */
@Injectable()
export class RoomCodeGenerator {
  generate(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }
}
