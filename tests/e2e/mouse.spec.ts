import { expect, test, type Browser } from '@playwright/test';

import {
  courtBox,
  courtImage,
  installClock,
  paddleAt,
  recordFrames,
  recordSound,
  runFrames,
  sounds,
  type Box,
  type Span,
} from './support/pong';

/** The court's own coordinates, which the canvas is only rarely displayed at. */
const COURT_HEIGHT = 480;
const AGAINST_THE_TOP = { top: 0, bottom: 79 };
const AGAINST_THE_BOTTOM = { top: 400, bottom: 479 };

/**
 * Where the middle of the paddle was drawn.
 *
 * A paddle at a whole number of pixels lights eighty rows and one part way
 * between two lights seventy-nine bright ones and two faint, so the middle of
 * what came back is a truer reading than `top` plus half a paddle.
 */
function centreOf(span: Span): number {
  return (span.top + span.bottom + 1) / 2;
}

/**
 * A viewport y a fraction of the way down the canvas, as a whole number: the
 * browser delivers mouse events on whole pixels, and a test that asks for half
 * of one is asking about a position the page never sees.
 */
function downCourt(box: Box, fraction: number): number {
  return Math.round(box.top + box.height * fraction);
}

/** Where that viewport y is on the court, scaled through the canvas's box. */
function courtYOf(box: Box, clientY: number): number {
  return ((clientY - box.top) * COURT_HEIGHT) / box.height;
}

/** How far the paddle ended up from where the pointer was asking for it. */
function missedBy(span: Span, box: Box, clientY: number): number {
  return Math.abs(centreOf(span) - courtYOf(box, clientY));
}

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
});

test('AC1: the paddle centres itself on the pointer and keeps tracking it', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);

  for (const fraction of [0.25, 0.5, 0.75, 0.35]) {
    const clientY = downCourt(box, fraction);
    await page.mouse.move(box.left + 100, clientY);
    await runFrames(page, 2);

    expect(missedBy(await paddleAt(page, 'player'), box, clientY)).toBeLessThanOrEqual(1);
  }
});

test('AC1: the computer keeps its own paddle', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);

  const before = await paddleAt(page, 'cpu');

  // The player's paddle is thrown the length of the court and back inside six
  // frames. The computer's chases the ball at 160 px/s, so six frames buys it
  // sixteen pixels however hard the pointer is yanked about.
  await page.mouse.move(box.left + 100, downCourt(box, 0));
  await runFrames(page, 3);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);

  await page.mouse.move(box.left + 100, downCourt(box, 1));
  await runFrames(page, 3);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_BOTTOM);

  const after = await paddleAt(page, 'cpu');
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(20);
});

test('AC2: the pointer still drives the paddle once it has left the court', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('no viewport to point at');
  }

  // Off to the left of the canvas entirely, level with a quarter down the court.
  const level = downCourt(box, 0.25);
  await page.mouse.move(5, level);
  await runFrames(page, 2);
  expect(missedBy(await paddleAt(page, 'player'), box, level)).toBeLessThanOrEqual(1);

  // Above the top of the court: the paddle rests against the top edge rather
  // than being stranded a quarter of the way down where the pointer left it.
  await page.mouse.move(5, 2);
  await runFrames(page, 2);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);

  // Below the bottom of it, and back above: it never leaves the court either way.
  await page.mouse.move(viewport.width - 5, viewport.height - 2);
  await runFrames(page, 2);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_BOTTOM);

  await page.mouse.move(viewport.width - 5, 0);
  await runFrames(page, 2);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);
});

test('AC3: the paddle lands under the pointer on a court the window has scaled', async ({
  page,
}) => {
  // Narrow enough that the canvas is nothing like its intrinsic 800 x 480.
  await page.setViewportSize({ width: 520, height: 900 });
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);

  const box = await courtBox(page);
  expect(box.height).toBeLessThan(COURT_HEIGHT * 0.75);

  const clientY = downCourt(box, 0.6);
  await page.mouse.move(box.left + 20, clientY);
  await runFrames(page, 2);
  const span = await paddleAt(page, 'player');

  expect(missedBy(span, box, clientY)).toBeLessThanOrEqual(1);
  // And it is not simply the distance down the canvas: on a court this size
  // that answer is most of the court away from the right one, which is the
  // whole reason the pointer is read through the canvas's box.
  expect(Math.abs(centreOf(span) - (clientY - box.top))).toBeGreaterThan(50);
});

