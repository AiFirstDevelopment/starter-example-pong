import { expect, test } from '@playwright/test';

import { ballAt, paddleAt } from './support/pong';
import {
  CONVERGE_MS,
  closeTables,
  enterTable,
  expectPlaying,
  freshTableId,
  joinTable,
  parkPaddleAtTop,
  prepareTablePage,
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
  // Opened now, entered later: a context is the best part of a second to make,
  // and the lone player below has to reach the table inside its idle timeout or
  // the game they are meant to be shown is thrown away before they get there.
  const alone = await prepareTablePage(browser);

  // First, a game with a score in it, left frozen at the table. That score is
  // what makes AC4 mean anything: index.html ships 0-0 in its own markup and
  // `render` paints a centred paddle and a centre-spot ball on every frame from
  // the first one, so at a *fresh* table a player who was sent nothing at all
  // looks exactly like a player who was sent a court. A score of 3-1 does not
  // come from anywhere but the table.
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);
  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);
  await expect
    .poll(() => scoreOf(second.page), { timeout: CONVERGE_MS })
    .not.toBe('0-0');

  // Read once the game has stopped rather than while it is running: with one
  // player gone there is no loop, so this is the score the table is holding and
  // not one that moved on between reading it and asserting it.
  await first.close();
  await expect
    .poll(() => statusOf(second.page), { timeout: CONVERGE_MS })
    .toContain('Your opponent left');
  const frozen = await scoreOf(second.page);
  expect(frozen).not.toBe('0-0');
  await second.close();

  // And now one player, alone, at that table.
  await enterTable(alone, table);
  await expect
    .poll(() => statusOf(alone.page), { timeout: CONVERGE_MS })
    .toContain('Waiting for another player');

  // AC4 first, because AC3 is the reason it could go: the one court sent on
  // seating is what the player waiting is looking at, and the score on it is
  // the table's — a page that was sent no court at all would still be showing
  // the 0-0 its markup ships with.
  await expect.poll(() => snapshotsSeen(alone.page), { timeout: CONVERGE_MS }).toBeGreaterThan(0);
  await expect
    .poll(() => scoreOf(alone.page), { timeout: CONVERGE_MS })
    .toBe(frozen);
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
