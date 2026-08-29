/**
 * The browser's end of a table: one socket, opened, spoken to and listened to.
 *
 * It knows nothing about the court or the DOM. What it does is turn a socket
 * into the four things the game cares about — you are on this paddle, somebody
 * is or is not on the other one, here is the court, and you are not getting in —
 * and take the player's input back the other way at the agreed rate.
 *
 * It also keeps the socket audible. A player who stops moving has no input to
 * report, and a table cannot tell that apart from a browser that has gone unless
 * the browser says so, so this end beats once an interval when it has nothing
 * else to say.
 */

import {
  HEARTBEAT_INTERVAL_MS,
  SNAPSHOT_INTERVAL_MS,
  parseServerMessage,
  type ClientMessage,
  type Slot,
} from './protocol';
import type { GameState } from '../game/state';
import type { GameEvent, Input } from '../game/step';

/**
 * How near the interval a tick has to land to count as the beat being due.
 *
 * A timer set for an interval does not fire exactly on it, and a tick that
 * arrives a hair early has — by its own clock — not quite waited a whole
 * interval since the last thing this socket said. Measured against the whole
 * interval, those ticks are thrown away and the next one is a full interval
 * later: in a real browser that is every other tick, so a beat named once a
 * second goes out every two, and the slack the table's timeout is counting on is
 * halved. Half an interval is the tolerance that fixes it — a tick that is
 * nearly due beats, and a tick that follows something just said still does not.
 */
const BEAT_DUE_MS = HEARTBEAT_INTERVAL_MS / 2;

export interface TableEvents {
  /** Which paddle is this player's. */
  onWelcome: (slot: Slot) => void;
  /** Whether somebody is on the other paddle. */
  onOpponent: (present: boolean) => void;
  /** The court as the server has it, and what happened on the way here. */
  onSnapshot: (state: GameState, events: GameEvent[]) => void;
  /** Two people already had this table. Nothing follows. */
  onRefused: () => void;
  /** The socket went away without the table saying why. */
  onLost: () => void;
}

export interface TableSocket {
  /**
   * Report what the player is asking for.
   *
   * Called every frame; sent at most thirty times a second, and only when the
   * answer has changed. A player holding still reports nothing, and the table
   * goes on applying what they last asked for — what tells the table they are
   * still there is the heartbeat, on its own timer, not this.
   */
  report: (input: Input, now: number) => void;
  /**
   * Ask the table for another game.
   *
   * Only a request: the server holds the game, and it starts one only if this
   * socket has a seat and the last game is over. Sent on the gesture rather
   * than at a rate, because a player presses a key once.
   */
  rematch: () => void;
  close: () => void;
}

/**
 * Where the table server is.
 *
 * `VITE_TABLE_URL` at build time, because the site is served from Pages and the
 * tables live in a Worker of their own — two origins, and only the build knows
 * which Worker this bundle belongs to. Unset, it falls back to the origin the
 * page came from, which is what a single `wrangler dev` serving both looks like.
 */
export function tableUrl(tableId: string): string {
  const configured = import.meta.env.VITE_TABLE_URL;
  const base =
    typeof configured === 'string' && configured !== ''
      ? configured
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  return `${base.replace(/\/+$/, '')}/table/${encodeURIComponent(tableId)}`;
}

function sameInput(one: Input, other: Input): boolean {
  return one.up === other.up && one.down === other.down && one.targetY === other.targetY;
}

export function joinTable(tableId: string, events: TableEvents): TableSocket {
  const socket = new WebSocket(tableUrl(tableId));
  /** A refusal is an answer, so the close that follows it is not a loss. */
  let refused = false;
  let closed = false;
  let lastSent: Input | null = null;
  let lastSentMs = 0;
  /** When anything at all last went up the socket, on the same clock as `report`. */
  let lastSpokeMs = 0;

  /**
   * Everything this browser says goes through here.
   *
   * One place, so that the heartbeat knows when the socket last spoke without
   * every sender having to remember to tell it.
   */
  function speak(message: ClientMessage, now: number): void {
    lastSpokeMs = now;
    socket.send(JSON.stringify(message));
  }

  /** Whether this input is news, and whether it is news the interval allows yet. */
  function worthSending(input: Input, now: number): boolean {
    if (lastSent === null) {
      return true;
    }
    if (sameInput(lastSent, input)) {
      return false;
    }
    // Changed, but too soon. It has not gone anywhere: the next frame past the
    // interval finds it still different and sends it then.
    return now - lastSentMs >= SNAPSHOT_INTERVAL_MS;
  }

  /**
   * Say nothing in particular, so the table knows the socket is still here.
   *
   * On a timer of its own rather than off the animation frame, because a
   * backgrounded tab stops being animated altogether: a player who switches
   * away for a moment is still a player at the table, and their paddle is still
   * theirs. `performance.now()` is the clock `report` is handed, so the two
   * agree about how long it has been.
   */
  const heartbeat = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const now = performance.now();
    if (now - lastSpokeMs < BEAT_DUE_MS) {
      return;
    }
    speak({ kind: 'alive' }, now);
  }, HEARTBEAT_INTERVAL_MS);

  socket.addEventListener('message', (event: MessageEvent) => {
    const message = parseServerMessage(event.data);
    if (message === null) {
      return;
    }
    switch (message.kind) {
      case 'welcome':
        events.onWelcome(message.slot);
        break;
      case 'opponent':
        events.onOpponent(message.present);
        break;
      case 'snapshot':
        events.onSnapshot(message.state, message.events);
        break;
      case 'refused':
        refused = true;
        events.onRefused();
        break;
    }
  });

  socket.addEventListener('close', () => {
    // Before the guard below, because `close()` sets `closed` itself: a timer
    // left running on a socket that has gone beats away for the life of the tab.
    clearInterval(heartbeat);
    if (closed) {
      return;
    }
    closed = true;
    if (!refused) {
      events.onLost();
    }
  });

  // A socket that fails to open at all — no table server, or nothing listening —
  // reports an error and then a close, and the close is where it is handled.
  socket.addEventListener('error', () => {
    if (socket.readyState === WebSocket.CLOSED && !closed) {
      closed = true;
      if (!refused) {
        events.onLost();
      }
    }
  });

  return {
    report: (input: Input, now: number): void => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!worthSending(input, now)) {
        return;
      }
      lastSent = input;
      lastSentMs = now;
      speak({ kind: 'input', input }, now);
    },
    rematch: (): void => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      speak({ kind: 'rematch' }, performance.now());
    },
    close: (): void => {
      clearInterval(heartbeat);
      closed = true;
      socket.close();
    },
  };
}
