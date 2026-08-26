import { expect, test, type Browser } from '@playwright/test';

import {
  TOUCH_DEVICE,
  computedStyle,
  courtBox,
  courtImage,
  finger,
  installClock,
  paddleAt,
  recordFrames,
  recordSound,
  runFrames,
  sounds,
  touchDrag,
  type Box,
  type Span,
} from './support/pong';

/** The court's own coordinates, which the phone never displays it at. */
const COURT_HEIGHT = 480;
const AGAINST_THE_TOP = { top: 0, bottom: 79 };
const AGAINST_THE_BOTTOM = { top: 400, bottom: 479 };

/**
 * The same readings `mouse.spec.ts` takes, kept here rather than shared: that
 * spec runs on a desktop with no touch and this one on a phone, and the two
 * describe different inputs. A shared helper would tie them together for the
 * sake of four lines of arithmetic.
 */
function centreOf(span: Span): number {
  return (span.top + span.bottom + 1) / 2;
}

/** A viewport y a whole number of pixels down the canvas. */
function downCourt(box: Box, fraction: number): number {
  return Math.round(box.top + box.height * fraction);
}

/** Where that viewport y is on the court, scaled through the canvas's box. */
function courtYOf(box: Box, clientY: number): number {
  return ((clientY - box.top) * COURT_HEIGHT) / box.height;
}

/** How far the paddle ended up from where the finger was asking for it. */
function missedBy(span: Span, box: Box, clientY: number): number {
  return Math.abs(centreOf(span) - courtYOf(box, clientY));
}

/** Somewhere across the court: the finger's x is nothing to the paddle. */
function acrossCourt(box: Box): number {
  return box.left + 100;
}

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
});

test('AC1: the paddle centres itself on the finger and keeps tracking it', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);
  const x = acrossCourt(box);

  const hand = await finger(page);
  await hand.down({ x, y: downCourt(box, 0.5) });

  for (const fraction of [0.25, 0.5, 0.75, 0.35]) {
    const clientY = downCourt(box, fraction);
    await hand.moveTo({ x, y: clientY });
    await runFrames(page, 2);

    expect(missedBy(await paddleAt(page, 'player'), box, clientY)).toBeLessThanOrEqual(1);
  }

  await hand.up();
});

test('AC1: the computer keeps its own paddle', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);
  const x = acrossCourt(box);

  const before = await paddleAt(page, 'cpu');

  // The player's paddle is thrown the length of the court and back inside six
  // frames. The computer's chases the ball at 160 px/s, so six frames buys it
  // sixteen pixels however hard the finger is dragged about.
  const hand = await finger(page);
  await hand.down({ x, y: downCourt(box, 0.5) });

  await hand.moveTo({ x, y: downCourt(box, 0) });
  await runFrames(page, 3);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);

  await hand.moveTo({ x, y: downCourt(box, 1) });
  await runFrames(page, 3);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_BOTTOM);
  await hand.up();

  const after = await paddleAt(page, 'cpu');
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(20);
});

test('AC2: a drag carried off the court leaves the paddle against its edge', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);
  const x = acrossCourt(box);
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('no viewport to touch');
  }

  const hand = await finger(page);
  await hand.down({ x, y: downCourt(box, 0.5) });

  const level = downCourt(box, 0.25);
  await hand.moveTo({ x, y: level });
  await runFrames(page, 2);
  expect(missedBy(await paddleAt(page, 'player'), box, level)).toBeLessThanOrEqual(1);

  // Carried above the top of the court, over the score and the title: the
  // paddle rests against the top edge rather than being stranded a quarter of
  // the way down where the finger crossed the boundary. The gesture began on
  // the court, so it still drives the paddle out here.
  await hand.moveTo({ x, y: 2 });
  await runFrames(page, 2);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);

  // Below the bottom of it, and back above: it never leaves the court either way.
  await hand.moveTo({ x, y: viewport.height - 2 });
  await runFrames(page, 2);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_BOTTOM);

  await hand.moveTo({ x, y: 0 });
  await runFrames(page, 2);
  expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);

  await hand.up();
});

test('AC3: the court is the game’s to drag, not the browser’s to pan', async ({
  page,
}) => {
  await page.goto('/?seed=1');

  // The computed declaration rather than an observed pan: the harness cannot
  // reproduce real touch panning in either direction, so an assertion that the
  // page did not move would pass whether or not this fix were here. This is
  // the contract the browser itself acts on, it fails without the fix, and the
  // panning it prevents is checked by hand on a device.
  expect(await computedStyle(page, '#court', 'touch-action')).toBe('none');

  for (const selector of ['html', 'body']) {
    expect(await computedStyle(page, selector, 'overscroll-behavior-x')).toBe('none');
    expect(await computedStyle(page, selector, 'overscroll-behavior-y')).toBe('none');
  }
});

test('AC4: the paddle lands under the finger on a court the phone has shrunk', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);

  const box = await courtBox(page);
  // The phone draws the court nothing like its intrinsic 480: about 217 px.
  expect(box.height).toBeLessThan(COURT_HEIGHT * 0.75);

  const clientY = downCourt(box, 0.6);
  const x = acrossCourt(box);
  const hand = await finger(page);
  await hand.down({ x, y: downCourt(box, 0.2) });
  await hand.moveTo({ x, y: clientY });
  await runFrames(page, 2);
  const span = await paddleAt(page, 'player');
  await hand.up();

  expect(missedBy(span, box, clientY)).toBeLessThanOrEqual(1);
  // And it is not simply the distance down the canvas: on a court this size
  // that answer is most of the court away from the right one, which is the
  // whole reason the finger is read through the canvas's box.
  expect(Math.abs(centreOf(span) - (clientY - box.top))).toBeGreaterThan(50);
});

