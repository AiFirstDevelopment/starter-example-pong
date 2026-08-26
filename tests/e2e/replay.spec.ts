import { expect, test, type Browser } from '@playwright/test';

import {
  installClock,
  recordFrames,
  recordSound,
  sounds,
  type RecordedSound,
  type Sample,
} from './support/pong';

/** Load the game at a seed and play the opening of the rally out. */
async function openingRally(
  browser: Browser,
  seed: number,
): Promise<{ played: RecordedSound[]; trail: (Sample['ball'])[] }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installClock(page);
  await recordSound(page);
  await page.goto(`/?seed=${seed}`);
  await page.keyboard.press('Space');

  const samples = await recordFrames(page, 120);
  const played = await sounds(page);
  await context.close();
  return { played, trail: samples.map((entry) => entry.ball) };
}

test('AC10: the same seed serves the same ball into the same first collision', async ({
  browser,
}) => {
  const first = await openingRally(browser, 1);
  const again = await openingRally(browser, 1);
  const other = await openingRally(browser, 9);

  expect(again.trail).toEqual(first.trail);
  expect(again.played).toEqual(first.played);
  expect(first.played).toHaveLength(1);

  expect(other.trail).not.toEqual(first.trail);
});
