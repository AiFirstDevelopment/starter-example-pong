/**
 * Seeded pseudo-random numbers.
 *
 * The generator is mulberry32, written as a pure step so the simulation can
 * carry its state around like any other value: the same seed always replays
 * the same rally, which is what makes `?seed=` reproducible.
 */

export interface RandomStep {
  /** A number in [0, 1). */
  value: number;
  /** The generator state to pass to the next call. */
  state: number;
}

export function nextRandom(state: number): RandomStep {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

/**
 * The seed for this page load: `?seed=<n>` when the URL carries a finite
 * number, otherwise the current time so every visit plays differently.
 */
export function readSeed(search: string, now: number = Date.now()): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || raw.trim() === '') {
    return now | 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed | 0 : now | 0;
}
