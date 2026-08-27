/**
 * Wires the pieces together: keys and mouse in, simulation forward, court and
 * score out. The simulation runs on a fixed timestep so a rally plays out the
 * same way whatever the frame rate, and the court is drawn between two ticks so
 * it moves evenly whatever the frame rate too.
 *
 * There are two games to wire, and they differ in exactly one place: who runs
 * `step()`. Single player runs it here, in this tab, against the computer, and
 * is what it has always been. A table runs it on the server, and this tab draws
 * what the server sends — everything but its own paddle, which it draws from its
 * own input so that a player never waits for a round trip to see their own hand.
 */

import { createAudio, soundFor } from './audio';
import { createControls } from './input';
import { joinTable, type TableSocket } from './net/table';
import { FIXED_DT_MS, SNAPSHOT_INTERVAL_MS } from './net/protocol';
import { interpolate, render } from './render';
import { readSession, singlePlayer, type Session } from './session';
import { sessionStatusText } from './status';
import { readSeed } from './game/rng';
import { createState, startGame, type GameState } from './game/state';
import { movePaddle, step, type GameEvent } from './game/step';

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
const playerLabel = element('player-label');
const cpuLabel = element('cpu-label');
const status = element('status');
const muteButton = element<HTMLButtonElement>('mute');
const chooser = element<HTMLFormElement>('choose');
const singleButton = element<HTMLButtonElement>('play-single');
const tableIdInput = element<HTMLInputElement>('table-id');

const audio = createAudio();
let state: GameState = createState(readSeed(window.location.search));
let session: Session = readSession(window.location.search);

/**
 * The score, written only when it has changed.
 *
 * Single player only calls this when a point is scored, but a table calls it on
 * every snapshot — thirty times a second. Writing the same string back replaces
 * the text node either way, and the scoreboard is an `aria-live` region: a
 * screen reader would be told the score thirty times a second for the whole
 * game.
 */
function showScore(): void {
  const player = String(state.score.player);
  const cpu = String(state.score.cpu);
  if (playerScore.textContent !== player) {
    playerScore.textContent = player;
  }
  if (cpuScore.textContent !== cpu) {
    cpuScore.textContent = cpu;
  }
}

/**
 * The line under the court, written only when it has changed.
 *
 * Guarded for the same reason `showScore` is. Single player only calls this
 * when something happens, but a table calls it on every snapshot — thirty times
 * a second — and `#status` is a `role="status"` live region: rewriting the same
 * string would have a screen reader read it out thirty times a second.
 */
function showStatus(): void {
  const line = sessionStatusText(state, session);
  if (status.textContent !== line) {
    status.textContent = line;
  }
}

/**
 * Who is on each end of the scoreboard.
 *
 * At a table there is no computer, and which paddle is this player's is a thing
 * they have to be told (AC3). The scoreboard is where it goes: it mirrors the
 * court, so the left-hand name is the left-hand paddle, and it is on screen for
 * the whole game rather than only until the next message replaces it.
 */
