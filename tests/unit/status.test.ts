import { describe, expect, it } from 'vitest';

import { createState, type GameState } from '../../src/game/state';
import { choosing, singlePlayer, type Session } from '../../src/session';
import { sessionStatusText, statusText } from '../../src/status';

function finished(winner: GameState['winner']): GameState {
  return { ...createState(1), phase: 'game-over', winner };
}

/**
 * The two devices the line is written for: one with keys, one with a finger.
 *
 * Named rather than passed as bare booleans, because `statusText(state, true)`
 * says nothing about which of the two answers is being asked for.
 */
const KEYBOARD = false;
const TOUCH = true;

describe('statusText', () => {
  it('asks the player to start before the first serve', () => {
    expect(statusText(createState(1), KEYBOARD)).toBe('Press any key to start');
  });

  it('says nothing while the ball is in play', () => {
    expect(statusText({ ...createState(1), phase: 'rally' }, KEYBOARD)).toBe('');
    expect(statusText({ ...createState(1), phase: 'serving' }, KEYBOARD)).toBe('');
  });

  it('announces the winner, whichever side won', () => {
    expect(statusText(finished('player'), KEYBOARD)).toBe(
      'You win! Press any key to play again',
    );
    expect(statusText(finished('cpu'), KEYBOARD)).toBe(
      'Computer wins! Press any key to play again',
    );
  });

  it('AC3: names the gesture a touch device has instead of a key it has not', () => {
    expect(statusText(createState(1), TOUCH)).toBe('Touch the court to start');
    // And the same the next time it asks, which on a phone is the moment the
    // player is most likely to be told to press a key they do not have.
    expect(statusText(finished('player'), TOUCH)).toBe(
      'You win! Touch the court to play again',
    );
    expect(statusText(finished('cpu'), TOUCH)).toBe(
      'Computer wins! Touch the court to play again',
    );
  });

  it('AC3: says nothing about touching a court on a device with no touch', () => {
    for (const state of [createState(1), finished('player'), finished('cpu')]) {
      expect(statusText(state, KEYBOARD)).not.toContain('Touch');
    }
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
    expect(sessionStatusText(createState(1), choosing(), KEYBOARD)).toBe(
      'Choose single player, create a table, or join one by its id',
    );
  });

  it('leaves the one-player game exactly as it was', () => {
    expect(sessionStatusText(createState(1), singlePlayer(), KEYBOARD)).toBe(
      statusText(createState(1), KEYBOARD),
    );
    expect(sessionStatusText(finished('cpu'), singlePlayer(), KEYBOARD)).toBe(
      'Computer wins! Press any key to play again',
    );
  });

  it('AC3: carries the device through to the one-player game', () => {
    expect(sessionStatusText(createState(1), singlePlayer(), TOUCH)).toBe(
      'Touch the court to start',
    );
  });

  it('names the table on the way in', () => {
    expect(sessionStatusText(createState(1), table, KEYBOARD)).toBe('Joining table Johnny-13224…');
  });

  it('says which paddle is theirs while there is nobody to play', () => {
    expect(
      sessionStatusText(createState(1), { ...table, connection: 'waiting' }, KEYBOARD),
    ).toBe('You have the left paddle. Waiting for another player at table Johnny-13224.');
    expect(
      sessionStatusText(
        createState(1),
        { ...table, slot: 'right', connection: 'waiting' },
        KEYBOARD,
      ),
    ).toBe('You have the right paddle. Waiting for another player at table Johnny-13224.');
  });

  it('says the table is in use when two people already have it', () => {
    expect(sessionStatusText(createState(1), { ...table, connection: 'refused' }, KEYBOARD)).toBe(
      'Table Johnny-13224 is in use. Agree another id and try that one.',
    );
  });

  it('says the opponent left, and that the table is waiting again', () => {
    expect(
      sessionStatusText(createState(1), { ...table, connection: 'opponent-left' }, KEYBOARD),
    ).toBe('Your opponent left. Waiting for another player at table Johnny-13224.');
  });

  it('says the connection went, which is not the same as being refused', () => {
    expect(sessionStatusText(createState(1), { ...table, connection: 'lost' }, KEYBOARD)).toBe(
      'Lost the connection to table Johnny-13224.',
    );
  });

  it('says nothing while the ball is in play', () => {
    expect(
      sessionStatusText(
        { ...createState(1), phase: 'rally' },
        { ...table, connection: 'playing' },
        KEYBOARD,
      ),
    ).toBe('');
  });

  it('announces the winner from the side of the court the player is on', () => {
    const playing = { ...table, connection: 'playing' as const };
    expect(sessionStatusText(finished('player'), playing, KEYBOARD)).toBe('You win!');
    expect(sessionStatusText(finished('cpu'), playing, KEYBOARD)).toBe('Your opponent wins!');
    expect(sessionStatusText(finished('player'), { ...playing, slot: 'right' }, KEYBOARD)).toBe(
      'Your opponent wins!',
    );
    expect(sessionStatusText(finished('cpu'), { ...playing, slot: 'right' }, KEYBOARD)).toBe('You win!');
  });
});
