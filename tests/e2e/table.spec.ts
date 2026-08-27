import { expect, test, type Page } from '@playwright/test';

import { courtBox, paddleAt } from './support/pong';
import {
  CONVERGE_MS,
  TEST_IDLE_TIMEOUT_MS,
  closeTables,
  enterTable,
  expectPlaying,
  forge,
  freshTableId,
  joinTable,
  labels,
  parkPaddleAtTop,
  prepareTablePage,
  scoreOf,
  scoresSeen,
  snapshotsSeen,
  socketCloses,
  statusOf,
  statusesSeen,
} from './support/table';

/**
 * Two browsers, one table id, one game.
 *
 * These run on real time against a real `wrangler dev`, because a server and two
 * browsers cannot share a frozen clock. Every wait is a poll on what the pages
 * show rather than a sleep of a guessed length — a fixed sleep here is a defect,
 * not a tuning parameter.
 */

/** Long enough for several broadcasts, and short enough to be worth watching. */
const RALLY_MS = 2500;

// A test that fails leaves its browser contexts behind, and the next repeat in
// the same worker inherits them. Closed here so one failure stays one failure.
test.afterEach(closeTables);

/**
 * Wait until both browsers are showing the same score, and it is not 0-0.
 *
 * Two pages cannot be read at the same instant — the reads are milliseconds
 * apart and a broadcast can land between them — so "the same score" is asserted
 * as something the pair is found in, not as two readings subtracted. Points are
 * the best part of two seconds apart, so an agreeing sample is not hard to find.
 */
async function expectAgreedScore(first: Page, second: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const mine = await scoreOf(first);
        const theirs = await scoreOf(second);
        return mine === theirs && mine !== '0-0';
      },
      { timeout: CONVERGE_MS },
    )
    .toBe(true);
}

/**
 * Every score one page showed, against every score the other did.
 *
 * The same broadcasts reach both, so the two lists are the same list — except
 * that one page may be a single beat further along than the other at the moment
 * they are read, which is what the shorter length allows for.
 */
function expectSameScoreHistory(mine: string[], theirs: string[]): void {
  const shared = Math.min(mine.length, theirs.length);
  expect(theirs.slice(0, shared)).toEqual(mine.slice(0, shared));
  expect(Math.abs(mine.length - theirs.length)).toBeLessThanOrEqual(1);
  // And the score really moved, or the agreement above is agreement about
  // nothing having happened.
  expect(shared).toBeGreaterThan(1);
}

test('AC3: two browsers at one table id play each other, a side each', async ({ browser }) => {
  const table = freshTableId('together');
  const first = await joinTable(browser, table);
  await expect
    .poll(() => statusOf(first.page), { timeout: CONVERGE_MS })
    .toContain('Waiting for another player');

  const second = await joinTable(browser, table);

  // Each is told which paddle is theirs, and the two answers are opposites.
  await expect.poll(() => labels(first.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'You',
    right: 'Opponent',
  });
  await expect.poll(() => labels(second.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'Opponent',
    right: 'You',
  });
  await expect
    .poll(() => statusOf(first.page), { timeout: CONVERGE_MS })
    .toBe('');
  await expect.poll(() => statusOf(second.page), { timeout: CONVERGE_MS }).toBe('');

  // Both paddles out of the way, so points are actually scored to compare.
  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);

  // The same score on both, all the way through, and it does move.
  await new Promise((resolve) => setTimeout(resolve, RALLY_MS));
  expectSameScoreHistory(await scoresSeen(first.page), await scoresSeen(second.page));
  await expectAgreedScore(first.page, second.page);

  await first.close();
  await second.close();
});

test('AC4: a third browser is refused, and the two playing never notice', async ({ browser }) => {
  const table = freshTableId('in-use');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe('0-0');
  const before = await scoreOf(first.page);

  const third = await joinTable(browser, table);

  await expect
    .poll(() => statusOf(third.page), { timeout: CONVERGE_MS })
    .toBe(`Table ${table} is in use. Agree another id and try that one.`);
  // Turned away rather than seated: it was never given a paddle.
  expect(await labels(third.page)).toEqual({ left: 'Left', right: 'Right' });

  // The rally the other two are in carried straight on. Neither was told
  // anything, and the score only went up.
  expect(await statusOf(first.page)).toBe('');
  expect(await statusOf(second.page)).toBe('');
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe(before);
  await expectAgreedScore(first.page, second.page);
  expectSameScoreHistory(await scoresSeen(first.page), await scoresSeen(second.page));

  await first.close();
  await second.close();
  await third.close();
});

