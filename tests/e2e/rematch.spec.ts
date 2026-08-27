import { expect, test, type Page } from '@playwright/test';

import { ballAt } from './support/pong';
import {
  CONVERGE_MS,
  closeTables,
  expectPlaying,
  freshTableId,
  joinTable,
  parkPaddleAtCentre,
  parkPaddleAtTop,
  say,
  scoreOf,
  scoresSeen,
  statusOf,
  statusesSeen,
  watchScore,
  watchStatus,
} from './support/table';

/**
 * Playing another game at a table that has been won.
 *
 * The first test here plays a real game to eleven against a real server on a
 * real clock, because that is the only way to reach the state the criterion is
 * about: a table whose game is over, with both players still at it. It is the
 * slowest test in the suite by a distance, and deliberately so — a forged
 * game-over would prove the browser draws a winner line, which is a different
 * work item's assertion, and would prove nothing about the table.
 */

/** Long enough for two parked paddles to let eleven points through. */
const TO_ELEVEN_MS = 120_000;

/** Long enough for a message to cross and a broadcast to come back. */
const SETTLE_MS = 1000;

/** How far off the centre spot a ball has to be to be in play rather than waiting. */
const OFF_THE_SPOT = 30;

test.afterEach(closeTables);

/** Wait until this page is drawing a ball that has been served. */
async function expectBallInPlay(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const ball = await ballAt(page);
        // The court is 800 across, so the centre spot is 400: a ball that has
        // left it is a ball in a rally rather than one waiting to be served.
        return ball === null ? 0 : Math.abs(ball.x - 400);
      },
      { timeout: CONVERGE_MS },
    )
    .toBeGreaterThan(OFF_THE_SPOT);
}

/** Every score this page showed, as numbers, in the order it showed them. */
function totals(scores: string[]): number[] {
  return scores.map((score) => score.split('-').reduce((sum, part) => sum + Number(part), 0));
}

test('AC1: either player starts another game once one has been won', async ({ browser }) => {
  // A game to eleven is minutes of real time in the worst case, and the default
  // per-test budget is thirty seconds.
  test.setTimeout(TO_ELEVEN_MS + 60_000);

  const table = freshTableId('rematch');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  // Both paddles out of the way, so the game runs itself to eleven.
  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);

  await expect.poll(() => statusOf(first.page), { timeout: TO_ELEVEN_MS }).toMatch(/wins?!/);
  await expect.poll(() => statusOf(second.page), { timeout: CONVERGE_MS }).toMatch(/wins?!/);
  const finished = await scoreOf(first.page);
  expect(finished).toMatch(/^(11-\d+|\d+-11)$/);
  expect(await scoreOf(second.page)).toBe(finished);

  // Paddles back across the court, so the game that is about to start lasts
  // long enough to look at instead of scoring inside the assertions.
  await parkPaddleAtCentre(first.page);
  await parkPaddleAtCentre(second.page);

  // Watched again from here, so "the score went back to 0-0" is something that
  // happened after the game was won rather than the 0-0 it started at.
  await watchScore(first.page);
  await watchScore(second.page);
  await watchStatus(first.page);
  await watchStatus(second.page);

  // The gesture the page already offers, from one of the two players. Which one
  // is not the point: either may ask, and the other is taken into the game.
  await second.page.keyboard.press('Space');

  // Both browsers: back to 0-0, no winner line, and a ball in play.
  await expect.poll(() => scoresSeen(first.page), { timeout: CONVERGE_MS }).toContain('0-0');
  await expect.poll(() => scoresSeen(second.page), { timeout: CONVERGE_MS }).toContain('0-0');
  // The line is read from its whole history rather than as it stands now. What
  // AC1 asks for is that the winner line came *down*, and a run in which it had
  // never been shown at all would read identically at a glance — an empty line
  // now says nothing about whether there was ever one to take back.
  for (const page of [first.page, second.page]) {
    await expect
      .poll(
        async () => {
          const seen = await statusesSeen(page);
          return seen[seen.length - 1];
        },
        { timeout: CONVERGE_MS },
      )
      .toBe('');
    expect((await statusesSeen(page))[0]).toMatch(/wins?!/);
  }
  await expectBallInPlay(first.page);
  await expectBallInPlay(second.page);

  await first.close();
  await second.close();
});

test('AC2: a rematch in the middle of a rally changes nothing', async ({ browser }) => {
  const table = freshTableId('mid-rally');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  // A game with something to lose: a score that is not 0-0, so a game starting
  // over would be visible as the score going back to it.
  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe('0-0');

  await watchScore(first.page);
  await watchScore(second.page);
  await watchStatus(first.page);

  // Two ways of asking, in the middle of the rally. The key press is what a
  // player can actually do; the message is what a browser that had been
  // tampered with would send, and it is the table's own rule that has to
  // refuse it — the client's manners are not the protection here.
  await first.page.keyboard.press('Space');
  await say(first.page, { kind: 'rematch' });
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

  // Neither browser went back to 0-0, and the score only ever went up: a game
  // that had started over would have shown both.
  for (const page of [first.page, second.page]) {
    const seen = await scoresSeen(page);
    expect(seen).not.toContain('0-0');
    expect(totals(seen)).toEqual([...totals(seen)].sort((a, b) => a - b));
  }
  // And the rally is still a rally: no winner line at any point in it — read
  // from the history, because a game that restarted and was won again would
  // have shown a line and taken it back inside the second waited above — and
  // the ball still moving.
  expect(await statusesSeen(first.page)).toEqual(['']);
  await expectBallInPlay(first.page);

  await first.close();
  await second.close();
});

test('AC2: a browser holding no seat cannot start a game', async ({ browser }) => {
  const table = freshTableId('no-seat');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  await parkPaddleAtTop(first.page);
  await parkPaddleAtTop(second.page);
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe('0-0');

  // A third browser, turned away at the door and holding no paddle.
  const third = await joinTable(browser, table);
  await expect
    .poll(() => statusOf(third.page), { timeout: CONVERGE_MS })
    .toBe(`Table ${table} is in use. Agree another id and try that one.`);

  await watchScore(first.page);
  await watchScore(second.page);

  // It asks anyway. Its socket has already been closed on it, which is the
  // first thing standing in its way; the seat check in the table is the second,
  // and what this asserts is the outcome both of them are there for.
  await say(third.page, { kind: 'rematch' });
  await third.page.keyboard.press('Space');
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

  for (const page of [first.page, second.page]) {
    const seen = await scoresSeen(page);
    expect(seen).not.toContain('0-0');
    expect(totals(seen)).toEqual([...totals(seen)].sort((a, b) => a - b));
  }
  expect(await statusOf(first.page)).toBe('');
  expect(await statusOf(second.page)).toBe('');

  await first.close();
  await second.close();
  await third.close();
});
