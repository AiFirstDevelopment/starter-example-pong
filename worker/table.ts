/**
 * The table: one Durable Object per table id, holding one game of Pong.
 *
 * The id *is* the rendezvous. `idFromName(tableId)` sends everyone who typed the
 * same string to the same object, so there is no registry to keep and no
 * matchmaking to do — which is exactly what the user asked for, collisions
 * included.
 *
 * The object owns the game. It runs the same fixed-timestep loop the browser
 * runs at home, over the same `step()` imported from `src/game/`, so the server
 * and the client cannot drift apart in the rules. What the browsers get is
 * snapshots; the score and the ball are never theirs to decide.
 */

import {
  FIXED_DT_MS,
  IDLE_TIMEOUT_MS,
  REFUSED_CLOSE_CODE,
  SNAPSHOT_INTERVAL_MS,
  normaliseTableId,
  parseClientMessage,
  type ServerMessage,
  type Slot,
} from '../src/net/protocol';
import { createState, startGame, type GameState } from '../src/game/state';
import { NO_INPUT, step, type GameEvent, type Input } from '../src/game/step';
import { assignSlot } from './slots';

export interface Env {
  TABLE: DurableObjectNamespace;
  /**
   * How long a table with nobody at it survives, in milliseconds. Configured
   * so the behavioural tests can watch a table time out without waiting the
   * minute a real one waits; unset, tables get the minute.
   */
  IDLE_TIMEOUT_MS?: string;
}

/** A gap this long is a stalled server, not time to simulate. Same cap as the client's. */
const MAX_FRAME_MS = 250;

/** The prefix a table socket is addressed at: `/table/<id>`. */
const TABLE_PATH = '/table/';

