import { expect, test } from '@playwright/test';

import { ballAt, paddleAt } from './support/pong';
import {
  CONVERGE_MS,
  closeTables,
  expectPlaying,
  freshTableId,
  joinTable,
  scoreOf,
  snapshotsSeen,
  statusOf,
} from './support/table';

/**
 * What a table sends, and when it says nothing.
 *
 * A table that broadcasts thirty times a second to one player is thirty times a
 * second of a Durable Object's duration billed to hold a court that cannot
 * change — nothing moves until both paddles are held. These are rate
 * assertions on a real clock, so the bounds are generous: what is being
 * measured is a timer running or not running, not its exact period.
 */

/** Long enough that a 30 Hz timer would be unmistakable: about 145 snapshots. */
const WATCH_MS = 5000;

/** The window a full-rate broadcast is counted over. */
const RATE_MS = 2000;

test.afterEach(closeTables);

test('AC3, AC4: one player at a table gets a court, and then silence', async ({ browser }) => {
  const table = freshTableId('one-player');
  const alone = await joinTable(browser, table);
  await expect
    .poll(() => statusOf(alone.page), { timeout: CONVERGE_MS })
    .toContain('Waiting for another player');

  // AC4 first, because AC3 is the reason it could go: the one court sent on
  // seating is what the player waiting is looking at. The score comes from the
  // table rather than from the markup only once a snapshot has arrived.
  await expect.poll(() => snapshotsSeen(alone.page), { timeout: CONVERGE_MS }).toBeGreaterThan(0);
  expect(await scoreOf(alone.page)).toBe('0-0');
  const paddle = await paddleAt(alone.page, 'player');
  expect(paddle.top).toBeGreaterThanOrEqual(0);
  expect(await ballAt(alone.page)).not.toBeNull();

  // AC3: five seconds of wall clock at a table with one player at it. A timer
  // running behind this would have sent about 145 courts by now.
  await new Promise((resolve) => setTimeout(resolve, WATCH_MS));
  expect(await snapshotsSeen(alone.page)).toBeLessThanOrEqual(2);

  await alone.close();
});

test('AC5: the broadcast starts with the second player and stops when one leaves', async ({
  browser,
}) => {
  const table = freshTableId('both-seats');
  const first = await joinTable(browser, table);
  await expect.poll(() => snapshotsSeen(first.page), { timeout: CONVERGE_MS }).toBeGreaterThan(0);

  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  // Both seats filled: the normal rate, which is thirty a second.
  const started = await snapshotsSeen(first.page);
  await new Promise((resolve) => setTimeout(resolve, RATE_MS));
  const during = (await snapshotsSeen(first.page)) - started;
  expect(during).toBeGreaterThan(30);
  expect(during).toBeLessThan(120);

  await second.close();
  await expect
    .poll(() => statusOf(first.page), { timeout: CONVERGE_MS })
    .toBe(`Your opponent left. Waiting for another player at table ${table}.`);

  // And it stops again: at most the one court that says where the game froze.
  const alone = await snapshotsSeen(first.page);
  await new Promise((resolve) => setTimeout(resolve, WATCH_MS));
  expect((await snapshotsSeen(first.page)) - alone).toBeLessThanOrEqual(2);

  await first.close();
});
