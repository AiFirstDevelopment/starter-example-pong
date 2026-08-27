/**
 * The browser's end of a table: one socket, opened, spoken to and listened to.
 *
 * It knows nothing about the court or the DOM. What it does is turn a socket
 * into the four things the game cares about — you are on this paddle, somebody
 * is or is not on the other one, here is the court, and you are not getting in —
 * and take the player's input back the other way at the agreed rate.
 */

import { SNAPSHOT_INTERVAL_MS, parseServerMessage, type Slot } from './protocol';
import type { GameState } from '../game/state';
import type { GameEvent, Input } from '../game/step';

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
   * answer has changed. A player holding still says nothing, and the table goes
   * on applying what they last asked for.
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
      if (lastSent !== null && sameInput(lastSent, input)) {
        return;
      }
      if (lastSent !== null && now - lastSentMs < SNAPSHOT_INTERVAL_MS) {
        // Changed, but too soon. It has not gone anywhere: the next frame past
        // the interval finds it still different and sends it then.
        return;
      }
      lastSent = input;
      lastSentMs = now;
      socket.send(JSON.stringify({ kind: 'input', input }));
    },
    rematch: (): void => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify({ kind: 'rematch' }));
    },
    close: (): void => {
      closed = true;
      socket.close();
    },
  };
}
