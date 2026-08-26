import { describe, expect, it } from 'vitest';

import { nextRandom, readSeed } from '../../src/game/rng';
import { createState, serve } from '../../src/game/state';

describe('nextRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const draw = (seed: number, count: number) => {
      const values: number[] = [];
      let state = seed;
      for (let i = 0; i < count; i += 1) {
        const next = nextRandom(state);
        values.push(next.value);
        state = next.state;
      }
      return values;
    };

    expect(draw(1, 8)).toEqual(draw(1, 8));
    expect(draw(1, 8)).not.toEqual(draw(2, 8));
  });

  it('stays within [0, 1)', () => {
    let state = 12345;
    for (let i = 0; i < 500; i += 1) {
      const next = nextRandom(state);
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(1);
      state = next.state;
    }
  });
});

describe('readSeed', () => {
  it('takes the seed from the query string', () => {
    expect(readSeed('?seed=7')).toBe(7);
    expect(readSeed('?other=1&seed=42')).toBe(42);
  });

  it('falls back to the current time when there is no usable seed', () => {
    expect(readSeed('', 1234)).toBe(1234);
    expect(readSeed('?seed=', 1234)).toBe(1234);
    expect(readSeed('?seed=abc', 1234)).toBe(1234);
  });
});

describe('serve', () => {
  it('serves an identical ball from an identical seed', () => {
    const first = serve(createState(1));
    const second = serve(createState(1));
    expect(second.ball).toEqual(first.ball);
    expect(serve(createState(2)).ball).not.toEqual(first.ball);
  });
});
