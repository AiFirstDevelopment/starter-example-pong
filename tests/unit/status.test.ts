import { describe, expect, it } from 'vitest';

import { createState, type GameState } from '../../src/game/state';
import { choosing, singlePlayer, type Session } from '../../src/session';
import { sessionStatusText, statusText } from '../../src/status';

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

describe('sessionStatusText at a table', () => {
  const table: Session = {
    mode: 'table',
    tableId: 'Johnny-13224',
    slot: 'left',
    connection: 'connecting',
  };

  it('asks the player to choose before either game has been picked', () => {
    expect(sessionStatusText(createState(1), choosing())).toBe(
      'Choose single player, or join a table by its id',
    );
  });

  it('leaves the one-player game exactly as it was', () => {
    expect(sessionStatusText(createState(1), singlePlayer())).toBe(
      statusText(createState(1)),
    );
    expect(sessionStatusText(finished('cpu'), singlePlayer())).toBe(
      'Computer wins! Press any key to play again',
    );
  });

  it('names the table on the way in', () => {
    expect(sessionStatusText(createState(1), table)).toBe('Joining table Johnny-13224…');
  });

  it('says which paddle is theirs while there is nobody to play', () => {
    expect(
      sessionStatusText(createState(1), { ...table, connection: 'waiting' }),
    ).toBe('You have the left paddle. Waiting for another player at table Johnny-13224.');
    expect(
      sessionStatusText(createState(1), { ...table, slot: 'right', connection: 'waiting' }),
    ).toBe('You have the right paddle. Waiting for another player at table Johnny-13224.');
  });

  it('says the table is in use when two people already have it', () => {
    expect(sessionStatusText(createState(1), { ...table, connection: 'refused' })).toBe(
      'Table Johnny-13224 is in use. Agree another id and try that one.',
    );
  });

  it('says the opponent left, and that the table is waiting again', () => {
    expect(
      sessionStatusText(createState(1), { ...table, connection: 'opponent-left' }),
    ).toBe('Your opponent left. Waiting for another player at table Johnny-13224.');
  });

  it('says the connection went, which is not the same as being refused', () => {
    expect(sessionStatusText(createState(1), { ...table, connection: 'lost' })).toBe(
      'Lost the connection to table Johnny-13224.',
    );
  });

  it('says nothing while the ball is in play', () => {
    expect(
      sessionStatusText({ ...createState(1), phase: 'rally' }, { ...table, connection: 'playing' }),
    ).toBe('');
  });

  it('announces the winner from the side of the court the player is on', () => {
    const playing = { ...table, connection: 'playing' as const };
    expect(sessionStatusText(finished('player'), playing)).toBe('You win!');
    expect(sessionStatusText(finished('cpu'), playing)).toBe('Your opponent wins!');
    expect(sessionStatusText(finished('player'), { ...playing, slot: 'right' })).toBe(
      'Your opponent wins!',
    );
    expect(sessionStatusText(finished('cpu'), { ...playing, slot: 'right' })).toBe('You win!');
  });
});
