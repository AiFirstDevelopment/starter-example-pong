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
  LIVENESS_TIMEOUT_MS,
  REFUSED_CLOSE_CODE,
  SILENT_CLOSE_CODE,
  SNAPSHOT_INTERVAL_MS,
  normaliseTableId,
  parseClientMessage,
  type ServerMessage,
  type Slot,
} from '../src/net/protocol';
import { createState, startGame, type GameState } from '../src/game/state';
import { NO_INPUT, step, type GameEvent, type Input } from '../src/game/step';
import { callerAddress, withinRate, type RateLimiter } from './limit';
import { originAllowed } from './origins';
import { assignSlot } from './slots';

export interface Env {
  TABLE: DurableObjectNamespace;
  /**
   * How long a table with nobody at it survives, in milliseconds. Configured
   * so the behavioural tests can watch a table time out without waiting the
   * minute a real one waits; unset, tables get the minute.
   */
  IDLE_TIMEOUT_MS?: string;
  /**
   * How long a seated socket may say nothing before its seat is taken back, in
   * milliseconds. Configured for the same reason `IDLE_TIMEOUT_MS` is: a suite
   * cannot wait the minute and a half a real socket gets. Unset, they get it.
   */
  LIVENESS_TIMEOUT_MS?: string;
  /**
   * The pages a browser may open a table from, comma separated. A `var` rather
   * than a constant so that adding a domain is a configuration change; see
   * `origins.ts` for what a `*` in one means.
   */
  ALLOWED_ORIGINS?: string;
  /**
   * Cloudflare's rate-limit binding, if this runtime has one. Optional because
   * a local `wrangler dev` may not, and `limit.ts` says what that means.
   */
  LIMITER?: RateLimiter;
}

/** A gap this long is a stalled server, not time to simulate. Same cap as the client's. */
const MAX_FRAME_MS = 250;

/** The prefix a table socket is addressed at: `/table/<id>`. */
const TABLE_PATH = '/table/';

