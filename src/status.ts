/**
 * The line under the court: the start prompt, or who won.
 *
 * It is a pure function of the state so both endings can be checked. Only one
 * of them is reachable in a behavioural test — a player win takes eleven points
 * of rallying — and an unannounced win is exactly the kind of thing that would
 * otherwise ship unnoticed.
 */

import type { GameState } from './game/state';

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
