/**
 * Which game is being played, and how the connection to it is doing.
 *
 * Deliberately not part of `GameState`. A rally is a value that replays exactly
 * from a seed, and "the socket is reconnecting" is not part of a rally — folding
 * the two together would put the network inside the thing the network is
 * supposed to be delivering. The simulation stays a pure value; this says what
 * is being done with it.
 */

import { normaliseTableId, type Slot } from './net/protocol';

export type Mode =
  /** Nothing chosen yet: the page is asking. */
  | 'choosing'
  /** One player against the computer, exactly as it has always worked. */
  | 'single'
  /** Two people at a table id, with the server holding the game. */
  | 'table';

export type Connection =
  | 'connecting'
  /** In, on a paddle, with nobody on the other one yet. */
  | 'waiting'
  /** Both paddles held. */
  | 'playing'
  /** Both were held, and the other player has gone. */
  | 'opponent-left'
  /** Two people already had this table. */
  | 'refused'
  /** The socket closed without the table saying why. */
  | 'lost';

export interface Session {
  mode: Mode;
  /** The table id being played at, or `null` away from a table. */
  tableId: string | null;
  /** Which paddle is this player's, or `null` until the table has said. */
  slot: Slot | null;
  /** How the table connection is doing, or `null` when there is no table. */
  connection: Connection | null;
}

export function choosing(): Session {
  return { mode: 'choosing', tableId: null, slot: null, connection: null };
}

export function singlePlayer(): Session {
  return { mode: 'single', tableId: null, slot: null, connection: null };
}

export function atTable(tableId: string): Session {
  return { mode: 'table', tableId, slot: null, connection: 'connecting' };
}

/**
 * The mode this URL already names, if it names one.
 *
 * `?table=<id>` goes straight to that table, which is what makes a table id
 * something two people can send each other rather than only type. `?seed=<n>`
 * means single player: a seed names a replay of the one-player game and means
 * nothing at a table, where the server holds the generator. Anything else — a
 * bare visit — chooses nothing, and the page asks (AC1).
 */
export function readSession(search: string): Session {
  const params = new URLSearchParams(search);

  const table = params.get('table');
  if (table !== null) {
    const tableId = normaliseTableId(table);
    if (tableId !== null) {
      return atTable(tableId);
    }
  }

  const seed = params.get('seed');
  if (seed !== null && seed.trim() !== '') {
    return singlePlayer();
  }

  return choosing();
}
