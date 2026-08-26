import { describe, expect, it } from 'vitest';

import { CPU_DEAD_ZONE, CPU_SPEED, cpuTargetY, cpuVelocity } from '../../src/game/cpu';
import { BALL_SPEED, COURT_HEIGHT, COURT_WIDTH } from '../../src/game/state';

describe('cpuTargetY', () => {
  it('tracks the ball once it is heading into the computer half', () => {
    expect(cpuTargetY({ x: COURT_WIDTH * 0.75, y: 120, vx: 200, vy: 0 })).toBe(120);
  });

  it('returns to the centre while the ball is elsewhere', () => {
    expect(cpuTargetY({ x: COURT_WIDTH * 0.75, y: 120, vx: -200, vy: 0 })).toBe(
      COURT_HEIGHT / 2,
    );
    expect(cpuTargetY({ x: COURT_WIDTH * 0.25, y: 120, vx: 200, vy: 0 })).toBe(
      COURT_HEIGHT / 2,
    );
  });
});

describe('cpuVelocity', () => {
  it('moves towards the target at its top speed', () => {
    expect(cpuVelocity(100, 300)).toBe(CPU_SPEED);
    expect(cpuVelocity(300, 100)).toBe(-CPU_SPEED);
  });

  it('holds still inside the dead zone', () => {
    expect(cpuVelocity(200, 200)).toBe(0);
    expect(cpuVelocity(200, 200 + CPU_DEAD_ZONE)).toBe(0);
    expect(cpuVelocity(200, 200 - CPU_DEAD_ZONE)).toBe(0);
  });

  it('is slower than the ball, so a steep return can beat it', () => {
    expect(CPU_SPEED).toBeLessThan(BALL_SPEED);
  });
});
