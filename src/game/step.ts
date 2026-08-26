/**
 * One tick of the simulation.
 *
 * `step` is pure: same state in, same state out, no clock and no globals. It
 * reports what happened this tick as a list of events, and the caller decides
 * what to do about them — play a sound, update the score in the DOM. That is
 * what lets the collision rules be tested directly.
 */

import { cpuTargetY, cpuVelocity } from './cpu';
import {
  BALL_RADIUS,
  BALL_SPEED,
  COURT_HEIGHT,
  COURT_WIDTH,
  CPU_X,
  MAX_BOUNCE_ANGLE,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_WIDTH,
  PLAYER_X,
  WINNING_SCORE,
  beginServe,
  serve,
  type Ball,
  type GameState,
  type Side,
} from './state';

export interface Input {
  up: boolean;
  down: boolean;
}

export type GameEvent =
  | { kind: 'paddle-hit'; side: Side }
  | { kind: 'wall-hit'; edge: 'top' | 'bottom' }
  /** The ball left the court past `side`'s paddle. */
  | { kind: 'out-of-play'; side: Side }
  | { kind: 'point-scored'; side: Side }
  | { kind: 'game-over'; winner: Side };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

export const NO_INPUT: Input = { up: false, down: false };

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function clampPaddle(y: number): number {
  return clamp(y, 0, COURT_HEIGHT - PADDLE_HEIGHT);
}

function paddleCentre(y: number): number {
  return y + PADDLE_HEIGHT / 2;
}

/**
 * A bounce off a paddle leaves at an angle set by where it struck: dead centre
 * comes straight back, the edges send it away steeply. Speed is unchanged.
 */
function bounceOffPaddle(ball: Ball, paddleY: number, towards: 1 | -1): Ball {
  const offset = clamp((ball.y - paddleCentre(paddleY)) / (PADDLE_HEIGHT / 2), -1, 1);
  const angle = offset * MAX_BOUNCE_ANGLE;
  return {
    x:
      towards === 1
        ? PLAYER_X + PADDLE_WIDTH + BALL_RADIUS
        : CPU_X - BALL_RADIUS,
    y: ball.y,
    vx: towards * BALL_SPEED * Math.cos(angle),
    vy: BALL_SPEED * Math.sin(angle),
  };
}

function overlapsPaddle(ball: Ball, paddleY: number): boolean {
  return (
    ball.y + BALL_RADIUS >= paddleY && ball.y - BALL_RADIUS <= paddleY + PADDLE_HEIGHT
  );
}

export function step(state: GameState, dtMs: number, input: Input): StepResult {
  const events: GameEvent[] = [];
  if (state.phase === 'idle' || state.phase === 'game-over') {
    return { state, events };
  }

  const dt = dtMs / 1000;
  const next: GameState = { ...state, ball: { ...state.ball }, score: { ...state.score } };

  // Both paddles move, whether the ball is in play or waiting to be served.
  const playerDirection = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  next.playerY = clampPaddle(next.playerY + playerDirection * PADDLE_SPEED * dt);
  const cpuDelta = cpuVelocity(paddleCentre(next.cpuY), cpuTargetY(next.ball)) * dt;
  next.cpuY = clampPaddle(next.cpuY + cpuDelta);

  if (next.phase === 'serving') {
    next.serveTimerMs -= dtMs;
    return { state: next.serveTimerMs <= 0 ? serve(next) : next, events };
  }

  next.ball.x += next.ball.vx * dt;
  next.ball.y += next.ball.vy * dt;

  if (next.ball.y - BALL_RADIUS <= 0 && next.ball.vy < 0) {
    next.ball.y = BALL_RADIUS;
    next.ball.vy = -next.ball.vy;
    events.push({ kind: 'wall-hit', edge: 'top' });
  } else if (next.ball.y + BALL_RADIUS >= COURT_HEIGHT && next.ball.vy > 0) {
    next.ball.y = COURT_HEIGHT - BALL_RADIUS;
    next.ball.vy = -next.ball.vy;
    events.push({ kind: 'wall-hit', edge: 'bottom' });
  }

  const hitPlayer =
    next.ball.vx < 0 &&
    next.ball.x - BALL_RADIUS <= PLAYER_X + PADDLE_WIDTH &&
    next.ball.x + BALL_RADIUS >= PLAYER_X &&
    overlapsPaddle(next.ball, next.playerY);
  const hitCpu =
    next.ball.vx > 0 &&
    next.ball.x + BALL_RADIUS >= CPU_X &&
    next.ball.x - BALL_RADIUS <= CPU_X + PADDLE_WIDTH &&
    overlapsPaddle(next.ball, next.cpuY);

  if (hitPlayer) {
    next.ball = bounceOffPaddle(next.ball, next.playerY, 1);
    events.push({ kind: 'paddle-hit', side: 'player' });
  } else if (hitCpu) {
    next.ball = bounceOffPaddle(next.ball, next.cpuY, -1);
    events.push({ kind: 'paddle-hit', side: 'cpu' });
  } else {
    const missedBy: Side | null =
      next.ball.x + BALL_RADIUS < 0
        ? 'player'
        : next.ball.x - BALL_RADIUS > COURT_WIDTH
          ? 'cpu'
          : null;
    if (missedBy !== null) {
      const scorer: Side = missedBy === 'player' ? 'cpu' : 'player';
      next.score[scorer] += 1;
      events.push({ kind: 'out-of-play', side: missedBy });
      events.push({ kind: 'point-scored', side: scorer });

      if (next.score[scorer] >= WINNING_SCORE) {
        next.phase = 'game-over';
        next.winner = scorer;
        next.ball = { x: COURT_WIDTH / 2, y: COURT_HEIGHT / 2, vx: 0, vy: 0 };
        events.push({ kind: 'game-over', winner: scorer });
      } else {
        return { state: beginServe(next), events };
      }
    }
  }

  return { state: next, events };
}
