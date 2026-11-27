import { randomInt } from 'node:crypto';

/** Returns an integer in [0, maxExclusive). Injected so tests can be deterministic. */
export type RandomInt = (maxExclusive: number) => number;

/** CSPRNG source: playlist order and song choice must not be predictable (§5, §11). */
export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rand: RandomInt = secureRandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Removes and returns a random element, or `undefined` when empty. */
export function takeRandom<T>(items: T[], rand: RandomInt = secureRandomInt): T | undefined {
  if (items.length === 0) return undefined;
  const [picked] = items.splice(rand(items.length), 1);
  return picked;
}
