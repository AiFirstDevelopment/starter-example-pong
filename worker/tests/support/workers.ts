/**
 * The pieces of the Workers runtime `Table` reaches for and plain vitest has not.
 *
 * `table.ts` is ordinary JavaScript everywhere else — `WebSocketPair` and
 * `READY_STATE_OPEN` appear inside methods rather than at module scope — which is
 * what lets the whole Durable Object be driven here rather than in a workerd
 * pool. Three things are missing and no more: a socket pair, the
 * `READY_STATE_OPEN` a Cloudflare `WebSocket` carries as a static, and a
 * `Response` that will take the 101 a handshake answers with, which node's
 * refuses along with every other status below 200.
 *
 * The pair is a real pair rather than a stub: what one end sends, the other end
 * hears. That is what lets a test say something to a table that no browser
 * would, and read back what the table said to the browser — which is the whole
 * reason this file exists, because a seat is freed only on close or error and so
 * a browser can never hold an open socket whose seat somebody else has taken.
 */

import type { Table } from '../../table';

/** The two `readyState` values `table.ts` distinguishes between. */
const READY_STATE_OPEN = 1;
const READY_STATE_CLOSED = 3;

/**
 * One end of a socket pair.
 *
 * `heard` and `closes` are this end's record of what it was told, which is what
 * an assertion is written against; `peer` is the other end, which is how a test
 * reaches the server side of a socket it opened as a browser.
 */
export class FakeSocket {
  readyState: number = READY_STATE_OPEN;
  /** Everything said to this end, in order, as it arrived on the wire. */
  readonly heard: string[] = [];
  /** Why this end was closed, as `code:reason`, if it has been. */
  readonly closes: string[] = [];
  /** The other end of the pair. Set as the pair is made, never after. */
  peer!: FakeSocket;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  accept(): void {
    // A real server end is accepted before it carries anything. There is
    // nothing for this one to do about it.
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const registered = this.listeners.get(type) ?? [];
    registered.push(listener);
    this.listeners.set(type, registered);
  }

  send(data: string): void {
    if (this.readyState !== READY_STATE_OPEN) {
      throw new Error('this socket is closed');
    }
    this.peer.receive(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === READY_STATE_CLOSED) {
      return;
    }
    this.readyState = READY_STATE_CLOSED;
    this.peer.hangUp(code, reason);
  }

  /**
   * Break this end the way a connection breaks: an error and no close.
   *
   * The table frees a seat on either, so this is how a test arranges the one
   * arrangement a browser cannot — a socket still able to speak whose seat has
   * been handed to somebody else.
   */
  fail(): void {
    this.emit('error', {} as MessageEvent);
  }

  private receive(data: string): void {
    this.heard.push(data);
    this.emit('message', { data } as unknown as MessageEvent);
  }

  private hangUp(code?: number, reason?: string): void {
    this.closes.push(`${code ?? ''}:${reason ?? ''}`);
    if (this.readyState === READY_STATE_CLOSED) {
      return;
    }
    this.readyState = READY_STATE_CLOSED;
    this.emit('close', {} as MessageEvent);
  }

  private emit(type: string, event: MessageEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

/** Only what a table's answers carry: a status, and sometimes a socket. */
export class FakeResponse {
  readonly status: number;
  readonly webSocket: FakeSocket | null;

  constructor(_body: unknown, init?: { status?: number; webSocket?: FakeSocket }) {
    this.status = init?.status ?? 200;
    this.webSocket = init?.webSocket ?? null;
  }
}

/** Put the three globals in place, and hand back the way to take them out again. */
export function installWorkersRuntime(): { restore: () => void } {
  const globals = globalThis as unknown as Record<string, unknown>;
  const before = {
    WebSocket: globals['WebSocket'],
    WebSocketPair: globals['WebSocketPair'],
    Response: globals['Response'],
  };

  globals['WebSocket'] = { READY_STATE_OPEN, READY_STATE_CLOSED };
  globals['WebSocketPair'] = function pair(): { 0: FakeSocket; 1: FakeSocket } {
    const client = new FakeSocket();
    const server = new FakeSocket();
    client.peer = server;
    server.peer = client;
    return { 0: client, 1: server };
  };
  globals['Response'] = FakeResponse;

  return {
    restore: () => {
      globals['WebSocket'] = before.WebSocket;
      globals['WebSocketPair'] = before.WebSocketPair;
      globals['Response'] = before.Response;
    },
  };
}

/**
 * Sit down at `table` the way a browser does, and keep the browser's end.
 *
 * The table hands the client end back on the response, exactly as it does to a
 * real handshake; the server end is `.peer` away for a test that needs to break
 * a connection rather than close it.
 */
export function openSocket(table: Table): FakeSocket {
  const request = new Request('https://pong-table.example/table/johnny', {
    headers: { Upgrade: 'websocket' },
  });
  const answer = table.fetch(request) as unknown as FakeResponse;
  if (answer.webSocket === null) {
    throw new Error(`the table answered ${answer.status} rather than with a socket`);
  }
  return answer.webSocket;
}

/** What this end has been told, parsed, so an assertion can read it. */
export function messages(socket: FakeSocket): Array<Record<string, unknown>> {
  return socket.heard.map((raw) => JSON.parse(raw) as Record<string, unknown>);
}
