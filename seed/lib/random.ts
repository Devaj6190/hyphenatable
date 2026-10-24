// Deterministic seeded RNG (mulberry32). Same seed, same sequence, on every machine.

export type Rng = {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(items: readonly T[]): T;
  sample<T>(items: readonly T[], n: number): T[]; // n distinct items, original order kept
  chance(p: number): boolean;
};

export function hashSeed(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    sample: (items, n) => {
      const idx = items.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = int(0, i);
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      return idx
        .slice(0, n)
        .sort((x, y) => x - y)
        .map((i) => items[i]);
    },
    chance: (p) => next() < p,
  };
}
