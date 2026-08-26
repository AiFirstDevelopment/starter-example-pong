/**
 * Wires the pieces together: keyboard in, simulation forward, court and score
 * out. The simulation runs on a fixed timestep so a rally plays out the same
 * way whatever the frame rate.
 */

import { createAudio, soundFor } from './audio';
import { createKeyboard } from './input';
import { render } from './render';
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

const context = courtContext(element<HTMLCanvasElement>('court'));

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
  if (state.phase === 'idle') {
    status.textContent = 'Press any key to start';
  } else if (state.phase === 'game-over') {
    const winner = state.winner === 'player' ? 'You win!' : 'Computer wins!';
    status.textContent = `${winner} Press any key to play again`;
  } else {
    status.textContent = '';
  }
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

const keyboard = createKeyboard(window, { onStart: start, onToggleMute: toggleMute });
muteButton.addEventListener('click', () => {
  toggleMute();
  // Otherwise the next key press activates the focused button as well.
  muteButton.blur();
});

let previous: number | null = null;
let accumulator = 0;

function frame(now: number): void {
  accumulator = Math.min(accumulator + (now - (previous ?? now)), MAX_FRAME_MS);
  previous = now;

  const input = keyboard.input();
  while (accumulator >= FIXED_DT_MS) {
    accumulator -= FIXED_DT_MS;
    const result = step(state, FIXED_DT_MS, input);
    state = result.state;
    for (const event of result.events) {
      handle(event);
    }
  }

  render(context, state);
  window.requestAnimationFrame(frame);
}

showScore();
showStatus();
showMute();
// Draw the still court straight away, rather than leaving a blank canvas until
// the first animation frame arrives.
render(context, state);
window.requestAnimationFrame(frame);
