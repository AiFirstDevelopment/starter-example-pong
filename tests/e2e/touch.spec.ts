import { expect, test, type Browser, type Page } from '@playwright/test';

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
  //
  // `pinch-zoom` rather than the `none` this criterion was written with. The
  // `landscape-phone-layout` work item supersedes that half of it on purpose:
  // `pinch-zoom` withholds the same one-finger pan — every drag test in this
  // file goes on passing unchanged, which is what shows it costs nothing — and
  // gives two-finger zoom back to the browser so a small court can be
  // magnified. The expectation is relaxed, not weakened: a court left as `auto`
  // still fails here.
  expect(await computedStyle(page, '#court', 'touch-action')).toBe('pinch-zoom');

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

  // The premise, asserted rather than assumed. Chromium delivers the first move
  // and then rules the gesture a scroll and sends `pointercancel`, after which
  // nothing further arrives — so everything above rests on that one delivered
  // move. Were the cancel ever to come first instead, this test would be
  // asserting that a paddle no gesture ever reached did not move: it would stay
  // green with `drivesPaddle` letting every pointer through, and AC5 would be
  // left uncovered with nothing to show for it.
  expect((await hand.seen()).touchMoves).toBeGreaterThan(0);

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

/*
 * The `landscape-phone-layout` work item, whose own criteria are numbered from
 * one again. Its tests are titled `landscape ACn` so they cannot be read as
 * the criteria above, which belong to `mobile-touch-controls`.
 */

/** The shape the court is drawn at, whatever size the page gives it. */
const COURT_ASPECT = 800 / COURT_HEIGHT;

/** How far the page runs past the bottom of the screen, AC1's own measure. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

/**
 * How far the page's content runs past the bottom of the screen.
 *
 * The screen is not always as tall as the page's idea of it: under Chrome's
 * phone emulation the layout viewport can be the taller of the two — at an
 * iPhone SE, `innerHeight` reads 618 while the document's `clientHeight` and
 * the visual viewport both read 568 — and everything laid out in that 50 px
 * band is drawn, unreachable and unscrollable, which is the exact condition
 * this work item exists to close. So the smaller of the two is the screen.
 *
 * `overflow` above is the measure AC1 is written in, and it cannot see this:
 * `documentElement.scrollHeight` is floored at the layout viewport, so at an
 * iPhone SE it reads 618 whatever the page holds. This measures the content.
 */
async function belowTheScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    const content = Math.max(
      document.body.scrollHeight,
      document.body.getBoundingClientRect().bottom + window.scrollY,
    );
    const screen = Math.min(
      window.innerHeight,
      document.documentElement.clientHeight,
    );
    return Math.max(content - screen, 0);
  });
}

/** How far outside the screen an element's box is, on either edge. */
async function belowTheFold(page: Page, selector: string): Promise<number> {
  return page.evaluate((selector: string) => {
    const element = document.querySelector(selector);
    if (element === null) {
      throw new Error(`nothing on the page matches ${selector}`);
    }
    const rect = element.getBoundingClientRect();
    const screen = Math.min(
      window.innerHeight,
      document.documentElement.clientHeight,
    );
    return Math.max(rect.bottom - screen, -rect.top, 0);
  }, selector);
}

