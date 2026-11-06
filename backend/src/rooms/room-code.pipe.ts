import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import { ROOM_CODE_PATTERN } from './room-code.generator.js';

/** Normalises a room code from the URL. Malformed codes get the same 404 as unknown ones. */
@Injectable()
export class ParseRoomCodePipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!ROOM_CODE_PATTERN.test(code)) {
      throw roomNotFound();
    }
    return code;
  }
}

export function roomNotFound(): AppException {
  return new AppException(ErrorCode.ROOM_NOT_FOUND, 'Room not found.', HttpStatus.NOT_FOUND);
}