function showLabels(): void {
  if (session.mode !== 'table') {
    return;
  }
  if (session.slot === null) {
    playerLabel.textContent = 'Left';
    cpuLabel.textContent = 'Right';
    return;
  }
  playerLabel.textContent = session.slot === 'left' ? 'You' : 'Opponent';
  cpuLabel.textContent = session.slot === 'left' ? 'Opponent' : 'You';
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

/**
 * A key press, a click or a tap.
 *
 * In single player it is what starts the game, as it always has been. At a
 * table it is not the player's to decide — the server starts a game when the
 * second player arrives — but it is still the gesture a browser wants before it
 * will make a sound, so the audio is unlocked either way. With nothing chosen
 * yet it does nothing at all: the game does not start until a mode is picked.
 */
function start(): void {
  if (session.mode === 'choosing') {
    return;
  }
  // Browsers only allow audio to start from a gesture, and this is the gesture.
  audio.unlock();
  if (session.mode !== 'single') {
    return;
  }
  if (state.phase !== 'idle' && state.phase !== 'game-over') {
    return;
  }
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

/* ---------------------------------------------------------------- one player */

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
    // `null` for the right-hand paddle: single player leaves that side to the
    // computer, at the computer's own speed.
    const result = step(state, FIXED_DT_MS, input, null);
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

/**
 * One game gets started, and only one.
 *
 * Two frame loops on the same state would simulate every tick twice, and there
 * is more than one way to ask for a second: a chooser button that keeps focus,
 * a double click, a page that names a mode in the url and is then asked again.
 */
let started = false;

function startSinglePlayer(): void {
  if (started) {
    return;
  }
  started = true;
  session = singlePlayer();
  hideChooser();
  showStatus();
  window.requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------- a table */

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function startTable(tableId: string): void {
  if (started) {
    return;
  }
  started = true;
  hideChooser();
  showLabels();
  showStatus();

  /** The last two snapshots, drawn between exactly as two ticks are. */
  let previous: GameState = state;
  let current: GameState = state;
  let arrivedMs = 0;
  /**
   * Where this player's own paddle is, kept here rather than taken from the
   * server (AC5).
   *
   * A paddle is a pure function of what its player asked for, and both ends
   * compute it with the same `movePaddle`, so drawing it at once is not a guess
   * about the future — it is the same answer the server will reach when the
   * input gets there. `null` until the first snapshot says where it started.
   */
  let ownY: number | null = null;
  let lastFrameMs: number | null = null;

  const socket: TableSocket = joinTable(tableId, {
    onWelcome: (slot) => {
      session = { ...session, slot, connection: 'waiting' };
      showLabels();
      showStatus();
    },
    onOpponent: (present) => {
      const connection = present
        ? 'playing'
        : session.connection === 'playing'
          ? 'opponent-left'
          : 'waiting';
      session = { ...session, connection };
      showStatus();
    },
    onSnapshot: (next, events) => {
      previous = current;
      current = next;
      arrivedMs = performance.now();
      state = next;
      showScore();
      // The line is a function of the snapshot too, not only of the connection:
      // a table's win is announced from the state, and a game that starts again
      // — a seat refilled after one was won — has to take the announcement back.
      showStatus();
      for (const event of events) {
        handle(event);
      }
    },
    onRefused: () => {
      session = { ...session, connection: 'refused' };
      showStatus();
    },
    onLost: () => {
      session = { ...session, connection: 'lost' };
      showStatus();
    },
  });

  function tableFrame(now: number): void {
    const dtMs = Math.min(now - (lastFrameMs ?? now), MAX_FRAME_MS);
    lastFrameMs = now;

    const input = controls.input();
    socket.report(input, now);

    // Between the last two snapshots, the same way the one-player loop draws
    // between the last two ticks — `interpolate` does not care that these are
    // 33 ms apart rather than 8. Clamped, so a snapshot that is late holds the
    // court where it is instead of throwing it forward into a guess.
    const alpha = arrivedMs === 0 ? 1 : clamp((now - arrivedMs) / SNAPSHOT_INTERVAL_MS, 0, 1);
    const drawn = interpolate(previous, current, alpha);

    if (session.slot !== null) {
      const fromServer = session.slot === 'left' ? current.playerY : current.cpuY;
      if (input.targetY === null && !input.up && !input.down) {
        // Nothing is being asked for, so there is nothing to be ahead of: the
        // server's answer is the whole answer, and taking it here is what stops
        // a held key's echo drifting away from it for good.
        ownY = fromServer;
      } else {
        ownY = movePaddle(ownY ?? fromServer, input, dtMs / 1000);
      }
      if (session.slot === 'left') {
        drawn.playerY = ownY;
      } else {
        drawn.cpuY = ownY;
      }
    }

    render(context, drawn);
    window.requestAnimationFrame(tableFrame);
  }

  window.requestAnimationFrame(tableFrame);
}

/* ------------------------------------------------------------- the choice */

function hideChooser(): void {
  chooser.hidden = true;
}

singleButton.addEventListener('click', () => {
  // The click that chooses is also the gesture a browser wants before it will
  // make a sound, and the player may never press a key.
  audio.unlock();
  startSinglePlayer();
});

chooser.addEventListener('submit', (event) => {
  event.preventDefault();
  const chosen = readSession(`?table=${encodeURIComponent(tableIdInput.value)}`);
  if (chosen.mode !== 'table' || chosen.tableId === null) {
    return;
  }
  audio.unlock();
  session = chosen;
  startTable(chosen.tableId);
});

showScore();
showStatus();
showMute();
showLabels();
// Draw the still court straight away, rather than leaving a blank canvas until
// the first animation frame arrives.
render(context, state);

if (session.mode === 'single') {
  startSinglePlayer();
} else if (session.mode === 'table' && session.tableId !== null) {
  startTable(session.tableId);
} else {
  chooser.hidden = false;
}