test('AC4: mouse and keys share the paddle, and the more recent of them wins', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);

  await page.mouse.move(box.left + 100, downCourt(box, 0.25));
  await runFrames(page, 2);
  const fromMouse = await paddleAt(page, 'player');

  // A movement key takes the paddle back, and moves it at its own 420 px/s
  // rather than jumping it anywhere: ten frames is about 67 px of court.
  await page.keyboard.down('ArrowDown');
  await runFrames(page, 10);
  const moved = await paddleAt(page, 'player');
  expect(moved.top - fromMouse.top).toBeGreaterThan(50);
  expect(moved.top - fromMouse.top).toBeLessThan(85);

  // The mouse has not moved a pixel in all this, and does not fight the key.
  await runFrames(page, 10);
  const movedMore = await paddleAt(page, 'player');
  expect(movedMore.top - moved.top).toBeGreaterThan(50);

  // Moving the mouse takes it back, with the key still held down.
  const reclaimed = downCourt(box, 0.1);
  await page.mouse.move(box.left + 100, reclaimed);
  await runFrames(page, 2);
  const back = await paddleAt(page, 'player');
  expect(missedBy(back, box, reclaimed)).toBeLessThanOrEqual(1);

  // And keeps it: the key is still down, and twenty frames of it move nothing.
  await runFrames(page, 20);
  expect(await paddleAt(page, 'player')).toEqual(back);
  await page.keyboard.up('ArrowDown');
});

test('AC6: a click starts the game and unlocks the sound; moving the mouse does neither', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  const box = await courtBox(page);
  const status = page.locator('#status');
  const pointAt = downCourt(box, 0.25);

  const still = await courtImage(page);
  await page.mouse.move(box.left + 100, pointAt);
  await runFrames(page, 30);

  await expect(status).toHaveText('Press any key to start');
  expect(await sounds(page)).toEqual([]);
  expect(await courtImage(page)).toBe(still);

  await page.mouse.click(box.left + 100, pointAt);
  await expect(status).toHaveText('');

  // Played on, and heard: a sound only reaches the destination if the click
  // was the gesture the audio context was started from.
  await runFrames(page, 120);
  const played = await sounds(page);
  expect(played.length).toBeGreaterThan(0);
  expect(played[0].connectedToDestination).toBe(true);

  // And the paddle is under the pointer, so the game is playable from here.
  expect(missedBy(await paddleAt(page, 'player'), box, pointAt)).toBeLessThanOrEqual(1);
});

/** Play the same scripted rally — mouse, click and key alike — at a seed. */
async function drive(browser: Browser, seed: number): Promise<unknown> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installClock(page);
  await recordSound(page);
  await page.goto(`/?seed=${seed}`);

  const box = await courtBox(page);
  await page.mouse.click(box.left + 100, downCourt(box, 0.4));

  const trail = [...(await recordFrames(page, 30))];
  await page.mouse.move(box.left + 100, downCourt(box, 0.7));
  trail.push(...(await recordFrames(page, 30)));
  await page.keyboard.down('ArrowUp');
  trail.push(...(await recordFrames(page, 30)));
  await page.keyboard.up('ArrowUp');
  await page.mouse.move(box.left + 100, downCourt(box, 0.2));
  trail.push(...(await recordFrames(page, 30)));

  const played = await sounds(page);
  await context.close();
  return {
    ball: trail.map((entry) => entry.ball),
    player: trail.map((entry) => entry.player),
    cpu: trail.map((entry) => entry.cpu),
    played,
  };
}

test('AC7: the same seed driven the same way, mouse included, plays out identically', async ({
  browser,
}) => {
  const first = await drive(browser, 1);
  const again = await drive(browser, 1);
  const other = await drive(browser, 9);

  expect(again).toEqual(first);
  expect(other).not.toEqual(first);
});
