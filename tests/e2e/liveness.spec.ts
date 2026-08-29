import { expect, test } from '@playwright/test';

import {
  CONVERGE_MS,
  TEST_LIVENESS_TIMEOUT_MS,
  closeTables,
  expectPlaying,
  freshTableId,
  goSilent,
  joinTable,
  labels,
  parkPaddleAtCentre,
  scoreOf,
  snapshotsSeen,
  socketCloses,
  statusOf,
  statusesSeen,
} from './support/table';

/**
 * What the table says as it hangs up on a socket that stopped answering.
 *
 * Written out rather than imported: from out here the close code is the wire
 * contract, not one of the page's own constants. It is `SILENT_CLOSE_CODE` in
 * `src/net/protocol.ts`, with the reason `worker/table.ts` closes with.
 */
const HUNG_UP_FOR_SILENCE = '4408:no sign of life';

/**
 * A seat is held by a socket, and a socket is only worth a seat while somebody
 * is behind it.
 *
 * These two are the same mechanism from either side. A browser that has gone —
 * a killed tab, a closed laptop, a cut network — leaves a socket that never
 * closes and never says anything again, and the seat behind it has to come back
 * or the table is held, resident and billed, for as long as the connection
 * survives. A player who has simply stopped moving also says nothing about their
 * paddle, and must not be thrown out for it.
 *
 * Both run on real time against a real `wrangler dev`, whose liveness timeout is
 * shortened by `--var` the way its idle timeout already is.
 */

test.afterEach(closeTables);

test('AC1: a socket that stops answering loses its seat, and the player still there is told', async ({
  browser,
}) => {
  const table = freshTableId('gone-quiet');
  const staying = await joinTable(browser, table);
  const leaving = await joinTable(browser, table);
  await expectPlaying(staying.page);
  await expectPlaying(leaving.page);

  // Not closed — silenced. A page that is closed sends a close frame, which the
  // table acts on at once; the case this timeout exists for is the one where no
  // frame ever arrives.
  await goSilent(leaving.page);

  // Told, and told inside twice the timeout, which a table that never notices
  // fails and a table that notices at the timeout passes with room to spare.
  await expect
    .poll(() => statusOf(staying.page), { timeout: TEST_LIVENESS_TIMEOUT_MS * 2 })
    .toBe(`Your opponent left. Waiting for another player at table ${table}.`);

  // And the socket was hung up on, not merely forgotten. A seat given back
  // while the connection is left open gives back nothing that costs anything:
  // the table is resident and billed for as long as somebody holds a socket to
  // it, and the browser behind this one has gone.
  await expect
    .poll(() => socketCloses(leaving.page), { timeout: CONVERGE_MS })
    .toContain(HUNG_UP_FOR_SILENCE);

  // And the seat came back: the next arrival takes the paddle the silent socket
  // was holding, rather than being turned away from a table nobody is at.
  const arriving = await joinTable(browser, table);
  await expect.poll(() => labels(arriving.page), { timeout: CONVERGE_MS }).toEqual({
    left: 'Opponent',
    right: 'You',
  });
  await expectPlaying(arriving.page);
  await expectPlaying(staying.page);
});

test('AC2: a player who parks their paddle and stops moving keeps their seat', async ({
  browser,
}) => {
  // Three times the timeout of waiting, plus two browsers to open and a third to
  // turn away at the end of it.
  test.setTimeout(TEST_LIVENESS_TIMEOUT_MS * 3 + 60_000);

  const table = freshTableId('parked');
  const first = await joinTable(browser, table);
  const second = await joinTable(browser, table);
  await expectPlaying(first.page);
  await expectPlaying(second.page);

  // A pointer names a place rather than a direction, so once it has stopped
  // moving neither client has anything left to report — which is exactly the
  // silence a timeout measured against input would mistake for a dead socket.
  await parkPaddleAtCentre(first.page);
  await parkPaddleAtCentre(second.page);

  const courtsFirst = await snapshotsSeen(first.page);
  const courtsSecond = await snapshotsSeen(second.page);

  // Three times the timeout, and that multiple is the point of the criterion: a
  // client that only survives a beat or two would pass a shorter wait by
  // accident.
  await new Promise((resolve) => setTimeout(resolve, TEST_LIVENESS_TIMEOUT_MS * 3));

  // Neither was ever told the other had gone, and neither lost its connection.
  for (const seat of [first, second]) {
    const said = await statusesSeen(seat.page);
    expect(said).not.toContain(`Your opponent left. Waiting for another player at table ${table}.`);
    expect(said).not.toContain(`Lost the connection to table ${table}.`);
  }

  // Still being sent the court, on both sides.
  expect(await snapshotsSeen(first.page)).toBeGreaterThan(courtsFirst);
  expect(await snapshotsSeen(second.page)).toBeGreaterThan(courtsSecond);

  // And the game carried on as one game: the two browsers still agree about it.
  await expect
    .poll(async () => (await scoreOf(first.page)) === (await scoreOf(second.page)), {
      timeout: CONVERGE_MS,
    })
    .toBe(true);

  // The strongest reading of "still seated": the table still holds both paddles,
  // so a third browser is turned away rather than handed one.
  const third = await joinTable(browser, table);
  await expect
    .poll(() => statusOf(third.page), { timeout: CONVERGE_MS })
    .toBe(`Table ${table} is in use. Agree another id and try that one.`);
});
