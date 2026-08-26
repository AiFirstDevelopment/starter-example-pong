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
}

const UP_KEYS = new Set(['arrowup', 'w']);
const DOWN_KEYS = new Set(['arrowdown', 's']);
const MUTE_KEYS = new Set(['m']);
/** Keys whose default action scrolls the court out from under the player. */
const SCROLL_KEYS = new Set(['arrowup', 'arrowdown', ' ', 'pageup', 'pagedown']);

/**
 * One name per physical key, on the way down and on the way up alike.
 *
 * `event.key` carries the shifted form, so a `w` pressed with Shift held
 * arrives as `W` and — once Shift is released — leaves as `w`. Matched by their
 * raw names those two never cancel, and the key stays in `held` for the rest of
 * the game, driving the paddle into the wall with no way back.
 */
function keyName(event: KeyboardEvent): string {
  return event.key.toLowerCase();
}

export function createKeyboard(target: Window, handlers: KeyboardHandlers): Keyboard {
  const held = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = keyName(event);
    // Space on a focused control is that control's business: it has to keep
    // working the mute button for a player using the keyboard.
    const activatesControl = key === ' ' && event.target instanceof HTMLButtonElement;
    if (SCROLL_KEYS.has(key) && !activatesControl) {
      // Otherwise the arrows and the Space that starts the game scroll the
      // page, taking the score and the top of the court off screen.
      event.preventDefault();
    }
    if (MUTE_KEYS.has(key)) {
      if (!event.repeat) {
        handlers.onToggleMute();
      }
      return;
    }
    if (UP_KEYS.has(key) || DOWN_KEYS.has(key)) {
      held.add(key);
    }
    if (!event.repeat) {
      handlers.onStart(event);
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(keyName(event));
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
  };
}
