/**
 * One tick of the simulation.
 *
 * `step` is pure: same state in, same state out, no clock and no globals. It
 * reports what happened this tick as a list of events, and the caller decides
 * what to do about them — play a sound, update the score in the DOM. That is
 * what lets the collision rules be tested directly.
 *
 * Both paddles take an input, but only the left one always has a human behind
 * it. The right-hand input is `Input | null`, and `null` means the computer
 * plays that side at its own speed — which is why the computer is not simply
 * handed an `Input`: a held key moves a paddle at `PADDLE_SPEED`, two and a half
 * times what `CPU_SPEED` allows, and the computer driven that way would be a
 * different opponent from the one single player already has.
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
  centredBall,
  serve,
  type Ball,
  type GameState,
  type Side,
} from './state';

export interface Input {
  up: boolean;
  down: boolean;
  /**
   * Where the player wants the centre of their paddle, in court pixels, or
   * `null` when they are driving it with the movement keys instead. It is an
   * absolute position rather than a direction because a mouse names a place,
   * not a way to go; out-of-court values are clamped like any other move.
   */
  targetY: number | null;
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

export const NO_INPUT: Input = { up: false, down: false, targetY: null };

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
 * Where a paddle a human is driving ends up after `dt` seconds.
 *
 * Exported because the networked client draws its own paddle from its own input
 * before the server has seen it, and the two agree only if they move the paddle
 * by the same rule. One rule, two callers.
 */
export function movePaddle(y: number, input: Input, dt: number): number {
  if (input.targetY === null) {
    const direction = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    return clampPaddle(y + direction * PADDLE_SPEED * dt);
  }
  // A named position is taken as given: the paddle goes there this tick rather
  // than travelling towards it at PADDLE_SPEED.
  return clampPaddle(input.targetY - PADDLE_HEIGHT / 2);
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

export function step(
  state: GameState,
  dtMs: number,
  left: Input,
  /** The right-hand paddle's input, or `null` to leave that side to the computer. */
  right: Input | null = null,
): StepResult {
  const events: GameEvent[] = [];
  if (state.phase === 'idle' || state.phase === 'game-over') {
    return { state, events };
  }

  const dt = dtMs / 1000;
  const next: GameState = { ...state, ball: { ...state.ball }, score: { ...state.score } };

  // Both paddles move, whether the ball is in play or waiting to be served.
  next.playerY = movePaddle(next.playerY, left, dt);
  if (right === null) {
    const cpuDelta = cpuVelocity(paddleCentre(next.cpuY), cpuTargetY(next.ball)) * dt;
    next.cpuY = clampPaddle(next.cpuY + cpuDelta);
  } else {
    next.cpuY = movePaddle(next.cpuY, right, dt);
  }

  if (next.phase === 'serving') {
    next.serveTimerMs -= dtMs;
    return { state: next.serveTimerMs <= 0 ? serve(next) : next, events };
  }

  next.ball.x += next.ball.vx * dt;
  next.ball.y += next.ball.vy * dt;

  let bouncedOffWall = false;
  if (next.ball.y - BALL_RADIUS <= 0 && next.ball.vy < 0) {
    next.ball.y = BALL_RADIUS;
    next.ball.vy = -next.ball.vy;
    events.push({ kind: 'wall-hit', edge: 'top' });
    bouncedOffWall = true;
  } else if (next.ball.y + BALL_RADIUS >= COURT_HEIGHT && next.ball.vy > 0) {
    next.ball.y = COURT_HEIGHT - BALL_RADIUS;
    next.ball.vy = -next.ball.vy;
    events.push({ kind: 'wall-hit', edge: 'bottom' });
    bouncedOffWall = true;
  }

  // One collision settles a tick, as the plan's flowchart has it. Falling
  // through to the paddle test would throw the reflection away — a paddle
  // bounce derives vy from the contact point alone, sending the ball straight
  // back into the wall it just left — and would sound a wall tone and a paddle
  // tone together, which AC4 rules out. Nothing is missed: the ball covers at
  // most 3.2 px a tick against a 26 px strike window, so a corner strike simply
  // lands on the next tick.
  if (bouncedOffWall) {
    return { state: next, events };
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
        next.ball = centredBall();
        events.push({ kind: 'game-over', winner: scorer });
      } else {
        return { state: beginServe(next), events };
      }
    }
  }

  return { state: next, events };
}
