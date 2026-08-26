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

function mix(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

/**
 * The court partway between two ticks, for drawing.
 *
 * Ticks are 8.33 ms and frames are about 16.7 ms, so a frame covers one tick
 * sometimes and two others: drawing the last tick outright makes everything on
 * the court travel a short step then a long one, which is the juddering a
 * player sees. Drawing `alpha` of the way from the tick before last to the last
 * one puts everything where it was at the instant the frame is for, and the
 * same distance passes under it every frame.
 *
 * Nothing here touches the simulation — both states have already happened, and
 * a rally plays out identically whether or not anyone looks at it.
 */
export function interpolate(
  previous: GameState,
  current: GameState,
  alpha: number,
): GameState {
  if (previous.phase !== current.phase) {
    // A phase change is a cut, not a movement: the ball is picked up off the
    // court and put back on the centre spot. Blending across that would draw
    // it streaking back up the court on the frame a point is scored.
    return current;
  }
  return {
    ...current,
    ball: {
      ...current.ball,
      x: mix(previous.ball.x, current.ball.x, alpha),
      y: mix(previous.ball.y, current.ball.y, alpha),
    },
    playerY: mix(previous.playerY, current.playerY, alpha),
    cpuY: mix(previous.cpuY, current.cpuY, alpha),
  };
}

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