test('AC6: a player leaving is announced, and frees the table for somebody else', async ({
  browser,
}) => {
  const table = freshTableId('left-the-table');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  await second.close();

  // Told, and told within the five seconds the criterion allows.
  await expect
    .poll(() => statusOf(first.page), { timeout: 5000 })
    .toBe(`Your opponent left. Waiting for another player at table ${table}.`);

  // And the table is free: the next arrival is admitted, on the paddle the
  // player who left was holding, rather than refused.
  const third = await joinTable(browser, table);
  await expect.poll(() => labels(third.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'Opponent',
    right: 'You',
  });
  await expectPlaying(third.page);
  await expectPlaying(first.page);

  await first.close();
  await third.close();
});

test('AC7: a table nobody is at times out, and starts over at 0-0', async ({ browser }) => {
  const table = freshTableId('abandoned');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe('0-0');

  // Opened before the table empties, so coming back is a page load rather than
  // a whole browser context — the table is only free for its idle timeout, and
  // arriving inside it is the point of this half of the test.
  const soon = await prepareTablePage(browser);
  const later = await prepareTablePage(browser);

  // The score to come back to is read after the table has stopped, not out of a
  // rally that is still running: points land the best part of every two seconds
  // and a reference taken while the ball is moving can be overtaken before the
  // last socket closes. The ball stops the moment one paddle is unattended, and
  // a snapshot is broadcast at the end of the tick that produced it — so once
  // the player still there has been told their opponent has gone, the score in
  // front of them is the score the table froze at.
  await first.close();
  await expect
    .poll(() => statusOf(second.page), { timeout: CONVERGE_MS })
    .toBe(`Your opponent left. Waiting for another player at table ${table}.`);
  const abandoned = await scoreOf(second.page);
  expect(abandoned).not.toBe('0-0');
  await second.close();

  // Straight back: the table is still the same game, which is what makes the
  // wait below mean something rather than passing for free.
  await enterTable(soon, table);
  await expect.poll(() => scoreOf(soon.page), { timeout: CONVERGE_MS }).toBe(abandoned);
  await soon.close();

  // Now leave it alone for longer than its idle timeout.
  await new Promise((resolve) => setTimeout(resolve, TEST_IDLE_TIMEOUT_MS * 1.5));

  await enterTable(later, table);
  // The welcome first, and only then the score. A page that never got in shows
  // the 0-0 its own markup ships with, so checking the score alone would pass
  // for a browser that never reached the table at all.
  await expect
    .poll(
      async () =>
        `${await statusOf(later.page)} [closed: ${(await socketCloses(later.page)).join()}]`,
      { timeout: CONVERGE_MS },
    )
    .toContain('Waiting for another player');
  // And a court from the table before reading the score off it. The welcome
  // arrives before the first snapshot does, and until one lands the scoreboard
  // is still the 0-0 index.html ships — which would pass this whether the
  // timeout discarded the abandoned game or not.
  await expect
    .poll(() => snapshotsSeen(later.page), { timeout: CONVERGE_MS })
    .toBeGreaterThan(0);
  expect(await scoreOf(later.page)).toBe('0-0');
  await later.close();
});

