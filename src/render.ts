/**
 * Draws the court. Reads the state, writes nothing.
 *
 * The score is deliberately not painted here — a canvas has no text for a
 * screen reader to announce, so the score lives in the DOM instead.
 */

import {
  BALL_RADIUS,
  COURT_HEIGHT,
  COURT_WIDTH,
  CPU_X,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PLAYER_X,
  type GameState,
} from './game/state';

const COURT_COLOUR = '#0b1020';
const NET_COLOUR = '#1e293b';
const PADDLE_COLOUR = '#f8fafc';
const BALL_COLOUR = '#ffd166';

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COURT_COLOUR;
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);

  ctx.fillStyle = NET_COLOUR;
  for (let y = 12; y < COURT_HEIGHT - 12; y += 32) {
    ctx.fillRect(COURT_WIDTH / 2 - 2, y, 4, 16);
  }

  ctx.fillStyle = PADDLE_COLOUR;
  ctx.fillRect(PLAYER_X, state.playerY, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.fillRect(CPU_X, state.cpuY, PADDLE_WIDTH, PADDLE_HEIGHT);

  ctx.fillStyle = BALL_COLOUR;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}
