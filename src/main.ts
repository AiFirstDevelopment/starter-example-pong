/**
 * Wires the pieces together: keys and mouse in, simulation forward, court and
 * score out. The simulation runs on a fixed timestep so a rally plays out the
 * same way whatever the frame rate, and the court is drawn between two ticks so
 * it moves evenly whatever the frame rate too.
 */

import { createAudio, soundFor } from './audio';
import { createControls } from './input';
import { interpolate, render } from './render';
import { statusText } from './status';
import { readSeed } from './game/rng';
import { createState, startGame, type GameState } from './game/state';
import { step, type GameEvent } from './game/step';

const FIXED_DT_MS = 1000 / 120;
/** A backgrounded tab returns with a huge gap; do not simulate all of it. */
const MAX_FRAME_MS = 250;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`missing element #${id}`);
  }
  return found as T;
}

function courtContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const found = canvas.getContext('2d');
  if (found === null) {
    throw new Error('this browser cannot draw on a canvas');
  }
  return found;
}

const court = element<HTMLCanvasElement>('court');
const context = courtContext(court);

const playerScore = element('player-score');
const cpuScore = element('cpu-score');
const status = element('status');
const muteButton = element<HTMLButtonElement>('mute');

const audio = createAudio();
let state: GameState = createState(readSeed(window.location.search));

function showScore(): void {
  playerScore.textContent = String(state.score.player);
  cpuScore.textContent = String(state.score.cpu);
}

function showStatus(): void {
  status.textContent = statusText(state);
}

function showMute(): void {
  const muted = audio.isMuted();
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.textContent = muted ? 'Sound off' : 'Sound on';
}

function toggleMute(): void {
  audio.setMuted(!audio.isMuted());
  showMute();
}

function start(): void {
  if (state.phase !== 'idle' && state.phase !== 'game-over') {
    return;
  }
  // Browsers only allow audio to start from a gesture, and this is the gesture.
  audio.unlock();
  state = startGame(state);
  showScore();
  showStatus();
}

function handle(event: GameEvent): void {
  const sound = soundFor(event);
  if (sound !== null) {
    audio.play(sound);
  }
  if (event.kind === 'point-scored') {
    showScore();
  }
  if (event.kind === 'game-over') {
    showStatus();
  }
}

const controls = createControls(window, court, {
  onStart: start,
  onToggleMute: toggleMute,
});
muteButton.addEventListener('click', () => {
  toggleMute();
  // Otherwise the next key press activates the focused button as well.
  muteButton.blur();
});

let previousFrameMs: number | null = null;
let accumulator = 0;
/** The tick before `state`, kept only so the court can be drawn between them. */
let previousState: GameState = state;

function frame(now: number): void {
  accumulator = Math.min(
    accumulator + (now - (previousFrameMs ?? now)),
    MAX_FRAME_MS,
  );
  previousFrameMs = now;

  const input = controls.input();
  while (accumulator >= FIXED_DT_MS) {
    accumulator -= FIXED_DT_MS;
    previousState = state;
    const result = step(state, FIXED_DT_MS, input);
    state = result.state;
    for (const event of result.events) {
      handle(event);
    }
  }

  // Whatever is left in the accumulator is how far past the last tick this
  // frame is, and it is always less than one tick.
  render(context, interpolate(previousState, state, accumulator / FIXED_DT_MS));
  window.requestAnimationFrame(frame);
}

showScore();
showStatus();
showMute();
// Draw the still court straight away, rather than leaving a blank canvas until
// the first animation frame arrives.
render(context, state);
window.requestAnimationFrame(frame);
