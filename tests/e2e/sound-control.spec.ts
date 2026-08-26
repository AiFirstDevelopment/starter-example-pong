import { expect, test } from '@playwright/test';

import {
  installClock,
  paddleStrikes,
  recordFrames,
  recordSound,
  runFrames,
  score,
  sounds,
} from './support/pong';

test('AC9: muting silences all three events while the rally carries on', async ({
  page,
}) => {
  await installClock(page);
  await recordSound(page);
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');

  await runFrames(page, 80);
  expect(await sounds(page)).toHaveLength(1);

  await page.keyboard.press('m');
  const mute = page.locator('#mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toHaveText('Sound off');

  // Long enough for a wall bounce, a ball off the court, the next serve and
  // the strike that returns it -- all three events, none of them heard.
  const muted = await recordFrames(page, 260);
  expect(paddleStrikes(muted)).toBeGreaterThan(0);
  expect(await sounds(page)).toHaveLength(1);
  expect(await score(page)).toEqual({ player: '0', cpu: '1' });

  await page.keyboard.press('m');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toHaveText('Sound on');

  await runFrames(page, 220);
  expect((await sounds(page)).length).toBeGreaterThan(1);
});

test('AC9: the mute button shows which way it is set', async ({ page }) => {
  await recordSound(page);
  await page.goto('/?seed=1');

  const mute = page.locator('#mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toHaveText('Sound on');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toHaveText('Sound off');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toHaveText('Sound on');
});
