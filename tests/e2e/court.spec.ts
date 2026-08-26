import { expect, test } from '@playwright/test';

import {
  ballAt,
  courtImage,
  installClock,
  paddleAt,
  recordSound,
  runFrames,
  sounds,
} from './support/pong';

const CENTRED_PADDLE = { top: 200, bottom: 279 };

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
});

test('AC1: draws a still, silent court until the player starts', async ({ page }) => {
  await page.goto('/?seed=1');

  await expect(page.locator('#player-score')).toHaveText('0');
  await expect(page.locator('#cpu-score')).toHaveText('0');
  await expect(page.locator('#status')).toHaveText('Press any key to start');

  expect(await paddleAt(page, 'player')).toEqual(CENTRED_PADDLE);
  expect(await paddleAt(page, 'cpu')).toEqual(CENTRED_PADDLE);

  const ball = await ballAt(page);
  expect(ball).not.toBeNull();
  expect(ball?.x).toBeGreaterThan(390);
  expect(ball?.x).toBeLessThan(410);
  expect(ball?.y).toBeGreaterThan(230);
  expect(ball?.y).toBeLessThan(250);

  const court = await courtImage(page);
  await runFrames(page, 120);

  expect(await courtImage(page)).toBe(court);
  expect(await sounds(page)).toEqual([]);
});

test('AC2: serves on a key press, and the arrow keys drive the paddle to the edges and no further', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');

  await runFrames(page, 20);
  const served = await ballAt(page);
  expect(served?.x).toBeGreaterThan(420);

  await page.keyboard.down('ArrowUp');
  await runFrames(page, 20);
  expect((await paddleAt(page, 'player')).top).toBeLessThan(CENTRED_PADDLE.top);

  await runFrames(page, 200);
  expect(await paddleAt(page, 'player')).toEqual({ top: 0, bottom: 79 });
  await page.keyboard.up('ArrowUp');

  await page.keyboard.down('ArrowDown');
  await runFrames(page, 20);
  expect((await paddleAt(page, 'player')).top).toBeGreaterThan(0);

  await runFrames(page, 300);
  expect(await paddleAt(page, 'player')).toEqual({ top: 400, bottom: 479 });
  await page.keyboard.up('ArrowDown');
});

test('AC2: W and S drive the paddle as well', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 5);

  await page.keyboard.down('w');
  await runFrames(page, 30);
  const up = await paddleAt(page, 'player');
  await page.keyboard.up('w');
  expect(up.top).toBeLessThan(CENTRED_PADDLE.top);

  await page.keyboard.down('s');
  await runFrames(page, 30);
  const down = await paddleAt(page, 'player');
  await page.keyboard.up('s');
  expect(down.top).toBeGreaterThan(up.top);
});

test('AC2: a movement key let go after Shift does not stay stuck down', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 5);

  // WASD muscle memory: Shift goes down first and comes back up first, so the
  // browser names the same physical key `W` on the way down and `w` on the way
  // up -- the pair the page actually receives in that order.
  await page.keyboard.down('Shift');
  await page.keyboard.down('W');
  await runFrames(page, 30);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');

  // The court is drawn part way between two ticks, so the frame that renders
  // the release still finishes the last step of the glide -- up to a pixel of
  // it. One more frame settles the paddle on where the simulation has it; take
  // the baseline after that, so what follows is a like-for-like comparison.
  await runFrames(page, 2);
  const released = await paddleAt(page, 'player');
  expect(released.top).toBeLessThan(CENTRED_PADDLE.top);

  // Nothing is being held now, so the paddle stays where it was let go.
  await runFrames(page, 60);
  expect(await paddleAt(page, 'player')).toEqual(released);

  // And it still answers the other direction.
  await page.keyboard.down('ArrowDown');
  await runFrames(page, 30);
  await page.keyboard.up('ArrowDown');
  expect((await paddleAt(page, 'player')).top).toBeGreaterThan(released.top);
});

test('AC2: the key that starts the game does not scroll the court away', async ({
  page,
}) => {
  // Tall enough page, short enough window: the default action of Space would
  // scroll, and the score is only in the DOM -- the canvas never paints it.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/?seed=1');

  const scoreboard = page.locator('.scoreboard');
  await expect(scoreboard).toBeInViewport();

  await page.keyboard.press('Space');
  // The browser scrolls smoothly, so give it long enough to have moved.
  await page.waitForTimeout(600);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(scoreboard).toBeInViewport();
});
