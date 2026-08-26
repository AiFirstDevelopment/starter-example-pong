import { expect, test } from '@playwright/test';

import {
  courtBox,
  frameOfSound,
  frameSteps,
  installClock,
  recordFrames,
  recordSound,
  runFrames,
  unevenness,
  type Point,
} from './support/pong';

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
});

/** How far the ball travelled from one frame to the next, frame by frame. */
function ballTravel(trail: (Point | null)[]): number[] {
  const travelled: number[] = [];
  for (let i = 1; i < trail.length; i += 1) {
    const from = trail[i - 1];
    const to = trail[i];
    if (from === null || to === null) {
      throw new Error(`the ball was off the court between frames ${i - 1} and ${i}`);
    }
    travelled.push(Math.hypot(to.x - from.x, to.y - from.y));
  }
  return travelled;
}

test('AC5: a held movement key moves the paddle the same distance every frame', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 5);
  await page.keyboard.down('ArrowDown');
  // Let the press land, then watch the glide -- and stop well short of the
  // bottom of the court, where the paddle would stop moving for a reason that
  // has nothing to do with smoothness.
  await runFrames(page, 3);
  const samples = await recordFrames(page, 22);
  await page.keyboard.up('ArrowDown');

  const steps = frameSteps(samples.map((entry) => entry.player.top));
  expect(Math.min(...steps)).toBeGreaterThan(0);
  expect(samples[samples.length - 1].player.top).toBeLessThan(390);

  // 420 px/s across a 16 ms frame is 6.72 px, which the canvas shows as six
  // pixels or seven. A loop that draws whichever tick it last got to instead
  // covers 3.5 px on some frames and 7 px on others, and that is the juddering
  // the player is complaining about.
  expect(unevenness(steps)).toBeLessThanOrEqual(1);
});

test('AC8: the ball and the computer paddle move evenly too', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  const samples = await recordFrames(page, 120);
  const hit = frameOfSound(samples, 1);
  expect(hit).toBeGreaterThan(-1);

  // The ball's run up to that strike: nothing touches it the whole way, so it
  // should cover the same ground every frame -- 380 px/s is 6.08 px a frame.
  const travelled = ballTravel(samples.slice(4, hit - 2).map((entry) => entry.ball));
  expect(travelled.length).toBeGreaterThan(30);
  expect(Math.min(...travelled)).toBeGreaterThan(4);
  expect(unevenness(travelled)).toBeLessThanOrEqual(1);

  // The computer's paddle on its way back to the middle of the court after the
  // strike, which is the stretch it runs at full speed: chasing the ball it
  // stops whenever it is close enough, and a deliberate stop is not a stutter.
  const returning = frameSteps(
    samples.slice(hit + 3, hit + 36).map((entry) => entry.cpu.top),
  );
  expect(Math.min(...returning)).toBeGreaterThan(0);
  expect(unevenness(returning)).toBeLessThanOrEqual(1);
});

test('AC8: the ball is not smeared across the court on the frame a point is scored', async ({
  page,
}) => {
  // This rally loses its first point early, and loses it on a frame that draws
  // a single tick -- the case where the tick before last still has the ball
  // running off the edge of the court and the last one has already put it back
  // on the centre spot. Half way between those two is half way up the court,
  // which is nowhere the ball has ever been.
  await page.goto('/?seed=7');
  await page.keyboard.press('Space');
  const samples = await recordFrames(page, 90);

  const scored = samples.findIndex((entry) => entry.cpuScore === '1');
  expect(scored).toBeGreaterThan(-1);
  // It ran off the player's edge on the way in.
  const lastSeen = samples
    .slice(0, scored)
    .reverse()
    .find((entry) => entry.ball !== null);
  expect(lastSeen?.ball?.x).toBeLessThan(30);
  // And is waiting on the centre spot, not caught in between.
  expect(Math.abs((samples[scored].ball?.x ?? 0) - 400)).toBeLessThan(10);
});

test('AC5: a held movement key stays even across a point and the serve after it', async ({
  page,
}) => {
  // This rally loses a point early enough to hold a key across it. The paddles
  // are not cut by a phase change the way the ball is -- nothing moves them but
  // their own motion -- so the glide has to carry straight through one.
  await page.goto('/?seed=9');
  await page.keyboard.press('Space');

  // Park the paddle near the top with the mouse, so the whole run below happens
  // in open court rather than against the bottom clamp.
  const box = await courtBox(page);
  await page.mouse.move(box.left + 100, Math.round(box.top + box.height * 0.08));
  await runFrames(page, 50);

  // Then hand it back to the key and watch it glide through the point.
  await page.keyboard.down('ArrowDown');
  await runFrames(page, 3);
  const samples = await recordFrames(page, 40);
  await page.keyboard.up('ArrowDown');

  const scored = samples.findIndex((entry) => entry.cpuScore === '1');
  expect(scored).toBeGreaterThan(4);
  expect(scored).toBeLessThan(samples.length - 4);

  const steps = frameSteps(samples.map((entry) => entry.player.top));
  expect(Math.min(...steps)).toBeGreaterThan(0);
  expect(samples[samples.length - 1].player.top).toBeLessThan(390);
  // Drawing the last tick outright on the frame the phase changes lends the
  // paddle most of a tick and takes it back on the next frame: 8.8 px then
  // 4.6 px, either side of the steady 6.72.
  expect(unevenness(steps)).toBeLessThanOrEqual(1);
});
