import { expect, test, type Page } from '@playwright/test';

import { computedStyle } from './support/pong';
import {
  CONVERGE_MS,
  closeTables,
  enterAt,
  expectAgreedScore,
  labels,
  prepareTablePage,
  statusOf,
  parkPaddleAtTop,
  type TablePage,
} from './support/table';

/**
 * Sending somebody a table.
 *
 * The whole of this work item's second half is one thing a player does: make a
 * table without agreeing anything with anybody, and get the way in to it into
 * somebody else's hands. So these run against a real `wrangler dev` with two
 * browsers, and the second one opens exactly the string the first one put on
 * screen — not one the test rebuilt from its parts, which would assert that the
 * test can construct a URL rather than that the page handed over a usable one.
 *
 * Real time, not the frozen clock: a server and two browsers cannot share one.
 */

test.afterEach(closeTables);

/** Make a table in this browser, and hand back the link the page offers. */
async function createTable(seat: TablePage): Promise<string> {
  await enterAt(seat, '/');

  await expect(seat.page.locator('#create-table')).toBeVisible();
  await seat.page.locator('#create-table').click();

  // Visible only once the table has said this player is waiting at it, which is
  // the moment the link means anything.
  await expect(seat.page.locator('#invite')).toBeVisible({ timeout: CONVERGE_MS });
  const link = (await seat.page.locator('#invite-url').textContent()) ?? '';
  expect(link).not.toBe('');
  return link;
}

/** The table id the line under the court says this page is waiting at. */
async function tableNamedInStatus(page: Page): Promise<string> {
  const line = await statusOf(page);
  const named = /at table (.+)\.$/.exec(line);
  if (named === null) {
    throw new Error(`the status line does not name a table: ${line}`);
  }
  return named[1];
}

test('AC5: a table can be started without typing anything, and the page shows the way in', async ({
  browser,
}) => {
  const host = await prepareTablePage(browser);
  const link = await createTable(host);

  // At a table, with a paddle, waiting — the chooser is behind them.
  await expect(host.page.locator('#choose')).toBeHidden();
  expect(await statusOf(host.page)).toContain('Waiting for another player at table ');

  // And the URL on screen is the way in to *this* table, not merely a URL.
  const named = await tableNamedInStatus(host.page);
  expect(new URL(link).searchParams.get('table')).toBe(named);

  // Nothing was typed to get here: the field is untouched and still empty.
  await expect(host.page.locator('#table-id')).toHaveValue('');

  await host.close();
});

test('AC6: the id the page mints is a sayable one', async ({ browser }) => {
  // The corpus and the size of the space are unit-tested against
  // `generateTableId` itself. What this adds is that the button is wired to that
  // generator rather than to something easier: an id off the clock, or a
  // counter, would sail through every assertion in this file but this one.
  const host = await prepareTablePage(browser);
  await createTable(host);

  const named = await tableNamedInStatus(host.page);
  expect(named).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);

  await host.close();
});

test('a reload comes back to the table that was created, not to the chooser', async ({
  browser,
}) => {
  /*
   * Not an acceptance criterion — added in adjudication, because the behaviour
   * lens found the loss and nothing in the plan was watching for it.
   *
   * A minted id that lives only in the page's DOM is gone the moment the page
   * reloads, and the feature asks the player to leave the browser to send the
   * link, which is when a phone reloads a backgrounded tab. The player comes
   * back to the chooser, presses the same button, and is now waiting at a
   * different table from the friend they sent the first link to — with neither
   * page saying anything is wrong.
   *
   * The fix is that the address bar names the table, the way it already does
   * for the player who arrived on a link. Both halves are asserted: the URL is
   * the one on screen, and a real reload lands back at the same table.
   */
  const host = await prepareTablePage(browser);
  const link = await createTable(host);
  const named = await tableNamedInStatus(host.page);

  // The address bar is the link, so there is something for a reload to use.
  expect(host.page.url()).toBe(link);

  await host.page.reload();

  // Back at the same table rather than back at the question. The seat is
  // retaken by the new socket — the old one went with the old page — so this is
  // the arrival path a link already uses, not a resumption of anything.
  await expect
    .poll(() => statusOf(host.page), { timeout: CONVERGE_MS })
    .toBe(`You have the left paddle. Waiting for another player at table ${named}.`);
  await expect(host.page.locator('#choose')).toBeHidden();
  await expect(host.page.locator('#invite-url')).toHaveText(link);

  await host.close();
});

