import { describe, expect, it } from 'vitest';

import { NO_INPUT, step, type GameEvent } from '../../src/game/step';
import {
  BALL_RADIUS,
  BALL_SPEED,
  COURT_HEIGHT,
  COURT_WIDTH,
  CPU_X,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PLAYER_X,
  WINNING_SCORE,
  createState,
  type Ball,
  type GameState,
} from '../../src/game/state';

const TICK_MS = 1000 / 120;

/** A rally in progress, with the ball wherever the test needs it. */
function rally(ball: Partial<Ball>, overrides: Partial<GameState> = {}): GameState {
  const base = createState(1);
  return {
    ...base,
    phase: 'rally',
    ball: { ...base.ball, ...ball },
    ...overrides,
  };
}

function kinds(events: GameEvent[]): string[] {
  return events.map((event) => event.kind);
}

/** Run several ticks, collecting everything that happened along the way. */
function advance(state: GameState, ticks: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(current, TICK_MS, NO_INPUT);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function speed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vy);
}

describe('walls', () => {
  it('reflects the ball off the top wall and reports it', () => {
    const start = rally({ y: BALL_RADIUS + 1, vx: 0, vy: -BALL_SPEED });
    const { state, events } = step(start, TICK_MS, NO_INPUT);

    expect(events).toEqual([{ kind: 'wall-hit', edge: 'top' }]);
    expect(state.ball.vy).toBe(BALL_SPEED);
    expect(state.ball.y).toBe(BALL_RADIUS);
  });

  it('reflects the ball off the bottom wall and reports it', () => {
    const start = rally({
      y: COURT_HEIGHT - BALL_RADIUS - 1,
      vx: 0,
      vy: BALL_SPEED,
    });
    const { state, events } = step(start, TICK_MS, NO_INPUT);

    expect(events).toEqual([{ kind: 'wall-hit', edge: 'bottom' }]);
    expect(state.ball.vy).toBe(-BALL_SPEED);
    expect(state.ball.y).toBe(COURT_HEIGHT - BALL_RADIUS);
  });

  it('leaves the ball alone in the middle of the court', () => {
    const start = rally({ y: COURT_HEIGHT / 2, vx: 0, vy: -BALL_SPEED });
    const { events } = step(start, TICK_MS, NO_INPUT);

    expect(events).toEqual([]);
  });
});

describe('paddles', () => {
  const playerFace = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
  const cpuFace = CPU_X - BALL_RADIUS;
  const centred = (COURT_HEIGHT - PADDLE_HEIGHT) / 2;

  it('sends the ball back the other way, and reports only that', () => {
    const start = rally({ x: playerFace, y: COURT_HEIGHT / 2, vx: -BALL_SPEED, vy: 0 });
    const { state, events } = step(start, TICK_MS, NO_INPUT);

    expect(kinds(events)).toEqual(['paddle-hit']);
    expect(state.ball.vx).toBeGreaterThan(0);
    expect(state.score).toEqual({ player: 0, cpu: 0 });
  });

  it('bounces off the computer paddle too', () => {
    const start = rally({ x: cpuFace, y: COURT_HEIGHT / 2, vx: BALL_SPEED, vy: 0 });
    const { state, events } = step(start, TICK_MS, NO_INPUT);

    expect(events).toEqual([{ kind: 'paddle-hit', side: 'cpu' }]);
    expect(state.ball.vx).toBeLessThan(0);
  });

  it('returns a centre hit flat and an edge hit steeply', () => {
    const flat = step(
      rally({ x: playerFace, y: centred + PADDLE_HEIGHT / 2, vx: -BALL_SPEED, vy: 0 }),
      TICK_MS,
      NO_INPUT,
    ).state.ball;
    const high = step(
      rally({ x: playerFace, y: centred + 2, vx: -BALL_SPEED, vy: 0 }),
      TICK_MS,
      NO_INPUT,
    ).state.ball;
    const low = step(
      rally({
        x: playerFace,
        y: centred + PADDLE_HEIGHT - 2,
        vx: -BALL_SPEED,
        vy: 0,
      }),
      TICK_MS,
      NO_INPUT,
    ).state.ball;

    expect(flat.vy).toBeCloseTo(0);
    expect(high.vy).toBeLessThan(-100);
    expect(low.vy).toBeGreaterThan(100);
    for (const ball of [flat, high, low]) {
      expect(speed(ball)).toBeCloseTo(BALL_SPEED);
    }
  });

  it('lets the ball through when the paddle is not in its way', () => {
    const start = rally({ x: playerFace, y: 20, vx: -BALL_SPEED, vy: 0 });
    const { events } = step(start, TICK_MS, NO_INPUT);

    expect(events).toEqual([]);
  });
});

describe('out of play', () => {
  it('gives the point to the computer when the ball passes the player', () => {
    const start = rally({ x: 60, y: 20, vx: -BALL_SPEED, vy: 0 });
    const { state, events } = advance(start, 30);

    expect(events).toEqual([
      { kind: 'out-of-play', side: 'player' },
      { kind: 'point-scored', side: 'cpu' },
    ]);
    expect(state.score).toEqual({ player: 0, cpu: 1 });
    expect(state.phase).toBe('serving');
    expect(state.serveTimerMs).toBeGreaterThan(0);
  });

  it('gives the point to the player when the ball passes the computer', () => {
    const start = rally({ x: COURT_WIDTH - 60, y: 20, vx: BALL_SPEED, vy: 0 });
    const { state, events } = advance(start, 30);

    expect(kinds(events)).toEqual(['out-of-play', 'point-scored']);
    expect(state.score).toEqual({ player: 1, cpu: 0 });
  });

  it('ends the game at the winning score', () => {
    const start = rally(
      { x: COURT_WIDTH - 60, y: 20, vx: BALL_SPEED, vy: 0 },
      { score: { player: WINNING_SCORE - 1, cpu: 3 } },
    );
    const { state, events } = advance(start, 30);

    expect(kinds(events)).toEqual(['out-of-play', 'point-scored', 'game-over']);
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBe('player');
  });
});

describe('serving', () => {
  it('holds the ball still until the pause is over, then serves', () => {
    let state = rally({}, { phase: 'serving', serveTimerMs: 2 * TICK_MS });

    state = step(state, TICK_MS, NO_INPUT).state;
    expect(state.phase).toBe('serving');
    expect(state.ball.vx).toBe(0);

    state = step(state, TICK_MS, NO_INPUT).state;
    state = step(state, TICK_MS, NO_INPUT).state;
    expect(state.phase).toBe('rally');
    expect(speed(state.ball)).toBeCloseTo(BALL_SPEED);
  });

  it('serves the same ball from the same seed', () => {
    const serving = (seed: number): GameState => ({
      ...createState(seed),
      phase: 'serving',
      serveTimerMs: 0,
    });
    const first = step(serving(1), TICK_MS, NO_INPUT).state;
    const again = step(serving(1), TICK_MS, NO_INPUT).state;
    const other = step(serving(2), TICK_MS, NO_INPUT).state;

    expect(again.ball).toEqual(first.ball);
    expect(other.ball).not.toEqual(first.ball);
  });
});

describe('idle', () => {
  it('does nothing at all before the game starts', () => {
    const start = createState(1);
    const { state, events } = step(start, TICK_MS, { up: true, down: false });

    expect(state).toBe(start);
    expect(events).toEqual([]);
  });
});
