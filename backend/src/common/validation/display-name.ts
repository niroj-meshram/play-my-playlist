import { applyDecorators } from '@nestjs/common';
import { DISPLAY_NAME_LIMITS } from '@pmp/shared';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

/**
 * Canonical form of a user-provided name: Unicode NFC, control/format/private-use
 * characters removed, whitespace collapsed and trimmed. React escapes output, so no
 * HTML encoding is applied here.
 */
export function normalizeDisplayName(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Validates (and normalises) a display name property. */
export function IsDisplayName(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? normalizeDisplayName(value) : value)),
    IsString(),
    Length(DISPLAY_NAME_LIMITS.minLength, DISPLAY_NAME_LIMITS.maxLength),
    Matches(/[\p{L}\p{N}]/u, { message: 'displayName must contain a letter or a number' }),
  );
}
