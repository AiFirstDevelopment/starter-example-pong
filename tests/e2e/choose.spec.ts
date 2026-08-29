import { expect, test } from '@playwright/test';

import {
  courtImage,
  installClock,
  recordSound,
  runFrames,
  score,
  sounds,
} from './support/pong';
import { freshTableId, installSocketShim, socketAttempts, statusOf } from './support/table';

/**
 * The choice at the door, and the promise that came with it: single player is
 * still the game it was, and it does not need the table server to exist.
 */

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
});

test('AC1: the page offers both games and starts neither on its own', async ({ page }) => {
  await page.goto('/');

  const chooser = page.locator('#choose');
  await expect(chooser).toBeVisible();
  await expect(page.locator('#play-single')).toBeVisible();
  await expect(page.locator('#table-id')).toBeVisible();
  await expect(page.locator('#play-table')).toBeVisible();
  await expect(page.locator('#status')).toHaveText(
    'Choose single player, create a table, or join one by its id',
  );

  // Neither game is entered by default. A key press, a click on the court —
  // everything that starts the one-player game once it has been chosen — leaves
  // the court exactly as it was drawn.
  const still = await courtImage(page);
  await page.keyboard.press('Space');
  await page.mouse.click(400, 200);
  await runFrames(page, 120);

  expect(await courtImage(page)).toBe(still);
  expect(await sounds(page)).toEqual([]);
  expect(await score(page)).toEqual({ player: '0', cpu: '0' });
});

test('AC1: choosing single player starts the game the page has always played', async ({
  page,
}) => {
  await page.goto('/?');

  await page.locator('#play-single').click();

  await expect(page.locator('#choose')).toBeHidden();
  await expect(page.locator('#status')).toHaveText('Press any key to start');

  await page.keyboard.press('Space');
  await runFrames(page, 40);

  // Serving and rallying, with the computer still on the other paddle.
  await expect(page.locator('#cpu-label')).toHaveText('Computer');
  const moving = await courtImage(page);
  await runFrames(page, 10);
  expect(await courtImage(page)).not.toBe(moving);
});

test('AC1: typing a table id joins that table instead', async ({ page }) => {
  const table = freshTableId('chooser');
  await page.goto('/');

  await page.locator('#table-id').fill(table);
  await page.locator('#play-table').click();

  await expect(page.locator('#choose')).toBeHidden();
  // The clock is frozen, so this is what the page says before any answer can
  // come back: it has left the one-player game behind and gone to the table.
  await expect
    .poll(() => statusOf(page))
    .toContain(`table ${table}`);
});

test('AC1: an empty table id is not a table, and does not start anything', async ({ page }) => {
  await page.goto('/');

  await page.locator('#play-table').click();

  await expect(page.locator('#choose')).toBeVisible();
  await expect(page.locator('#status')).toHaveText(
    'Choose single player, create a table, or join one by its id',
  );
});

test('AC9: single player plays to a point with the table server unreachable', async ({
  page,
}) => {
  // Every socket the page could open is refused before it leaves the browser.
  await installSocketShim(page, { blockSockets: true });
  await page.goto('/');

  await expect(page.locator('#choose')).toBeVisible();
  await page.locator('#play-single').click();
  await page.keyboard.press('Space');

  // The clock is frozen at a fixed instant, so the seed this page takes from it
  // is the same on every run and so is the rally that follows.
  for (let chunk = 0; chunk < 30; chunk += 1) {
    const running = await score(page);
    if (running.cpu !== '0' || running.player !== '0') {
      break;
    }
    await runFrames(page, 60);
  }

  const scored = await score(page);
  expect(Number(scored.player) + Number(scored.cpu)).toBeGreaterThan(0);
  expect((await sounds(page)).length).toBeGreaterThan(0);

  // And it never asked the table server for anything: single player is not
  // merely tolerant of a missing server, it does not have one.
  expect(await socketAttempts(page)).toBe(0);
});