test('AC7: the link is on screen, selectable, and has a control beside it', async ({
  browser,
}) => {
  const host = await prepareTablePage(browser);
  const link = await createTable(host);

  // The whole URL, not the id: something the person receiving it can open.
  expect(link).toMatch(/^https?:\/\/[^/]+\/\?table=/);

  // Selectable, because copying it by hand is the last thing that still works
  // when everything else about copying does not (AC10).
  expect(await computedStyle(host.page, '#invite-url', 'user-select')).not.toBe('none');
  await expect(host.page.locator('#invite-share')).toBeVisible();

  await host.close();
});

test('AC8: opening the link in a second browser joins the same table', async ({ browser }) => {
  const host = await prepareTablePage(browser);
  const link = await createTable(host);

  const guest = await prepareTablePage(browser);
  await enterAt(guest, link);

  // Seated opposite each other: each is told which paddle is theirs, and the
  // two answers are opposites.
  await expect.poll(() => labels(host.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'You',
    right: 'Opponent',
  });
  await expect.poll(() => labels(guest.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'Opponent',
    right: 'You',
  });

  // Playing, so neither has anything left to say — and the link goes with the
  // waiting it was for.
  await expect.poll(() => statusOf(host.page), { timeout: CONVERGE_MS }).toBe('');
  await expect.poll(() => statusOf(guest.page), { timeout: CONVERGE_MS }).toBe('');
  await expect(host.page.locator('#invite')).toBeHidden();

  // Both paddles out of the way, so there is a score to agree about.
  await parkPaddleAtTop(host.page);
  await parkPaddleAtTop(guest.page);
  await expectAgreedScore(host.page, guest.page);

  await host.close();
  await guest.close();
});

test('AC9: an id typed by hand joins a table a generated link created', async ({ browser }) => {
  const host = await prepareTablePage(browser);
  const link = await createTable(host);
  const minted = new URL(link).searchParams.get('table') ?? '';

  // The other way in, unchanged: the field and the button that were always
  // there, given the id the page generated rather than one agreed out loud.
  const guest = await prepareTablePage(browser);
  await enterAt(guest, '/');
  await guest.page.locator('#table-id').fill(minted);
  await guest.page.locator('#play-table').click();

  await expect(guest.page.locator('#choose')).toBeHidden();
  await expect.poll(() => statusOf(host.page), { timeout: CONVERGE_MS }).toBe('');
  await expect.poll(() => statusOf(guest.page), { timeout: CONVERGE_MS }).toBe('');
  await expect.poll(() => labels(guest.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'Opponent',
    right: 'You',
  });

  await host.close();
  await guest.close();
});

test('AC10: with no clipboard the link is still there, and the page says so', async ({
  browser,
}) => {
  const host = await prepareTablePage(browser);
  // What an insecure origin or a browser that refuses looks like from the page:
  // both tiers gone, before anything on the page has run.
  await host.page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { get: () => undefined });
    Object.defineProperty(navigator, 'share', { get: () => undefined });
  });
  const link = await createTable(host);

  await host.page.locator('#invite-share').click();

  // Not silence: the player is told the thing they asked for did not happen.
  const note = host.page.locator('#invite-note');
  await expect(note).not.toHaveText('');
  expect(((await note.textContent()) ?? '').toLowerCase()).toContain('not available');

  // And the link is still on screen and still selectable, which is what makes
  // the message actionable rather than an apology.
  await expect(host.page.locator('#invite-url')).toHaveText(link);
  expect(await computedStyle(host.page, '#invite-url', 'user-select')).not.toBe('none');

  await host.close();
});

test('AC10: where the clipboard works, the link really lands on it', async ({
  browser,
  baseURL,
}) => {
  const host = await prepareTablePage(browser);
  await host.page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  // No share sheet, so the clipboard is the tier under test rather than one the
  // platform might have taken first. Chromium has none of its own here, but
  // asserting that would be asserting about the harness.
  await host.page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { get: () => undefined });
  });
  const link = await createTable(host);

  await expect(host.page.locator('#invite-share')).toHaveText('Copy link');
  await host.page.locator('#invite-share').click();

  await expect(host.page.locator('#invite-note')).toHaveText('Link copied.');
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await host.close();
});