function readIdleTimeout(env: Env): number {
  const configured = Number(env.IDLE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : IDLE_TIMEOUT_MS;
}

export class Table {
  /** The sockets holding each paddle. At most two, and at most one per paddle. */
  private readonly seats = new Map<Slot, WebSocket>();
  /** What each player last asked for. A player who says nothing keeps asking for it. */
  private readonly inputs = new Map<Slot, Input>();
  private game: GameState;
  private loop: ReturnType<typeof setInterval> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private lastTickMs = 0;
  private accumulator = 0;
  private readonly idleTimeoutMs: number;

  constructor(_state: DurableObjectState, env: Env) {
    this.idleTimeoutMs = readIdleTimeout(env);
    this.game = createState(Date.now() | 0);
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('a table is played over a websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const slot = assignSlot(this.seats.keys());
    if (slot === null) {
      // Both paddles are taken. The refusal is a message and then a close, and
      // it happens on this socket alone: the two already playing are not
      // written to, not stepped differently, and never hear about it.
      //
      // It is told rather than refused at the handshake because a browser is
      // shown a failed handshake as an anonymous error — no status, no body —
      // and AC4 asks for a message that says the table is in use.
      send(server, { kind: 'refused' });
      server.close(REFUSED_CLOSE_CODE, 'table in use');
      return new Response(null, { status: 101, webSocket: client });
    }

    this.seat(slot, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Put an arriving player on `slot` and tell both ends where they stand. */
  private seat(slot: Slot, socket: WebSocket): void {
    if (this.seats.size === 0) {
      this.discardIfIdle();
      this.cancelIdleTimer();
    }

    this.seats.set(slot, socket);
    this.inputs.set(slot, NO_INPUT);

    socket.addEventListener('message', (event: MessageEvent) => {
      const message = parseClientMessage(event.data);
      if (message !== null) {
        this.inputs.set(slot, message.input);
      }
    });
    // A socket that errors is a socket that has gone: the browser is not coming
    // back for this game, and holding its paddle would lock the table.
    socket.addEventListener('close', () => this.vacate(slot, socket));
    socket.addEventListener('error', () => this.vacate(slot, socket));

    send(socket, { kind: 'welcome', slot });
    send(socket, { kind: 'opponent', present: this.seats.size === 2 });
    if (this.seats.size === 2) {
      this.tell(other(slot), { kind: 'opponent', present: true });
      // Two players is what starts a game. A game already in progress — one
      // whose player left and whose seat this is — is picked up where it was
      // left, score and all; `startGame` leaves a rally alone.
      this.game = startGame(this.game);
    }

    this.startLoop();
  }

  /**
   * A player has gone. Free their paddle and tell whoever is left.
   *
   * The game is not thrown away: it stops where it is, and the next arrival
   * takes the free paddle and carries on with the score as it stands. Only the
   * idle timeout discards a game, which is what makes an abandoned table start
   * over rather than resume.
   */
  private vacate(slot: Slot, socket: WebSocket): void {
    if (this.seats.get(slot) !== socket) {
      return;
    }
    this.seats.delete(slot);
    this.inputs.delete(slot);
    this.tell(other(slot), { kind: 'opponent', present: false });

    if (this.seats.size === 0) {
      this.stopLoop();
      this.startIdleTimer();
    }
  }

  private startLoop(): void {
    if (this.loop !== null) {
      return;
    }
    this.lastTickMs = Date.now();
    this.accumulator = 0;
    this.loop = setInterval(() => this.tick(), SNAPSHOT_INTERVAL_MS);
  }

  private stopLoop(): void {
    if (this.loop !== null) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  private tick(): void {
    try {
      this.simulateAndBroadcast();
    } catch {
      // The loop belongs to two people. A socket that fails while being written
      // to is one player's problem, and letting it throw out of the interval
      // would take the whole table down with it — including the player whose
      // connection is fine. The close event frees the seat either way.
    }
  }

  /**
   * Simulate what has passed since the last tick, then say what the court looks
   * like.
   *
   * The ball only moves while both paddles have somebody behind them: a rally
   * against an unattended paddle would run the score up on a player who is not
   * there. The court is still broadcast while waiting, so the one player who is
   * there sees the score and the still court rather than a blank canvas.
   */
  private simulateAndBroadcast(): void {
    const now = Date.now();
    const elapsed = Math.min(now - this.lastTickMs, MAX_FRAME_MS);
    this.lastTickMs = now;

    const events: GameEvent[] = [];
    if (this.seats.size === 2) {
      this.accumulator = Math.min(this.accumulator + elapsed, MAX_FRAME_MS);
      while (this.accumulator >= FIXED_DT_MS) {
        this.accumulator -= FIXED_DT_MS;
        const result = step(
          this.game,
          FIXED_DT_MS,
          this.inputs.get('left') ?? NO_INPUT,
          this.inputs.get('right') ?? NO_INPUT,
        );
        this.game = result.state;
        events.push(...result.events);
      }
    } else {
      this.accumulator = 0;
    }

    this.broadcast({ kind: 'snapshot', state: this.game, events });
  }

  private startIdleTimer(): void {
    this.cancelIdleTimer();
    this.idle = setTimeout(() => {
      this.idle = null;
      this.game = createState(Date.now() | 0);
    }, this.idleTimeoutMs);
  }

  private cancelIdleTimer(): void {
    if (this.idle !== null) {
      clearTimeout(this.idle);
      this.idle = null;
    }
  }

  /**
   * Throw the game away if the table has been empty long enough.
   *
   * The timer above is the usual way that happens, but a Durable Object with no
   * sockets open may be evicted and its timers with it, so an arrival checks the
   * clock as well rather than trusting a timer that may never have fired.
   */
  private discardIfIdle(): void {
    if (this.idle === null && this.lastTickMs > 0) {
      // The timer has already run, or was lost with the object it belonged to.
      // Either way nothing has happened here since the last tick.
      if (Date.now() - this.lastTickMs >= this.idleTimeoutMs) {
        this.game = createState(Date.now() | 0);
      }
    }
  }

  private tell(slot: Slot, message: ServerMessage): void {
    const socket = this.seats.get(slot);
    if (socket !== undefined) {
      send(socket, message);
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.seats.values()) {
      send(socket, message);
    }
  }
}

function other(slot: Slot): Slot {
  return slot === 'left' ? 'right' : 'left';
}

/**
 * Say something to one browser.
 *
 * A socket that has gone away between the broadcast starting and reaching it
 * throws, and one player's dropped connection is not a reason to stop the other
 * player's game: the close event is already on its way and will free the seat.
 * The state is checked first because a browser that has already gone is the
 * common case, not the exceptional one — a player closes their tab — and a
 * caught throw per broadcast is a worse way to find out.
 */
function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== WebSocket.READY_STATE_OPEN) {
    return;
  }
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Nothing to do: the seat is freed by the close that follows.
  }
}

/**
 * The table id in `/table/<id>`, or `null` if there is not one.
 *
 * `decodeURIComponent` throws on a half-written escape — `/table/%` is a path a
 * browser will happily send — and an id that arrives broken is not an id.
 */
function readTableId(pathname: string): string | null {
  const raw = pathname.slice(TABLE_PATH.length);
  try {
    return normaliseTableId(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    // Something for a health check to ask, so a test harness can wait for the
    // table server to be up without opening a game socket to do it.
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    if (!url.pathname.startsWith(TABLE_PATH)) {
      return new Response('not found', { status: 404 });
    }

    const tableId = readTableId(url.pathname);
    if (tableId === null) {
      return new Response('a table needs an id', { status: 400 });
    }

    return env.TABLE.get(env.TABLE.idFromName(tableId)).fetch(request);
  },
};
