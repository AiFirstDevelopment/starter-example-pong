import { expect, test } from '@playwright/test';

import {
  CONVERGE_MS,
  TABLE_PORT,
  closeTables,
  expectPlaying,
  freshTableId,
  joinTable,
  parkPaddleAtTop,
  scoreOf,
  statusesSeen,
  watchStatus,
} from './support/table';

/**
 * The two locks on the table server's door.
 *
 * Both are at the Worker entry, and both are checked here through requests
 * rather than through a page, because what is being asserted is what the entry
 * does with a request the game would never make. The distinction that matters
 * runs through every assertion below: **403 and 429 are the entry's answers,
 * and 426 is the Durable Object's.** A request that comes back 426 was passed
 * through to a table — the object exists, and on a real account it is resident
 * and billed from that moment. A request that comes back 403 or 429 was turned
 * away before any of that, which is the whole point of putting the checks where
 * they are.
 */

/** The origins `worker/wrangler.toml` admits. */
const SITE = 'https://pong-3su.pages.dev';
const PREVIEW = 'https://5355cd3f.pong-3su.pages.dev';
const DEV = 'http://localhost:4173';

/** The Durable Object's own answer to a request that is not an upgrade. */
const ADDRESSED = 426;

function tableUrl(name: string): string {
  return `http://127.0.0.1:${TABLE_PORT}/table/${freshTableId(name)}`;
}

/**
 * An address to be counted against, which is not this machine's.
 *
 * Random because the limiter counts over a rolling minute and the suite's tests
 * run alongside each other and again on a retry: an address shared between two
 * of them would have each one spending the other's allowance. `198.18.x.x` is
 * the benchmarking range, so it is nobody's real address either.
 */
function someAddress(): string {
  const octet = (): number => Math.floor(Math.random() * 256);
  return `198.18.${octet()}.${octet()}`;
}

test.afterEach(closeTables);

test('AC6: a table is opened from the game, and from nowhere else', async ({ request }) => {
  const url = tableUrl('origin');

  // A request naming no origin at all. Every browser sends one on a WebSocket
  // upgrade, so this is not a player: refused, and refused by the entry — a 426
  // here would mean a table had already been created for it.
  const anonymous = await request.get(url);
  expect(anonymous.status()).toBe(403);

  // Somebody else's page, and somebody else's project on the shared domain the
  // site is deployed to.
  for (const origin of [
    'https://not-this-game.example',
    'https://somebody-else.pages.dev',
    'https://pages.dev',
    'https://evilpong-3su.pages.dev',
    'http://pong-3su.pages.dev',
  ]) {
    const refused = await request.get(url, { headers: { origin } });
    expect(refused.status(), `origin ${origin}`).toBe(403);
  }

  // And the ones that are the game: the site, a per-deployment preview of it,
  // and the development server this suite itself is served from. These reach
  // the table, which is what 426 says.
  for (const origin of [SITE, PREVIEW, DEV]) {
    const admitted = await request.get(url, { headers: { origin } });
    expect(admitted.status(), `origin ${origin}`).toBe(ADDRESSED);
  }
});

test('AC7: one address asking over and over is cut off, and nobody else is', async ({
  browser,
  request,
}) => {
  // A game already in progress, which none of what follows may disturb.
  const table = freshTableId('undisturbed');
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
  // Watched from here, so the line either page shows for the rest of this test
  // is the whole record of what the flood below did to their game.
  await watchStatus(first.page);
  await watchStatus(second.page);

  // Somebody at one address, asking for tables far faster than a player who
  // upgrades once and stays. The binding doing the counting is the real one:
  // this suite's `wrangler dev` has it, with the allowance `wrangler.toml`
  // configures, and it is enforced before the table is addressed.
  const flooder = someAddress();
  const url = tableUrl('flood');
  const answers: number[] = [];
  const ask = async (address: string): Promise<number> =>
    (await request.get(url, { headers: { origin: SITE, 'cf-connecting-ip': address } })).status();

  // Asked until the door shuts, and then a few more times, rather than a fixed
  // number of times: the count is over a period the runtime keeps for itself,
  // and a run that begins near the end of one spends part of its attempts in
  // that period and the rest in the next. `ATTEMPTS` is two allowances and
  // more, so the refusals arrive inside it either way.
  const ATTEMPTS = 80;
  let refusals = 0;
  while (answers.length < ATTEMPTS && refusals < 3) {
    const status = await ask(flooder);
    answers.push(status);
    refusals = status === 429 ? refusals + 1 : 0;
  }

  // An honest player is not turned away: the first attempts reach a table, and
  // it takes an allowance of them before any refusal. Then the door stays shut
  // rather than flickering — three in a row, not one.
  expect(answers[0]).toBe(ADDRESSED);
  expect(answers.slice(-3)).toEqual([429, 429, 429]);
  expect(answers.indexOf(429)).toBeGreaterThanOrEqual(25);

  // Somebody else, arriving while that address is still being refused, is not
  // caught up in it: the count is against an address, not against the door.
  expect(await ask(someAddress())).toBe(ADDRESSED);

  // And the game two people were already in the middle of never noticed. Read
  // from the whole history rather than from the line as it stands now: a table
  // that had been disturbed would have said so — a lost connection, an opponent
  // gone — and then this browser would still be saying it.
  expect(await statusesSeen(first.page)).toEqual(['']);
  expect(await statusesSeen(second.page)).toEqual(['']);
  await expect
    .poll(() => scoreOf(first.page), { timeout: CONVERGE_MS })
    .not.toBe(before);

  await first.close();
  await second.close();
});
