import { expect, test } from '@playwright/test';

import {
  ballAt,
  courtImage,
  installClock,
  recordFrames,
  recordSound,
  runFrames,
  score,
  sounds,
} from './support/pong';

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
});

test('AC7: a ball past the player scores for the computer, and the next ball is served after a pause', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');

  const samples = await recordFrames(page, 300);
  const scored = samples.findIndex((entry) => entry.cpuScore === '1');
  expect(scored).toBeGreaterThan(-1);
  expect(samples[scored].playerScore).toBe('0');
  expect(await score(page)).toEqual({ player: '0', cpu: '1' });

  // The ball ran off the player's edge, and is back at the centre spot.
  const lastSeen = samples.slice(0, scored).reverse().find((entry) => entry.ball !== null);
  expect(lastSeen?.ball?.x).toBeLessThan(30);
  expect(samples[scored].ball?.x).toBeGreaterThan(390);

  // It waits there a moment -- the best part of a second -- before the serve.
  const waiting = samples.slice(scored, scored + 45);
  expect(waiting).toHaveLength(45);
  for (const entry of waiting) {
    expect(Math.abs((entry.ball?.x ?? 0) - 400)).toBeLessThan(10);
  }
  expect(Math.abs((samples[scored + 70].ball?.x ?? 400) - 400)).toBeGreaterThan(50);
});

test('AC7: a ball past the computer scores for the player', async ({ page }) => {
  // A rally the seed plays out on its own: this one gets past the computer.
  await page.goto('/?seed=2');
  await page.keyboard.press('Space');

  const samples = await recordFrames(page, 900);
  const scored = samples.findIndex((entry) => entry.playerScore === '1');
  expect(scored).toBeGreaterThan(-1);

  const lastSeen = samples.slice(0, scored).reverse().find((entry) => entry.ball !== null);
  expect(lastSeen?.ball?.x).toBeGreaterThan(700);
  expect((await score(page)).player).toBe('1');
});

test('AC8: eleven points ends the game, and the next key press starts a fresh one', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');

  const status = page.locator('#status');
  for (let chunk = 0; chunk < 60; chunk += 1) {
    if (((await status.textContent()) ?? '').includes('wins')) {
      break;
    }
    await runFrames(page, 60);
  }

  await expect(status).toHaveText('Computer wins! Press any key to play again');
  expect(await score(page)).toEqual({ player: '0', cpu: '11' });

  // Play has stopped: nothing moves and nothing sounds.
  const court = await courtImage(page);
  const played = await sounds(page);
  await runFrames(page, 120);
  expect(await courtImage(page)).toBe(court);
  expect(await sounds(page)).toHaveLength(played.length);

  await page.keyboard.press('Space');
  expect(await score(page)).toEqual({ player: '0', cpu: '0' });
  await expect(status).toHaveText('');

  await runFrames(page, 60);
  const restarted = await ballAt(page);
  expect(Math.abs((restarted?.x ?? 400) - 400)).toBeGreaterThan(50);
});
