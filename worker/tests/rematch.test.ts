/**
 * Who may ask a table for another game.
 *
 * `Table.rematch` checks that the socket asking is the one holding the seat it
 * is asking about. From a browser that check can never fire: a seat is freed
 * only when its socket closes or errors, so by the time somebody else has the
 * seat the socket that used to hold it is gone. It fires here, because the pair
 * is the test's and an error on the server end frees the seat while the browser
 * end can still speak.
 *
 * That is what the check is for. A player who has left, or a third browser that
 * was turned away, must not be able to restart a game belonging to two other
 * people.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Table, type Env } from '../table';
import { FakeSocket, installWorkersRuntime, messages, openSocket } from './support/workers';

let runtime: { restore: () => void };

beforeEach(() => {
  runtime = installWorkersRuntime();
  // The table arms a timer whenever it is left empty, and vitest would sit and
  // wait for it. Nothing here needs a timer to fire, so none does.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  runtime.restore();
});

/**
 * A table nobody has sat down at yet.
 *
 * The `TABLE` binding is never reached: a Durable Object does not address
 * itself, and everything below goes through `Table` rather than the entry.
 */
function emptyTable(): Table {
  const env = { TABLE: undefined as unknown as DurableObjectNamespace } satisfies Env;
  return new Table({} as DurableObjectState, env);
}

/** The kinds of message this end has been told about, in order. */
function kinds(socket: FakeSocket): string[] {
  return messages(socket).map((message) => String(message['kind']));
}

describe('Table.rematch', () => {
  it('ignores a socket whose seat somebody else now holds', () => {
    const table = emptyTable();

    const left = openSocket(table);
    expect(kinds(left)).toEqual(['welcome', 'opponent', 'snapshot']);
    // The seat goes back the only way a seat goes back, and this browser's end
    // of the socket is still perfectly able to speak.
    left.peer.fail();

    const arrived = openSocket(table);
    expect(kinds(arrived)).toEqual(['welcome', 'opponent', 'snapshot']);

    left.send(JSON.stringify({ kind: 'rematch' }));

    // Nothing started, and the player who does hold the seat was not written to.
    expect(kinds(arrived)).toEqual(['welcome', 'opponent', 'snapshot']);
  });

  it('grants one to the socket that does hold the seat', () => {
    const table = emptyTable();
    const seated = openSocket(table);
    expect(kinds(seated)).toEqual(['welcome', 'opponent', 'snapshot']);

    seated.send(JSON.stringify({ kind: 'rematch' }));

    // A court, straight away, and a game that has been started rather than the
    // idle one the table was holding.
    expect(kinds(seated)).toEqual(['welcome', 'opponent', 'snapshot', 'snapshot']);
    const court = messages(seated)[3]?.['state'] as { phase: string };
    expect(court.phase).toBe('serving');
  });
});
