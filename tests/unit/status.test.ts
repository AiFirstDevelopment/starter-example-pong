import { describe, expect, it } from 'vitest';

import { createState, type GameState } from '../../src/game/state';
import { statusText } from '../../src/status';

function finished(winner: GameState['winner']): GameState {
  return { ...createState(1), phase: 'game-over', winner };
}

describe('statusText', () => {
  it('asks the player to start before the first serve', () => {
    expect(statusText(createState(1))).toBe('Press any key to start');
  });

  it('says nothing while the ball is in play', () => {
    expect(statusText({ ...createState(1), phase: 'rally' })).toBe('');
    expect(statusText({ ...createState(1), phase: 'serving' })).toBe('');
  });

  it('announces the winner, whichever side won', () => {
    expect(statusText(finished('player'))).toBe('You win! Press any key to play again');
    expect(statusText(finished('cpu'))).toBe(
      'Computer wins! Press any key to play again',
    );
  });
});
