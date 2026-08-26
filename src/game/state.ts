/**
 * The shape of a game and the moves between its phases.
 *
 * Everything here is a plain value: no DOM, no clock, no randomness beyond the
 * seeded generator state carried in `rngState`. `step()` turns one state into
 * the next, so a rally is a fold over states and can be replayed exactly.
 */

import { nextRandom } from './rng';

/** Court geometry and gameplay tuning. Distances are canvas pixels, speeds px/s. */
export const COURT_WIDTH = 800;
export const COURT_HEIGHT = 480;
export const PADDLE_WIDTH = 12;
export const PADDLE_HEIGHT = 80;
/** Gap between the court edge and the face of a paddle. */
export const PADDLE_INSET = 24;
export const PLAYER_X = PADDLE_INSET;
export const CPU_X = COURT_WIDTH - PADDLE_INSET - PADDLE_WIDTH;
export const PADDLE_SPEED = 420;
export const BALL_RADIUS = 7;
/** The ball keeps a constant speed; a bounce changes its direction only. */
export const BALL_SPEED = 380;
/** Steepest return, off the very edge of a paddle. */
export const MAX_BOUNCE_ANGLE = (50 * Math.PI) / 180;
/** Steepest serve. Shallower than a return so a serve is always returnable. */
export const MAX_SERVE_ANGLE = (20 * Math.PI) / 180;
/** The brief pause between a point and the next serve. */
export const SERVE_DELAY_MS = 800;
export const WINNING_SCORE = 11;

export type Phase = 'idle' | 'serving' | 'rally' | 'game-over';
export type Side = 'player' | 'cpu';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Score {
  player: number;
  cpu: number;
}

export interface GameState {
  phase: Phase;
  ball: Ball;
  /** Top edge of the player's paddle, on the left of the court. */
  playerY: number;
  /** Top edge of the computer's paddle, on the right of the court. */
  cpuY: number;
  score: Score;
  /** Milliseconds left of the pause before the next serve. */
  serveTimerMs: number;
  winner: Side | null;
  rngState: number;
}

const CENTRED_PADDLE_Y = (COURT_HEIGHT - PADDLE_HEIGHT) / 2;

function centredBall(): Ball {
  return { x: COURT_WIDTH / 2, y: COURT_HEIGHT / 2, vx: 0, vy: 0 };
}

/** A fresh, motionless court: nothing moves until the player starts the game. */
export function createState(seed: number): GameState {
  return {
    phase: 'idle',
    ball: centredBall(),
    playerY: CENTRED_PADDLE_Y,
    cpuY: CENTRED_PADDLE_Y,
    score: { player: 0, cpu: 0 },
    serveTimerMs: 0,
    winner: null,
    rngState: seed,
  };
}

/**
 * Start play from `idle` or `game-over`. A finished game starts over from
 * nothing: both scores back to zero, no winner. Any other phase is left alone,
 * so a stray key press mid-rally does nothing.
 */
export function startGame(state: GameState): GameState {
  if (state.phase !== 'idle' && state.phase !== 'game-over') {
    return state;
  }
  return {
    ...state,
    phase: 'serving',
    ball: centredBall(),
    score: { player: 0, cpu: 0 },
    serveTimerMs: 0,
    winner: null,
  };
}

/** Pause at the centre line, then serve again. */
export function beginServe(state: GameState): GameState {
  return {
    ...state,
    phase: 'serving',
    ball: centredBall(),
    serveTimerMs: SERVE_DELAY_MS,
  };
}

/**
 * Release the ball. Both the side it travels towards and its angle come from
 * the seeded generator, so the same seed serves the same ball every time.
 */
export function serve(state: GameState): GameState {
  const direction = nextRandom(state.rngState);
  const angle = nextRandom(direction.state);
  const towards = direction.value < 0.5 ? -1 : 1;
  const radians = (angle.value * 2 - 1) * MAX_SERVE_ANGLE;
  return {
    ...state,
    phase: 'rally',
    ball: {
      x: COURT_WIDTH / 2,
      y: COURT_HEIGHT / 2,
      vx: towards * BALL_SPEED * Math.cos(radians),
      vy: BALL_SPEED * Math.sin(radians),
    },
    serveTimerMs: 0,
    rngState: angle.state,
  };
}
