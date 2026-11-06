import { describe, expect, it } from '@jest/globals';
import { pickNextHost } from './host-succession.js';

const at = (s: number) => new Date(2026, 10, 6, 12, 0, s);

describe('pickNextHost', () => {
  it('picks the earliest-joined remaining player', () => {
    const players = [
      { id: 'host', joinedAt: at(0) },
      { id: 'c', joinedAt: at(30) },
      { id: 'b', joinedAt: at(10) },
    ];
    expect(pickNextHost(players, 'host')?.id).toBe('b');
  });

  it('breaks joinedAt ties by ID', () => {
    const players = [
      { id: 'host', joinedAt: at(0) },
      { id: 'z', joinedAt: at(5) },
      { id: 'm', joinedAt: at(5) },
    ];
    expect(pickNextHost(players, 'host')?.id).toBe('m');
  });

  it('returns null when nobody remains', () => {
    expect(pickNextHost([{ id: 'host', joinedAt: at(0) }], 'host')).toBeNull();
  });
});
