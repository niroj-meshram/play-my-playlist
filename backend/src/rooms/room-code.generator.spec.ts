import { describe, expect, it } from '@jest/globals';
import { ROOM_CODE_ALPHABET } from '@pmp/shared';
import { ROOM_CODE_PATTERN, RoomCodeGenerator } from './room-code.generator.js';

describe('RoomCodeGenerator', () => {
  const generator = new RoomCodeGenerator();

  it('generates 6-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generator.generate()).toMatch(ROOM_CODE_PATTERN);
    }
  });

  it('never uses ambiguous characters', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('produces varied codes', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generator.generate()));
    expect(codes.size).toBeGreaterThan(995);
  });
});
