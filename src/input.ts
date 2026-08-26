/**
 * Keyboard handling — the only place key events are read.
 *
 * Movement keys are held, so they are tracked as state the loop samples each
 * tick; starting the game and toggling sound happen on the press itself.
 */

import type { Input } from './game/step';

export interface KeyboardHandlers {
  /** Any key that is not a movement or sound key still starts the game. */
  onStart: (event: KeyboardEvent) => void;
  onToggleMute: () => void;
}

export interface Keyboard {
  /** What the player is holding right now. */
  input: () => Input;
  dispose: () => void;
}

const UP_KEYS = new Set(['ArrowUp', 'w', 'W']);
const DOWN_KEYS = new Set(['ArrowDown', 's', 'S']);
const MUTE_KEYS = new Set(['m', 'M']);

export function createKeyboard(target: Window, handlers: KeyboardHandlers): Keyboard {
  const held = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (MUTE_KEYS.has(event.key)) {
      if (!event.repeat) {
        handlers.onToggleMute();
      }
      return;
    }
    if (UP_KEYS.has(event.key) || DOWN_KEYS.has(event.key)) {
      // Otherwise a held arrow key scrolls the page under the court.
      event.preventDefault();
      held.add(event.key);
    }
    if (!event.repeat) {
      handlers.onStart(event);
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.key);
  };

  /** A key held while the tab loses focus never sends its keyup. */
  const onBlur = (): void => {
    held.clear();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    input: () => {
      let up = false;
      let down = false;
      for (const key of held) {
        up = up || UP_KEYS.has(key);
        down = down || DOWN_KEYS.has(key);
      }
      return { up, down };
    },
    dispose: () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
