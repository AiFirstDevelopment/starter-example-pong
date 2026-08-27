/**
 * Who gets which paddle at a table, and who is turned away.
 *
 * A table id is a rendezvous string and nothing more: two people agree on one
 * and whoever arrives first plays. That makes the whole of matchmaking a single
 * question — which of the two paddles, if either, is free — and the answer is a
 * pure function of what is already held. It lives here, apart from the Durable
 * Object and its sockets, so the rule that a third arrival is refused can be
 * checked without a network.
 */

import type { Slot } from '../src/net/protocol';

/**
 * The paddle an arriving player gets, or `null` when both are taken.
 *
 * Left first, then right, so the first to arrive drives the left paddle and the
 * second the right. A slot freed by a player leaving is handed straight back
 * out — that is what makes a disconnect free the table rather than retire it.
 */
export function assignSlot(taken: Iterable<Slot>): Slot | null {
  const held = new Set(taken);
  if (!held.has('left')) {
    return 'left';
  }
  if (!held.has('right')) {
    return 'right';
  }
  return null;
}
