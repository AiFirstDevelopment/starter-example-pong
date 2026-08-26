/**
 * The computer's paddle.
 *
 * It chases where the ball *is*, not where it will be, and only once the ball
 * is heading into its own half; the rest of the time it returns to the middle
 * of the court. That, with a top speed well below the ball's, is what leaves
 * the player a way to win: a return that bounces off a wall on its way over
 * pulls the paddle the wrong way first, and at this speed it cannot always
 * recover.
 */

import { COURT_HEIGHT, COURT_WIDTH, type Ball } from './state';

/** Well below the ball's 380 px/s, so a steep return can outrun it. */
export const CPU_SPEED = 160;
/** Close enough. Without it the paddle jitters either side of the ball. */
export const CPU_DEAD_ZONE = 10;

/** Where the computer wants its paddle centred, given what the ball is doing. */
export function cpuTargetY(ball: Ball): number {
  const incoming = ball.vx > 0 && ball.x > COURT_WIDTH / 2;
  return incoming ? ball.y : COURT_HEIGHT / 2;
}

/** The paddle's velocity this tick: full speed towards the target, or still. */
export function cpuVelocity(paddleCentreY: number, targetY: number): number {
  const delta = targetY - paddleCentreY;
  if (Math.abs(delta) <= CPU_DEAD_ZONE) {
    return 0;
  }
  return delta > 0 ? CPU_SPEED : -CPU_SPEED;
}