test.describe('a phone held sideways', () => {
  // A viewport override rather than a project of its own: `hasTouch` comes from
  // `mobile-chrome`, and reshaping the viewport inside it keeps the finger.
  // A Pixel 5 turned on its side, with the browser's own chrome taken off.
  test.use({ viewport: { width: 802, height: 293 } });

  test('landscape AC1: the whole page fits the screen', async ({ page }) => {
    await page.goto('/?seed=1');

    // The premise: a screen short enough for the landscape layout to be the
    // one under test. Without this the assertion below would pass on any tall
    // viewport that happened to fit, and say nothing about a phone on its side.
    expect(await page.evaluate(() => window.innerHeight)).toBeLessThanOrEqual(480);

    // 448 px of it hung below the screen before this work item.
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // And the content itself is on the glass, not merely inside a layout
    // viewport that may be taller than the screen.
    expect(await belowTheScreen(page)).toBe(0);
  });

  test('landscape AC2: the score, the status and the mute button are all on screen', async ({
    page,
  }) => {
    await page.goto('/?seed=1');

    // The mute button was the worst of it — stranded at page y 633 in a 293 px
    // viewport, with no way to scroll down to it.
    for (const selector of ['.scoreboard', '#player-score', '#cpu-score', '#status', '#mute']) {
      // Drawn, and then drawn on screen. A hidden element's rect is all zeroes,
      // which reads as "not below the fold" — so without this, winning back
      // vertical space by hiding the mute button would leave AC2 green and the
      // player in landscape with no way to silence the game.
      await expect(page.locator(selector)).toBeVisible();
      expect(await belowTheFold(page, selector)).toBe(0);
    }
  });

  test('landscape: how to play is still announced when there is no room to print it', async ({
    page,
  }) => {
    await page.goto('/?seed=1');

    // Clipped out of the layout: a pixel, not the four lines of prose there is
    // no room for above a court this small.
    const hint = await page.locator('.hint').boundingBox();
    expect(hint?.height ?? 0).toBeLessThan(4);

    // And still in the accessibility tree. `display: none` would take it out of
    // both at once, and it is the only place the game says a tap starts it and
    // a drag moves the paddle — so a screen-reader user on a phone held
    // sideways would be left with "Press any key to start" and no keys to
    // press. The status line is not a substitute: it says exactly that.
    const announced = await page.locator('body').ariaSnapshot();
    expect(announced).toContain('Tap or click the court');
    expect(announced).toContain('Drag the court');
  });

  test('landscape AC3: the court is drawn in proportion, not stretched to fit', async ({
    page,
  }) => {
    await page.goto('/?seed=1');
    const court = await courtBox(page);

    // Capping the height and leaving the width alone gives about 2.7 here — a
    // court stretched flat, because a canvas paints its bitmap across whatever
    // box CSS hands it. The tolerance is the criterion's own 0.02, which is far
    // wider than the pixel of border that keeps the measured ratio off 1.667.
    expect(Math.abs(court.width / court.height - COURT_ASPECT)).toBeLessThanOrEqual(0.02);

    // And it really has been squeezed. Left alone the court is drawn 463 tall
    // in a 293 px screen, in proportion and mostly off the bottom — which would
    // satisfy the ratio above for entirely the wrong reason.
    expect(court.height).toBeLessThan(COURT_HEIGHT / 2);

    // AC3 says "at every viewport tested", and this one screen is the single
    // place the sizing cannot go wrong. Letting the canvas grow into the column
    // instead of only shrinking gives an identical court here and a court
    // standing on end elsewhere — 0.79 at 300x460, 0.80 at 320x480 — so a ratio
    // checked only at 802x293 says nothing about the rule that produced it.
    for (const viewport of [
      { width: 300, height: 460 },
      { width: 320, height: 480 },
      { width: 851, height: 393 },
      { width: 667, height: 375 },
      { width: 1200, height: 200 },
    ]) {
      await page.setViewportSize(viewport);
      const elsewhere = await courtBox(page);

      expect(
        Math.abs(elsewhere.width / elsewhere.height - COURT_ASPECT),
        `${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(0.02);
    }
  });

  test('landscape AC4: there is no scroll range to be trapped in', async ({ page }) => {
    await page.goto('/?seed=1');

    // Not a gesture that escapes a scroll range: with the page fitting there is
    // no range to escape, and a drag that found the page unmoved would pass
    // whether or not anything here worked. This asks the page to scroll by the
    // whole height of the old overflow, in the one way that cannot be refused,
    // and finds there is nowhere for it to go.
    await page.evaluate(() => window.scrollTo(0, 500));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('landscape AC8: the paddle still lands under the finger on the smaller court', async ({
    page,
  }) => {
    await page.goto('/?seed=1');
    await page.keyboard.press('Space');
    await runFrames(page, 3);

    const box = await courtBox(page);
    // Smaller again than the 217 px the same phone draws it at upright, so the
    // finger is being read through a box that has moved as well as shrunk.
    expect(box.height).toBeLessThan(217);

    const x = acrossCourt(box);
    const hand = await finger(page);
    await hand.down({ x, y: downCourt(box, 0.2) });

    for (const fraction of [0.75, 0.4, 0.9]) {
      const clientY = downCourt(box, fraction);
      await hand.moveTo({ x, y: clientY });
      await runFrames(page, 2);

      expect(missedBy(await paddleAt(page, 'player'), box, clientY)).toBeLessThanOrEqual(1);
    }

    await hand.up();
  });
});

/*
 * And the phone the right way up, which was never the problem: the landscape
 * rules are keyed on height alone, so a portrait phone does not match them at
 * all. Asserted rather than assumed, because a media query written against the
 * wrong axis would quietly reshape the layout that already worked.
 */

/** The court, to the pixel, on a phone the landscape rules must not touch. */
async function expectPortraitIsUntouched(
  page: Page,
  court: { width: number; height: number },
): Promise<void> {
  await page.goto('/?seed=1');

  // The hint is the visible half of the compaction: still laid out across the
  // column means the landscape rules did not apply, so the sizes below are the
  // ones they leave alone rather than ones they happen to agree with. Its full
  // width and not merely its presence, because in landscape it is clipped to a
  // pixel rather than removed — still in the page, and still not shown.
  await expect(page.locator('.hint')).toBeVisible();
  const hint = await page.locator('.hint').boundingBox();
  expect(hint?.width ?? 0).toBeGreaterThan(100);

  const rendered = await courtBox(page);
  expect(Math.round(rendered.width)).toBe(court.width);
  expect(Math.round(rendered.height)).toBe(court.height);

  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await belowTheScreen(page)).toBe(0);
}

test('landscape AC5: a Pixel 5 upright draws the court exactly as it did', async ({
  page,
}) => {
  await expectPortraitIsUntouched(page, { width: 361, height: 217 });
});

test.describe('a smaller phone upright', () => {
  // An iPhone SE's screen, kept in the phone project this spec runs in: the
  // finger comes from `mobile-chrome`, and only the shape of the screen changes.
  test.use({ viewport: { width: 320, height: 568 } });

  test('landscape AC5: an iPhone SE draws the court exactly as it did', async ({
    page,
  }) => {
    await expectPortraitIsUntouched(page, { width: 288, height: 174 });
  });
});
