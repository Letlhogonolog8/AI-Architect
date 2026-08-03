/**
 * Seeded pseudo-random source.
 *
 * `Math.random()` is unusable here: fixtures would differ between the two
 * renders React 19 Strict Mode performs, between tabs, and between a screenshot
 * and the bug report describing it. A seeded PRNG makes the simulation
 * reproducible — the same seed always yields the same fleet.
 *
 * mulberry32: 32 bits of state, good enough distribution for visual simulation,
 * and small enough to read. Not cryptographic, and never to be used for
 * anything that needs to be.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomHelpers {
  next: () => number;
  /** Uniform float in `[min, max)`. */
  float: (min: number, max: number) => number;
  /** Uniform integer in `[min, max]`, inclusive. */
  int: (min: number, max: number) => number;
  /** Uniformly picks one element. Throws on an empty list rather than returning undefined. */
  pick: <T>(items: readonly T[]) => T;
  /** True with probability `p`. */
  chance: (p: number) => boolean;
  /** Fisher-Yates, returning a new array. */
  shuffle: <T>(items: readonly T[]) => T[];
}

export function createRandomHelpers(seed: number): RandomHelpers {
  const next = createRandom(seed);

  const float = (min: number, max: number): number => min + next() * (max - min);
  const int = (min: number, max: number): number => Math.floor(float(min, max + 1));

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty list.');
    }
    return items[int(0, items.length - 1)] as T;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      const a = copy[i] as T;
      const b = copy[j] as T;
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  };

  return { next, float, int, pick, chance: (p) => next() < p, shuffle };
}

/** Stable pseudo-UUID derived from the seeded stream, so ids are reproducible too. */
export function seededId(random: RandomHelpers, prefix: string): string {
  const hex = (length: number): string =>
    Array.from({ length }, () => random.int(0, 15).toString(16)).join('');

  return `${prefix}-${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
