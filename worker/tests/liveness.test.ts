/**
 * What a table does about a socket that has stopped answering.
 *
 * The behavioural suite watches this from the browsers' side — a seat comes
 * back, and the player still there is told. Two things it cannot watch are
 * here. One is the hang-up itself: freeing a seat without closing the socket
 * looks identical from a browser that has already gone, and leaves the
 * connection — and so the Durable Object behind it — exactly as resident and as
 * billed as before, which is the whole hazard the timeout exists for. The other
 * is a socket whose seat has been handed on, which no browser can produce: a
 * seat is freed only on close or error, so a real browser's socket is gone by
 * the time somebody else has its paddle.
 *
 * Clock and sockets are both the test's, so these run in milliseconds rather
 * than in the seconds the behavioural suite has to spend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SILENT_CLOSE_CODE } from '../../src/net/protocol';
import { Table, type Env } from '../table';
import { FakeSocket, installWorkersRuntime, messages, openSocket } from './support/workers';

/** Short enough to advance past, long enough to sit either side of. */
const TIMEOUT_MS = 1000;

/** What the browser's end is told when the table hangs up for silence. */
const HUNG_UP = `${SILENT_CLOSE_CODE}:no sign of life`;

let runtime: { restore: () => void };

beforeEach(() => {
  runtime = installWorkersRuntime();
  // Every deadline here is one this test moves the clock to.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  runtime.restore();
});

/**
 * A table nobody has sat down at yet, with a timeout a test can wait out.
 *
 * `LIVENESS_TIMEOUT_MS` is read the way a deployed one reads it, so what is
 * exercised is the configured path rather than a constant reached around.
 */
function emptyTable(): Table {
  const env = {
    TABLE: undefined as unknown as DurableObjectNamespace,
    LIVENESS_TIMEOUT_MS: String(TIMEOUT_MS),
  } satisfies Env;
  return new Table({} as DurableObjectState, env);
}

/** The kinds of message this end has been told about, in order. */
function kinds(socket: FakeSocket): string[] {
  return messages(socket).map((message) => String(message['kind']));
}

/** The paddle this end was given, out of the welcome it opened with. */
function slotOf(socket: FakeSocket): unknown {
  return messages(socket)[0]?.['slot'];
}

/** Say the one thing a browser with nothing to report still says. */
function beat(socket: FakeSocket): void {
  socket.send(JSON.stringify({ kind: 'alive' }));
}

describe('a table and a socket that has gone quiet', () => {
  it('hangs up on it, and gives the seat back', () => {
    const table = emptyTable();
    const quiet = openSocket(table);
    expect(slotOf(quiet)).toBe('left');

    vi.advanceTimersByTime(TIMEOUT_MS);

    // Hung up on, and with the code that says why. A seat freed while the
    // socket is left open frees nothing that costs anything: the connection is
    // still there, and this object is resident and billed for as long as it is.
    expect(quiet.closes).toEqual([HUNG_UP]);
    // And the paddle really did come back, rather than being held by a seat map
    // that still thinks somebody has it.
    const arriving = openSocket(table);
    expect(slotOf(arriving)).toBe('left');
  });

  it('leaves a socket that beats exactly where it is', () => {
    const table = emptyTable();
    const beating = openSocket(table);

    // Four beats over twice the timeout, which is a player who is still there
    // and has nothing to say about their paddle — the case a table that timed
    // out on input rather than on silence would throw out.
    for (let i = 0; i < 4; i += 1) {
      vi.advanceTimersByTime(TIMEOUT_MS / 2);
      beat(beating);
    }

    expect(beating.closes).toEqual([]);
    expect(kinds(beating)).toEqual(['welcome', 'opponent', 'snapshot']);
  });

  it('does not read a beat as a request for another game', () => {
    const table = emptyTable();
    const seated = openSocket(table);
    expect(kinds(seated)).toEqual(['welcome', 'opponent', 'snapshot']);

    beat(seated);

    // Nothing started. Anything the table does not recognise falls through to
    // `rematch`, and a beat that fell through with it would start a game nobody
    // asked for — taking the winner's line down and the score back to nothing,
    // at most one beat after a game ended.
    expect(kinds(seated)).toEqual(['welcome', 'opponent', 'snapshot']);
  });

  it('ignores a beat from a socket whose seat somebody else now holds', () => {
    const table = emptyTable();

    const left = openSocket(table);
    // The seat goes back the only way a seat goes back, and this browser's end
    // of the socket is still perfectly able to speak.
    left.peer.fail();

    const arrived = openSocket(table);
    expect(slotOf(arrived)).toBe('left');

    // Halfway to the new occupant's deadline, the socket that used to hold the
    // seat beats. The deadline it must not move is somebody else's.
    vi.advanceTimersByTime(TIMEOUT_MS / 2);
    beat(left);

    // Past the new occupant's own deadline, and short of the one that beat
    // would have bought them if it had counted.
    vi.advanceTimersByTime(TIMEOUT_MS / 2);

    // So the seat is taken back on the schedule the occupant's own silence set.
    // Were the orphaned socket able to speak for this seat, it could hold a
    // table for a browser that has gone for as long as it kept beating.
    expect(arrived.closes).toEqual([HUNG_UP]);
  });
});
