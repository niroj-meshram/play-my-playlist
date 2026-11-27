import type { RandomInt } from './random.js';

/** Deterministic RandomInt for tests (mulberry32). Not for production use. */
export function seededRandom(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    return Math.floor(unit * maxExclusive);
  };
}
