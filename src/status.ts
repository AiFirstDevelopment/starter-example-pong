/**
 * The line under the court: the start prompt, or who won.
 *
 * It is a pure function of the state so both endings can be checked. Only one
 * of them is reachable in a behavioural test — a player win takes eleven points
 * of rallying — and an unannounced win is exactly the kind of thing that would
 * otherwise ship unnoticed.
 */

import type { GameState } from './game/state';
import type { Slot } from './net/protocol';
import type { Session } from './session';

export function statusText(state: GameState): string {
  if (state.phase === 'idle') {
    return 'Press any key to start';
  }
  if (state.phase === 'game-over') {
    const winner = state.winner === 'player' ? 'You win!' : 'Computer wins!';
    return `${winner} Press any key to play again`;
  }
  return '';
}

/** Which paddle this player was given, said out loud. */
function sideLine(slot: Slot | null): string {
  if (slot === null) {
    return '';
  }
  return `You have the ${slot} paddle. `;
}

/** Who won, from this player's side of the court. */
function winnerLine(state: GameState, slot: Slot | null): string {
  const wonBy: Slot = state.winner === 'player' ? 'left' : 'right';
  return wonBy === slot ? 'You win!' : 'Your opponent wins!';
}

/**
 * The line under the court while playing at a table.
 *
 * Everything a table can say that a single-player game cannot: who has which
 * paddle, that nobody else is here yet, that the table was already taken, that
 * the other player has gone. It is a pure function of the state and the session
 * for the same reason `statusText` is — most of these are reached only by two
 * browsers doing something to each other, and an unannounced one would ship.
 */
export function tableStatusText(state: GameState, session: Session): string {
  const table = session.tableId ?? '';
  switch (session.connection) {
    case 'connecting':
      return `Joining table ${table}…`;
    case 'waiting':
      return `${sideLine(session.slot)}Waiting for another player at table ${table}.`;
    case 'opponent-left':
      return `Your opponent left. Waiting for another player at table ${table}.`;
    case 'refused':
      return `Table ${table} is in use. Agree another id and try that one.`;
    case 'lost':
      return `Lost the connection to table ${table}.`;
    case 'playing':
      return state.phase === 'game-over' ? winnerLine(state, session.slot) : '';
    default:
      return '';
  }
}

/** The line under the court, whichever game is being played — or none yet. */
export function sessionStatusText(state: GameState, session: Session): string {
  if (session.mode === 'choosing') {
    return 'Choose single player, or join a table by its id';
  }
  if (session.mode === 'table') {
    return tableStatusText(state, session);
  }
  return statusText(state);
}