/** A `var` read as milliseconds, or the constant when it says nothing usable. */
function readTimeout(configured: string | undefined, fallback: number): number {
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export class Table {
  /** The sockets holding each paddle. At most two, and at most one per paddle. */
  private readonly seats = new Map<Slot, WebSocket>();
  /** What each player last asked for. A player who says nothing keeps asking for it. */
  private readonly inputs = new Map<Slot, Input>();
  /** When each seat was last heard from. Silence past the timeout frees it. */
  private readonly heardMs = new Map<Slot, number>();
  private game: GameState;
  private loop: ReturnType<typeof setInterval> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private silence: ReturnType<typeof setTimeout> | null = null;
  private lastTickMs = 0;
  private accumulator = 0;
  private readonly idleTimeoutMs: number;
  private readonly livenessTimeoutMs: number;

  constructor(_state: DurableObjectState, env: Env) {
    this.idleTimeoutMs = readTimeout(env.IDLE_TIMEOUT_MS, IDLE_TIMEOUT_MS);
    this.livenessTimeoutMs = readTimeout(env.LIVENESS_TIMEOUT_MS, LIVENESS_TIMEOUT_MS);
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
      this.cancelIdleTimer();
    }

    this.seats.set(slot, socket);
    this.inputs.set(slot, NO_INPUT);
    // Arriving is the first sign of life. The browser's heartbeat carries it on.
    this.heardMs.set(slot, Date.now());
    this.scheduleSilenceCheck();

    socket.addEventListener('message', (event: MessageEvent) => {
      const message = parseClientMessage(event.data);
      if (message === null) {
        return;
      }
      // Whatever the browser said, saying it is the sign of life — and a player
      // who has stopped moving says nothing else at all.
      this.markAlive(slot, socket);
      if (message.kind === 'input') {
        this.inputs.set(slot, message.input);
        return;
      }
      if (message.kind === 'alive') {
        return;
      }
      this.rematch(slot, socket);
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
      // And two players is what starts the broadcast. The player already here
      // gets the court from the loop's first tick, a thirtieth of a second away.
      this.startLoop();
      return;
    }

    // Alone at the table, so there is no loop and nothing moving to report: one
    // court, once, so the wait is spent looking at the score and the still court
    // rather than at a blank canvas (AC4).
    send(socket, { kind: 'snapshot', state: this.game, events: [] });
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
    this.heardMs.delete(slot);
    this.tell(other(slot), { kind: 'opponent', present: false });

    // Whoever has gone, the game has stopped: the ball only moves while both
    // paddles are held, so a loop still running would send the same court
    // thirty times a second to nobody who needs it (AC3).
    this.stopLoop();
    // Whoever is left decides when the table next needs looking at, and a table
    // nobody is at needs no timer at all.
    this.scheduleSilenceCheck();

    if (this.seats.size === 0) {
      this.startIdleTimer();
      return;
    }
    // The player still here gets one last court, so what they are looking at is
    // where the game stopped rather than the frame before it did.
    this.tell(other(slot), { kind: 'snapshot', state: this.game, events: [] });
  }

  /**
   * Play another game, if this socket is in a position to ask for one.
   *
   * Two checks and no more. The socket has to be the one holding this seat —
   * a player who has left, or a third browser that was turned away, is asking
   * about somebody else's game — and `startGame` decides the rest: it returns
   * the game untouched unless it is `idle` or `game-over`, so a rematch that
   * arrives mid-rally does nothing to the two people in the rally.
   *
   * The new court is sent straight away rather than left to the next tick, so
   * both browsers take the winner line down at the same moment, and so the
   * player waiting alone at a finished table — where there is no tick — sees
   * an answer at all. Nothing is sent when nothing started: `startGame` hands
   * back the very state it was given, and a seated player pressing keys through
   * a rally should not be able to ask for a broadcast to both browsers.
   */
  private rematch(slot: Slot, socket: WebSocket): void {
    if (this.seats.get(slot) !== socket) {
      return;
    }
    const started = startGame(this.game);
    if (started === this.game) {
      return;
    }
    this.game = started;
    this.broadcast({ kind: 'snapshot', state: this.game, events: [] });
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
   * Every tick is a tick of a real game: the loop runs only while both paddles
   * have somebody behind them, because a rally against an unattended paddle
   * would run the score up on a player who is not there — and a table with one
   * player at it has nothing to say thirty times a second. The one court that
   * player does need is sent by `seat` and by `vacate`.
   */
  private simulateAndBroadcast(): void {
    const now = Date.now();
    const elapsed = Math.min(now - this.lastTickMs, MAX_FRAME_MS);
    this.lastTickMs = now;

    const events: GameEvent[] = [];
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

    this.broadcast({ kind: 'snapshot', state: this.game, events });
  }

  /**
   * Note that this socket is still there.
   *
   * A stamp rather than a timer per socket: the check below is one timer set for
   * whichever seat falls silent first, so a message thirty times a second costs
   * a map write and nothing else. The seat is confirmed first because a socket
   * whose seat has been handed on — freed by an error, taken by the next arrival
   * — must not be able to hold somebody else's deadline open.
   */
  private markAlive(slot: Slot, socket: WebSocket): void {
    if (this.seats.get(slot) !== socket) {
      return;
    }
    this.heardMs.set(slot, Date.now());
  }

  /**
   * Arm one timer, for whichever seat falls silent first.
   *
   * One timer for the table rather than one per socket, and never reset while a
   * player is talking: a stamp moved forward simply makes this fire early, find
   * nobody silent, and arm itself again. Nothing is armed when nobody is seated,
   * because a pending timer is one of the things that keeps a Durable Object
   * resident — which is the bill this timeout exists to stop.
   */
  private scheduleSilenceCheck(): void {
    this.cancelSilenceCheck();

    let earliest: number | null = null;
    for (const heard of this.heardMs.values()) {
      const deadline = heard + this.livenessTimeoutMs;
      if (earliest === null || deadline < earliest) {
        earliest = deadline;
      }
    }
    if (earliest === null) {
      return;
    }
    this.silence = setTimeout(() => this.dropSilent(), Math.max(0, earliest - Date.now()));
  }

  private cancelSilenceCheck(): void {
    if (this.silence !== null) {
      clearTimeout(this.silence);
      this.silence = null;
    }
  }

  /**
   * Take back the seat of anybody who has not been heard from in the timeout.
   *
   * The socket is closed *and* the seat freed here, rather than closing and
   * waiting for the close event to do it: a connection whose other end has gone
   * may never deliver one, which is the whole reason this timer exists. `vacate`
   * ignores a seat that is not this socket's, so doing both costs nothing if the
   * event does arrive.
   *
   * This does not stop somebody who means it. A script that holds a socket open
   * and answers the heartbeat keeps its table, and the rate limit at the door is
   * what caps how fast it can open more. What this frees is the abandoned table
   * — a killed tab, a closed laptop — which is the common case.
   */
  private dropSilent(): void {
    this.silence = null;
    const now = Date.now();
    for (const [slot, socket] of [...this.seats]) {
      if (now - (this.heardMs.get(slot) ?? now) < this.livenessTimeoutMs) {
        continue;
      }
      hangUp(socket);
      this.vacate(slot, socket);
    }
    this.scheduleSilenceCheck();
  }

  /**
   * The last player has gone: start the clock on throwing the game away.
   *
   * This timer is the only thing that discards a game. It does not need a
   * belt-and-braces check on the way back in: an object evicted while nobody
   * was here loses the game with it — the table keeps nothing in storage — so a
   * re-created one is a fresh game whether the timer ran or not.
   */
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
 * Hang up on a socket that has stopped answering.
 *
 * Guarded the way `send` is and for the same reason: the browser at the other
 * end has, by construction, gone, and a close that throws on the way out must
 * not take the rest of the check — or the other player's game — down with it.
 */
function hangUp(socket: WebSocket): void {
  try {
    socket.close(SILENT_CLOSE_CODE, 'no sign of life');
  } catch {
    // Already gone. The seat is taken back either way.
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
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Both refusals happen here, and *here* is the whole point of them:
    // `env.TABLE.get(...)` creates the Durable Object, and an object that has
    // been created is resident and duration-billed for as long as somebody
    // holds a socket to it. A refusal only costs nothing while the table has
    // not been addressed yet.
    if (!originAllowed(request.headers.get('Origin'), env.ALLOWED_ORIGINS)) {
      return new Response('a table is opened from the game, not from here', { status: 403 });
    }
    if (!(await withinRate(env.LIMITER, callerAddress(request)))) {
      return new Response('too many tables from here just now', { status: 429 });
    }

    return env.TABLE.get(env.TABLE.idFromName(tableId)).fetch(request);
  },
};