test('AC5: a player sees their own paddle at once, and the opponent lags', async ({
  browser,
}) => {
  const table = freshTableId('latency');
  // A fifth of a second each way, which is a bad mobile connection.
  const first = await joinTable(browser, table, { latencyMs: 200 });
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  const box = await courtBox(first.page);
  /** A whole viewport pixel a fraction of the way down the canvas. */
  const downCourt = (fraction: number): number => Math.round(box.top + box.height * fraction);
  /** Where that viewport y is on the court, scaled through the canvas's box. */
  const courtY = (clientY: number): number => ((clientY - box.top) * 480) / box.height;

  // Low down, and clear of the bottom clamp, so what is measured is the pointer
  // being followed rather than the paddle resting against an edge.
  const low = downCourt(0.8);
  await first.page.mouse.move(box.left + 100, low);
  await expect
    .poll(async () => (await paddleAt(second.page, 'player')).top, { timeout: CONVERGE_MS })
    .toBeGreaterThan(300);

  // Then throw it high up the court, and look immediately.
  const high = downCourt(0.2);
  await first.page.mouse.move(box.left + 100, high);

  const own = await paddleAt(first.page, 'player');
  const opponentsView = await paddleAt(second.page, 'player');

  // The player's own paddle is under their pointer, within a pixel, on the very
  // next frame it drew — no round trip involved.
  expect(Math.abs((own.top + own.bottom + 1) / 2 - courtY(high))).toBeLessThanOrEqual(1);

  // The other browser cannot know yet: the input has not finished crossing.
  expect(opponentsView.top).toBeGreaterThan(250);

  // And it gets there, which is what makes the lag a lag rather than a loss.
  await expect
    .poll(async () => (await paddleAt(second.page, 'player')).top, { timeout: CONVERGE_MS })
    .toBeLessThan(100);

  await first.close();
  await second.close();
});

test('AC8: a client that rewrites its own copy has it overwritten, and nobody else sees it', async ({
  browser,
}) => {
  const table = freshTableId('authority');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  const honest = await scoreOf(first.page);

  // A snapshot the table never sent: a stolen score, the ball in a corner, and
  // both paddles somewhere they are not.
  await forge(first.page, {
    kind: 'snapshot',
    state: {
      phase: 'rally',
      ball: { x: 40, y: 40, vx: 0, vy: 0 },
      playerY: 0,
      cpuY: 0,
      score: { player: 9, cpu: 9 },
      serveTimerMs: 0,
      winner: null,
      rngState: 0,
    },
    events: [],
  });

  // It landed — the page really did display it — and then the next broadcast
  // took it away again.
  await expect.poll(() => scoresSeen(first.page), { timeout: CONVERGE_MS }).toContain('9-9');
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe('9-9');

  // The opponent's browser never saw any of it, and neither did the table: the
  // score on both is the one the server has been counting all along.
  expect(await scoresSeen(second.page)).not.toContain('9-9');
  expect(Number((await scoreOf(first.page)).split('-')[0])).toBeLessThan(9);
  expect(honest).not.toBe('9-9');
  // Both browsers are back on the server's count, and the forged score is not
  // in either page's history except on the page that forged it.
  await expect
    .poll(
      async () => (await scoreOf(first.page)) === (await scoreOf(second.page)),
      { timeout: CONVERGE_MS },
    )
    .toBe(true);

  await first.close();
  await second.close();
});

test('the winner line goes when the game it announced does', async ({ browser }) => {
  const table = freshTableId('announcement');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  // A finished game, announced the way the table announces a real one: a final
  // court, with the game-over on it. Forged rather than rallied to, because
  // eleven points is minutes of suite time to reach a line of text.
  await forge(first.page, {
    kind: 'snapshot',
    state: {
      phase: 'game-over',
      ball: { x: 400, y: 240, vx: 0, vy: 0 },
      playerY: 200,
      cpuY: 200,
      score: { player: 11, cpu: 8 },
      serveTimerMs: 0,
      winner: 'player',
      rngState: 0,
    },
    events: [{ kind: 'game-over', winner: 'player' }],
  });

  // It was announced — read from the history, because the table's next court is
  // a thirtieth of a second behind it — and then it was taken back, because the
  // court the table is broadcasting is a game still in play. A line left latched
  // there is painted over the next game for as long as the connection holds.
  await expect
    .poll(() => statusesSeen(first.page), { timeout: CONVERGE_MS })
    .toContain('You win!');
  await expect.poll(() => statusOf(first.page), { timeout: CONVERGE_MS }).toBe('');

  // And none of it reached the other browser.
  expect(await statusesSeen(second.page)).not.toContain('You win!');

  await first.close();
  await second.close();
});
