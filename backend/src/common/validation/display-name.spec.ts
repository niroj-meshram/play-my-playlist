import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsDisplayName, normalizeDisplayName } from './display-name.js';

class Dto {
  @IsDisplayName()
  displayName!: string;
}

const errorsFor = (displayName: unknown) =>
  validateSync(plainToInstance(Dto, { displayName })).map((e) => e.property);

describe('normalizeDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeDisplayName('  DJ   Niro \t ')).toBe('DJ Niro');
  });

  it('removes control and invisible formatting characters', () => {
    expect(normalizeDisplayName('Ali\u0000ce​‮')).toBe('Alice');
  });

  it('keeps non-Latin letters and emoji', () => {
    expect(normalizeDisplayName('निरोज 🎧')).toBe('निरोज 🎧');
  });
});

describe('IsDisplayName', () => {
  it('accepts a normal name', () => {
    expect(errorsFor('Priya')).toEqual([]);
  });

  it('rejects names that are empty after normalisation', () => {
    expect(errorsFor('   ​ ')).toEqual(['displayName']);
  });

  it('rejects names without letters or numbers', () => {
    expect(errorsFor('!!!')).toEqual(['displayName']);
  });

  it('rejects names longer than 24 characters', () => {
    expect(errorsFor('a'.repeat(25))).toEqual(['displayName']);
  });

  it('rejects non-strings', () => {
    expect(errorsFor(42)).toEqual(['displayName']);
  });
});
