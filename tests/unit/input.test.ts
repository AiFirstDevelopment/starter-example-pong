import { describe, expect, it } from 'vitest';

import { courtY, drivesPaddle } from '../../src/input';
import { COURT_HEIGHT } from '../../src/game/state';

/** The canvas at its intrinsic size, at the very top of the viewport. */
const UNSCALED = { top: 0, height: COURT_HEIGHT };
/** The same canvas in a narrow window: half as tall, and pushed down the page. */
const SCALED = { top: 100, height: COURT_HEIGHT / 2 };

describe('courtY', () => {
  it('reads a pointer straight off an unscaled court', () => {
    expect(courtY(0, UNSCALED)).toBe(0);
    expect(courtY(240, UNSCALED)).toBe(240);
    expect(courtY(COURT_HEIGHT, UNSCALED)).toBe(COURT_HEIGHT);
  });

  it('takes the court off the top of the page into account', () => {
    const inset = { top: 96, height: COURT_HEIGHT };

    expect(courtY(96, inset)).toBe(0);
    expect(courtY(96 + 240, inset)).toBe(240);
  });

  it('scales a court the stylesheet has shrunk', () => {
    // Halfway down a half-height court is still halfway down the court.
    expect(courtY(100, SCALED)).toBe(0);
    expect(courtY(220, SCALED)).toBe(240);
    expect(courtY(340, SCALED)).toBe(COURT_HEIGHT);

    // And a raw offset would have answered 120 rather than 240 -- the bug this
    // mapping exists to avoid.
    expect(courtY(220, SCALED)).not.toBe(220 - SCALED.top);
  });

  it('reports how far above the court a pointer above it is', () => {
    expect(courtY(-40, UNSCALED)).toBe(-40);
    expect(courtY(40, SCALED)).toBe(-120);
  });

  it('reports how far below the court a pointer below it is', () => {
    expect(courtY(COURT_HEIGHT + 40, UNSCALED)).toBe(COURT_HEIGHT + 40);
    expect(courtY(400, SCALED)).toBe(600);
  });
});

describe('drivesPaddle', () => {
  it('lets the mouse drive from anywhere on the page', () => {
    expect(drivesPaddle('mouse', true)).toBe(true);
    // The paddle has to keep following a cursor that has left the court.
    expect(drivesPaddle('mouse', false)).toBe(true);
  });

  it('lets a finger drive only when the gesture began on the court', () => {
    expect(drivesPaddle('touch', true)).toBe(true);
    // A drag that started on the hint text is the player scrolling the page.
    expect(drivesPaddle('touch', false)).toBe(false);
  });

  it('treats a pen like a finger', () => {
    expect(drivesPaddle('pen', true)).toBe(true);
    expect(drivesPaddle('pen', false)).toBe(false);
  });
});
