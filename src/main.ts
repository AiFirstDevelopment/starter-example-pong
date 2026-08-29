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
import { FIXED_DT_MS, SNAPSHOT_INTERVAL_MS, generateTableId } from './net/protocol';
import { interpolate, render } from './render';
import { atTable, readSession, singlePlayer, tableLink, type Session } from './session';
import { browserTargets, shareLink, shareNote } from './share';
import { sessionStatusText } from './status';
import { readSeed } from './game/rng';
import { createState, startGame, type GameState } from './game/state';
import { movePaddle, step, type GameEvent } from './game/step';

/** A backgrounded tab returns with a huge gap; do not simulate all of it. */
const MAX_FRAME_MS = 250;

/**
 * Whether this is a device a finger is used on.
 *
 * Only the line under the court asks: a phone has no key to press, so it is
 * told to touch the court instead (AC3). `maxTouchPoints` rather than
 * `'ontouchstart' in window`, which is false on a Chrome emulating a phone and
 * so would tell exactly the device this exists for to press a key.
 *
 * Read once, at load. A device does not grow a touchscreen mid-game, and the
 * status line is written thirty times a second at a table.
 */
const TOUCH = navigator.maxTouchPoints > 0;

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
const createButton = element<HTMLButtonElement>('create-table');
const tableIdInput = element<HTMLInputElement>('table-id');
const invite = element('invite');
const inviteUrl = element('invite-url');
const inviteShare = element<HTMLButtonElement>('invite-share');
const inviteNote = element('invite-note');

const audio = createAudio();
let state: GameState = createState(readSeed(window.location.search));
let session: Session = readSession(window.location.search);
/**
 * The socket to the table, once there is one.
 *
 * Up here rather than inside `startTable` because the gesture that asks for
 * another game is read by the controls, which are wired before any table is
 * joined, and there is only ever one table to ask.
 */
let table: TableSocket | null = null;

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
  const line = sessionStatusText(state, session, TOUCH);
  if (status.textContent !== line) {
    status.textContent = line;
  }
  // The link belongs to the same moment as the line above it — it appears while
  // the line says somebody is being waited for, and goes when it stops saying
  // so — so it is written here rather than from the eight other places the line
  // is, where one of them would sooner or later be forgotten.
  showInvite();
}

/** Whether this page is at a table with nobody on the other paddle. */
function waitingForAnother(): boolean {
  return (
    session.mode === 'table' &&
    (session.connection === 'waiting' || session.connection === 'opponent-left')
  );
}

/**
 * The way in to this table, while there is a seat at it (AC7).
 *
 * Guarded like `showStatus` and for the same reason: a table calls this thirty
 * times a second, and rewriting the same URL back would have a screen reader
 * announce the note beside it that often. Only while waiting — a table two
 * people are already playing at has nothing to offer a third, and a page that
 * was refused one has no link to give away.
 */
function showInvite(): void {
  const url =
    waitingForAnother() && session.tableId !== null
      ? tableLink(window.location, session.tableId)
      : '';
  if (inviteUrl.textContent !== url) {
    inviteUrl.textContent = url;
  }
  if (invite.hidden === (url !== '')) {
    invite.hidden = url === '';
    // Whatever the last attempt to share said, it was about a link that is no
    // longer the one on screen.
    inviteNote.textContent = '';
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
 * table the game is the server's to start, so the same gesture asks for one
 * instead — which is how two people who have played to eleven get another game
 * without either of them leaving. It is also the gesture a browser wants before
 * it will make a sound, so the audio is unlocked either way. With nothing
 * chosen yet it does nothing at all: the game does not start until a mode is
 * picked.
 */
function start(): void {
  if (session.mode === 'choosing') {
    return;
  }
  // Browsers only allow audio to start from a gesture, and this is the gesture.
  audio.unlock();
  if (state.phase !== 'idle' && state.phase !== 'game-over') {
    return;
  }
  if (session.mode === 'table') {
    // Asked for, not done: nothing here draws a court or clears a score. The
    // answer arrives as the next snapshot, the same way every other change to a
    // table's game does, and the table is free to ignore the question.
    table?.rematch();
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

  table = joinTable(tableId, {
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
    table?.report(input, now);

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

/**
 * A table nobody had to agree on first (AC5).
 *
 * The id is minted here and joined immediately, and minting it claims nothing:
 * the first two sockets take the table exactly as they do for an id typed into
 * the field beside this button. What the player gets that they did not have
 * before is a URL to send, which appears the moment the table says they are
 * waiting.
 */
createButton.addEventListener('click', () => {
  // The click that chooses is the gesture a browser wants before it will make a
  // sound, exactly as it is for the button beside this one.
  audio.unlock();
  const tableId = generateTableId();
  session = atTable(tableId);
  startTable(tableId);
  // The address bar names the table, which is what it already does for the
  // player who arrived on a link — this puts a minted id on the same footing
  // rather than adding anything new. Without it the id lives only in this
  // page's DOM: a reload drops the player back at the chooser with it gone,
  // and a phone reloads a backgrounded tab as a matter of course, which is
  // exactly what sending somebody the link asks the player to leave and do.
  // The obvious recovery then mints a *different* table, and the friend who
  // was sent the first link waits at it for as long as they are willing to.
  //
  // `replaceState`, not `pushState`: this is the same page answering a
  // question, not somewhere Back should return from. Nothing re-reads the
  // search string after load, so rewriting it now cannot affect this page.
  //
  // Last, after the table has been joined, so that the one thing that can
  // refuse it — a document whose origin is not one `replaceState` will accept —
  // costs the address bar rather than the button.
  window.history.replaceState(null, '', tableLink(window.location, tableId));
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

/* --------------------------------------------------------- sending the link */

/**
 * What this browser can do with a link, read once.
 *
 * The button says which of them it will do, because a control labelled "Copy
 * link" that opens a share sheet has told the player something untrue about
 * what is about to happen to their link.
 */
const shareTargets = browserTargets(navigator);
if (shareTargets.share !== undefined) {
  inviteShare.textContent = 'Share link';
}

inviteShare.addEventListener('click', () => {
  const url = inviteUrl.textContent ?? '';
  if (url === '') {
    return;
  }
  void shareLink(url, shareTargets).then((outcome) => {
    inviteNote.textContent = shareNote(outcome);
  });
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