test('AC5: a gesture that starts off the court is the page’s, not the paddle’s', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);

  const hint = await page.locator('.hint').boundingBox();
  if (hint === null) {
    throw new Error('the hint text is not on the page to drag from');
  }

  const before = await paddleAt(page, 'player');
  const hand = await finger(page);
  await hand.down({ x: hint.x + hint.width / 2, y: hint.y + hint.height / 2 });

  // Dragged the length of the court, which would throw the paddle end to end
  // if the game were listening to a gesture that started on the hint text.
  for (const fraction of [0.1, 0.9, 0.1]) {
    await hand.moveTo({ x: acrossCourt(box), y: downCourt(box, fraction) });
    await runFrames(page, 2);
    expect(await paddleAt(page, 'player')).toEqual(before);
  }

  await hand.up();

  // And the page is still the browser's to scroll, which is what keeps the
  // mute button reachable when the court does not fit the screen.
  expect(await computedStyle(page, '.hint', 'touch-action')).toBe('auto');
  expect(await computedStyle(page, 'body', 'touch-action')).toBe('auto');
});

test('AC6: a tap starts the game and unlocks the sound; a drag does neither', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  const box = await courtBox(page);
  const x = acrossCourt(box);
  const status = page.locator('#status');
  const draggedTo = downCourt(box, 0.6);

  const still = await courtImage(page);
  await touchDrag(page, { x, y: downCourt(box, 0.3) }, { x, y: draggedTo });
  await runFrames(page, 30);

  await expect(status).toHaveText('Press any key to start');
  expect(await sounds(page)).toEqual([]);
  expect(await courtImage(page)).toBe(still);

  await page.touchscreen.tap(x, downCourt(box, 0.3));
  await expect(status).toHaveText('');

  // Played on, and heard: a sound only reaches the destination if the tap was
  // the gesture the audio context was started from.
  await runFrames(page, 120);
  const played = await sounds(page);
  expect(played.length).toBeGreaterThan(0);
  expect(played[0].connectedToDestination).toBe(true);

  // And the paddle is where the finger left it rather than where the tap
  // landed, so the game carries on from where the player put it.
  expect(missedBy(await paddleAt(page, 'player'), box, draggedTo)).toBeLessThanOrEqual(1);
});

test('AC7: touch and keys share the paddle, and the more recent of them wins', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
  await runFrames(page, 3);
  const box = await courtBox(page);
  const x = acrossCourt(box);

  const hand = await finger(page);
  await hand.down({ x, y: downCourt(box, 0.5) });
  await hand.moveTo({ x, y: downCourt(box, 0.25) });
  await runFrames(page, 2);
  const fromTouch = await paddleAt(page, 'player');

  // A movement key takes the paddle back, and moves it at its own 420 px/s
  // rather than jumping it anywhere: ten frames is about 67 px of court.
  await page.keyboard.down('ArrowDown');
  await runFrames(page, 10);
  const moved = await paddleAt(page, 'player');
  expect(moved.top - fromTouch.top).toBeGreaterThan(50);
  expect(moved.top - fromTouch.top).toBeLessThan(85);

  // The finger has not moved a pixel in all this, and does not fight the key.
  await runFrames(page, 10);
  const movedMore = await paddleAt(page, 'player');
  expect(movedMore.top - moved.top).toBeGreaterThan(50);

  // Moving the finger takes it back, with the key still held down.
  const reclaimed = downCourt(box, 0.1);
  await hand.moveTo({ x, y: reclaimed });
  await runFrames(page, 2);
  const back = await paddleAt(page, 'player');
  expect(missedBy(back, box, reclaimed)).toBeLessThanOrEqual(1);

  // And keeps it: the key is still down, and twenty frames of it move nothing.
  await runFrames(page, 20);
  expect(await paddleAt(page, 'player')).toEqual(back);

  await page.keyboard.up('ArrowDown');
  await hand.up();
});

/** Play the same scripted rally — tap, drag and key alike — at a seed. */
async function drive(browser: Browser, seed: number): Promise<unknown> {
  // Its own context, so the rally starts from nothing — and the same phone the
  // project runs on, because a context without touch cannot be touched at all.
  const context = await browser.newContext({ ...TOUCH_DEVICE });
  const page = await context.newPage();
  await installClock(page);
  await recordSound(page);
  await page.goto(`/?seed=${seed}`);

  const box = await courtBox(page);
  const x = acrossCourt(box);
  await page.touchscreen.tap(x, downCourt(box, 0.4));

  const hand = await finger(page);
  const trail = [...(await recordFrames(page, 30))];
  await hand.down({ x, y: downCourt(box, 0.4) });
  await hand.moveTo({ x, y: downCourt(box, 0.7) });
  trail.push(...(await recordFrames(page, 30)));
  await page.keyboard.down('ArrowUp');
  trail.push(...(await recordFrames(page, 30)));
  await page.keyboard.up('ArrowUp');
  await hand.moveTo({ x, y: downCourt(box, 0.2) });
  trail.push(...(await recordFrames(page, 30)));
  await hand.up();

  const played = await sounds(page);
  await context.close();
  return {
    ball: trail.map((entry) => entry.ball),
    player: trail.map((entry) => entry.player),
    cpu: trail.map((entry) => entry.cpu),
    played,
  };
}

test('AC8: the same seed driven the same way, touch included, plays out identically', async ({
  browser,
}) => {
  const first = await drive(browser, 1);
  const again = await drive(browser, 1);
  const other = await drive(browser, 9);

  expect(again).toEqual(first);
  expect(other).not.toEqual(first);
});
