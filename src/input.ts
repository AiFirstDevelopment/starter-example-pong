/**
 * Input handling — the only place key and pointer events are read.
 *
 * Movement keys are held, so they are tracked as state the loop samples each
 * tick; starting the game and toggling sound happen on the press itself. A
 * pointer — a mouse, a finger, a pen — is different in kind: it names a place
 * rather than a direction, so what is tracked is the last place it pointed at,
 * in court coordinates.
 */

import { COURT_HEIGHT } from './game/state';
import type { Input } from './game/step';

export interface ControlHandlers {
  /**
   * Any key that is not a movement or sound key starts the game, and so does a
   * click on the court or a finger landing on it.
   */
  onStart: () => void;
  onToggleMute: () => void;
}

export interface Controls {
  /** What the player is asking for right now. */
  input: () => Input;
}

/** A canvas's box on screen, as `getBoundingClientRect` reports it. */
export interface CourtBox {
  top: number;
  height: number;
}

const UP_KEYS = new Set(['arrowup', 'w']);
const DOWN_KEYS = new Set(['arrowdown', 's']);
const MUTE_KEYS = new Set(['m']);
/** Keys whose default action scrolls the court out from under the player. */
const SCROLL_KEYS = new Set(['arrowup', 'arrowdown', ' ', 'pageup', 'pagedown']);

/**
 * Where a pointer at viewport `clientY` is pointing, in court pixels.
 *
 * The court is `COURT_HEIGHT` pixels tall inside the canvas and whatever the
 * stylesheet makes of it on screen, and the page is responsive — the two agree
 * at one window width and nowhere else. Going through the box rather than
 * subtracting its top alone is what puts the paddle under the pointer at every
 * other width.
 *
 * The answer is not clamped: above the canvas it comes back negative and below
 * it comes back past `COURT_HEIGHT`, and `step` holds it inside the court the
 * same way it holds a held key inside it.
 */
export function courtY(clientY: number, box: CourtBox): number {
  return ((clientY - box.top) * COURT_HEIGHT) / box.height;
}

/**
 * Whether a pointer that has just moved may drive the paddle.
 *
 * The mouse may, wherever it is: there is one cursor, it has nothing else to do
 * on this page, and the paddle has to keep following it once the player asks for
 * the top or the bottom of the court and the cursor leaves the canvas.
 *
 * A finger may not. A drag that started on the hint text is the player scrolling
 * the page, and taking the paddle with it would leave the mute button
 * unreachable on a phone, where the page is taller than the screen. So a finger
 * drives the paddle only when the gesture began on the court — which is what
 * `startedOnCourt` reports, and it stays true for the whole drag: the browser's
 * implicit pointer capture keeps a touch's target on the canvas however far the
 * finger wanders off it.
 */
export function drivesPaddle(pointerType: string, startedOnCourt: boolean): boolean {
  return pointerType === 'mouse' || startedOnCourt;
}

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

export function createControls(
  target: Window,
  court: HTMLCanvasElement,
  handlers: ControlHandlers,
): Controls {
  const held = new Set<string>();
  /** Where the pointer last asked for the paddle, or null while the keys have it. */
  let targetY: number | null = null;

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
      if (!event.repeat) {
        // The most recent input wins, so reaching for the arrows takes the
        // paddle back off the pointer. Auto-repeat is not a fresh press: a key
        // held down while the pointer moves would otherwise snatch it back
        // thirty times a second and the two would fight.
        targetY = null;
      }
    }
    if (!event.repeat) {
      handlers.onStart();
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(keyName(event));
  };

  /** A key held while the tab loses focus never sends its keyup. */
  const onBlur = (): void => {
    held.clear();
  };

  /**
   * On `window`, not on the canvas, so the paddle keeps following a pointer
   * that has left the court — which is where it goes the moment the player
   * asks for the top or the bottom of the court.
   *
   * `pointermove` rather than `mousemove`: a mouse, a finger and a pen all
   * arrive here, all naming a place on the court in the same coordinates, and
   * `drivesPaddle` decides which of them this one is allowed to name.
   */
  const onPointerMove = (event: PointerEvent): void => {
    if (!drivesPaddle(event.pointerType, event.target === court)) {
      return;
    }
    const box = court.getBoundingClientRect();
    if (box.height <= 0) {
      // A court with no height on screen has no scale to map through, and
      // dividing by it would strand the paddle at NaN for the rest of the game.
      return;
    }
    targetY = courtY(event.clientY, box);
  };

  /**
   * Moving the mouse is not a gesture a browser will start an `AudioContext`
   * from, so without this a mouse-only player has a game they cannot start and
   * would not hear if they could.
   */
  const onClick = (): void => {
    handlers.onStart();
  };

  /**
   * A finger landing on the court starts the game.
   *
   * On the way down, and without asking how far it then travels. Dragging the
   * paddle is the first thing a player does on a phone, and a start that waited
   * for the lift would throw that whole drag away: the game would still be idle
   * underneath it, `step` would hand the court straight back, and the paddle
   * would sit where it was until a second gesture arrived. That is the reported
   * bug, and closing it deliberately supersedes `mobile-touch-controls` AC6,
   * which required a drag to start nothing. A tap still starts the game, because
   * a tap begins with a `pointerdown` too — which is what makes the tap-slop
   * rule that used to live here unnecessary rather than merely relaxed.
   *
   * The gesture is also what a browser wants before it will make a sound, and a
   * touch `pointerdown` carries user activation of its own: the audio context
   * `onStart` unlocks starts from a drag exactly as it does from a tap.
   *
   * The mouse is left to `click`, and that is the whole of what keeps a mouse
   * behaving as it always has — it has a button, so moving it over an idle court
   * still starts nothing and pressing it still does.
   */
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') {
      return;
    }
    handlers.onStart();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  target.addEventListener('pointermove', onPointerMove);
  court.addEventListener('click', onClick);
  // On the court, not on the window: a finger that lands on the hint text is
  // the player scrolling the page, and it starts no more of a game than it
  // drives a paddle.
  court.addEventListener('pointerdown', onPointerDown);

  return {
    input: () => {
      let up = false;
      let down = false;
      for (const key of held) {
        up = up || UP_KEYS.has(key);
        down = down || DOWN_KEYS.has(key);
      }
      return { up, down, targetY };
    },
  };
}
