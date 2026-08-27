/**
 * Test-side scaffolding for the two-browser game.
 *
 * Everything here is on the test's side of the glass. The page is the built
 * bundle a player would load and the server is a real `wrangler dev` running the
 * real Durable Object; what is substituted is only what a test cannot otherwise
 * reach — the latency of the wire, and a forged message that no honest server
 * would send.
 *
 * The clock is deliberately *not* frozen. Two browsers and a server cannot share
 * Playwright's clock, so these tests run on real time and assert on what the
 * pages converge to rather than on which frame it happened.
 */

import { expect, type Browser, type Page } from '@playwright/test';

import { courtBox } from './pong';

/** Where `wrangler dev` is started, and where the bundle is told to look. */
export const TABLE_PORT = 8787;
export const TABLE_URL = `ws://127.0.0.1:${TABLE_PORT}`;

/**
 * The idle timeout the suite's table server is started with.
 *
 * Production tables get the minute the plan settled on; a test that waited a
 * minute to watch one expire would be a minute of the suite for one assertion.
 * The mechanism is the same either way — this only says how long it is.
 */
export const TEST_IDLE_TIMEOUT_MS = 3000;

/**
 * The liveness timeout the suite's table server is started with.
 *
 * Production sockets get the ninety seconds the plan settled on. Short here for
 * the same reason the idle timeout is, but not as short: the browser beats once
 * a second and the beat rides a timer the page owns, so this has to leave room
 * for a beat or two to be late under a loaded suite without a live player being
 * thrown out of their game.
 */
export const TEST_LIVENESS_TIMEOUT_MS = 5000;

/** How long a test will wait for two browsers and a server to agree. */
export const CONVERGE_MS = 8000;

/** A table id no other test in the run can collide with. */
export function freshTableId(name: string): string {
  return `${name}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface TablePage {
  page: Page;
  close: () => Promise<void>;
}

export interface JoinOptions {
  /** Milliseconds of artificial latency in both directions on this page's socket. */
  latencyMs?: number;
  /** Refuse every socket this page opens, and record that it tried. */
  blockSockets?: boolean;
}

/**
 * Wrap `window.WebSocket` before the page loads.
 *
 * Five things a test needs and a page cannot otherwise be asked for: how many
 * sockets it opened, a delay on the wire in both directions, a way to put a
 * message into the client that the server never sent, a way to send the table
 * one the client itself would not, and a way to stop the socket saying anything
 * at all without closing it.
 *
 * The delay is done by intercepting the message before the game's own listener
 * — registered here, in the constructor, so it is registered first — stopping it
 * there, and re-dispatching a copy later. `sent` is simply held back.
 */
export async function installSocketShim(page: Page, options: JoinOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ latencyMs, blockSockets }: { latencyMs: number; blockSockets: boolean }) => {
      const real = window.WebSocket;
      const tally = {
        attempts: 0,
        urls: [] as string[],
        closes: [] as string[],
        snapshots: 0,
      };
      (window as unknown as { __sockets: typeof tally }).__sockets = tally;
      const live: WebSocket[] = [];
      /** Copies this shim itself dispatched, which must not be delayed again. */
      const redispatched = new WeakSet<Event>();

      if (blockSockets) {
        // Nothing reaches the network. It answers the way an unreachable server
        // answers — an error and a close — so the page is exercising its own
        // failure path rather than a stub that quietly does nothing.
        class BlockedWebSocket extends EventTarget {
          static readonly CONNECTING = 0;
          static readonly OPEN = 1;
          static readonly CLOSING = 2;
          static readonly CLOSED = 3;
          readonly readyState = 3;
          constructor(url: string) {
            super();
            tally.attempts += 1;
            tally.urls.push(String(url));
            setTimeout(() => {
              this.dispatchEvent(new Event('error'));
              this.dispatchEvent(new CloseEvent('close', { code: 1006 }));
            }, 0);
          }
          send(): void {}
          close(): void {}
        }
        (window as unknown as { WebSocket: unknown }).WebSocket = BlockedWebSocket;
        return;
      }

      class ShimmedWebSocket extends real {
        /** Set by `__silence`: the socket stays open and stops saying anything. */
        private muted = false;

        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          tally.attempts += 1;
          tally.urls.push(String(url));
          live.push(this);
          // Why a socket ended, kept for the failure message: a table that
          // refused this browser closes with 4409 and says so, and a connection
          // that simply broke closes with 1006 and does not.
          this.addEventListener('close', (event: CloseEvent) => {
            tally.closes.push(`${event.code}:${event.reason}`);
          });
          // How many courts the server has actually sent this page. The page
          // ships 0-0 in its own markup, so a score read before the first
          // snapshot is the markup's answer rather than the table's.
          this.addEventListener('message', (event: MessageEvent) => {
            if (redispatched.has(event)) {
              return;
            }
            try {
              if (JSON.parse(String(event.data)).kind === 'snapshot') {
                tally.snapshots += 1;
              }
            } catch {
              // Not something the table says; not a snapshot.
            }
          });
          if (latencyMs > 0) {
            this.addEventListener('message', (event: MessageEvent) => {
              if (redispatched.has(event)) {
                return;
              }
              event.stopImmediatePropagation();
              const { data } = event;
              setTimeout(() => {
                const copy = new MessageEvent('message', { data });
                redispatched.add(copy);
                this.dispatchEvent(copy);
              }, latencyMs);
            });
          }
        }

        send(data: string): void {
          if (this.muted) {
            return;
          }
          if (latencyMs > 0) {
            setTimeout(() => super.send(data), latencyMs);
            return;
          }
          super.send(data);
        }

        mute(): void {
          this.muted = true;
        }
      }

      (window as unknown as { WebSocket: unknown }).WebSocket = ShimmedWebSocket;
      (window as unknown as { __forge: (data: string) => void }).__forge = (data: string) => {
        const socket = live[live.length - 1];
        if (socket === undefined) {
          throw new Error('the page has not opened a socket to forge a message on');
        }
        const event = new MessageEvent('message', { data });
        redispatched.add(event);
        socket.dispatchEvent(event);
      };
      (window as unknown as { __say: (data: string) => void }).__say = (data: string) => {
        const socket = live[live.length - 1];
        if (socket === undefined) {
          throw new Error('the page has not opened a socket to say anything on');
        }
        socket.send(data);
      };
      (window as unknown as { __silence: () => void }).__silence = () => {
        const socket = live[live.length - 1];
        if (socket === undefined) {
          throw new Error('the page has not opened a socket to silence');
        }
        (socket as ShimmedWebSocket).mute();
      };
    },
    { latencyMs: options.latencyMs ?? 0, blockSockets: options.blockSockets ?? false },
  );
}

/**
 * Watch both halves of the scoreboard and keep everything they ever showed.
 *
 * A forged score is overwritten by the next broadcast a thirtieth of a second
 * later, which is far too quick to catch by looking. What the assertions need is
 * not the score now but the score's whole history: that this page did show a 9,
 * and that the other page never did.
 */
export async function watchScore(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __scores: string[] }).__scores = seen;
    const read = (): string =>
      `${document.getElementById('player-score')?.textContent ?? ''}-${
        document.getElementById('cpu-score')?.textContent ?? ''
      }`;
    seen.push(read());
    const observer = new MutationObserver(() => {
      const now = read();
      if (now !== seen[seen.length - 1]) {
        seen.push(now);
      }
    });
    for (const id of ['player-score', 'cpu-score']) {
      const element = document.getElementById(id);
      if (element !== null) {
        observer.observe(element, { childList: true, characterData: true, subtree: true });
      }
    }
  });
}

/** Every score this page has ever displayed, in order. */
export async function scoresSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __scores: string[] }).__scores);
}

/**
 * Watch the line under the court and keep everything it ever said.
 *
 * For the same reason the score is watched rather than read: a line the next
 * snapshot takes back a thirtieth of a second later is too quick to catch by
 * looking, and "it said this and then stopped saying it" is the assertion.
 */
export async function watchStatus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __statuses: string[] }).__statuses = seen;
    const element = document.getElementById('status');
    if (element === null) {
      return;
    }
    seen.push(element.textContent ?? '');
    new MutationObserver(() => {
      const now = element.textContent ?? '';
      if (now !== seen[seen.length - 1]) {
        seen.push(now);
      }
    }).observe(element, { childList: true, characterData: true, subtree: true });
  });
}

/** Every line this page has ever shown under the court, in order. */
export async function statusesSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __statuses: string[] }).__statuses);
}

/** How many sockets this page tried to open. */
export async function socketAttempts(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __sockets: { attempts: number } }).__sockets.attempts,
  );
}

/** How many courts the table has sent this page. */
export async function snapshotsSeen(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __sockets: { snapshots: number } }).__sockets.snapshots,
  );
}

/** Why each of this page's sockets ended, as `code:reason`. */
export async function socketCloses(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __sockets: { closes: string[] } }).__sockets.closes,
  );
}

/**
 * Say something to the table over this page's own socket.
 *
 * The other direction from `forge`, and there for the same reason: the rules a
 * table applies to what it is asked are the server's, and a test that can only
 * ask through the client is testing the client's manners instead. This is the
 * message a browser that had been tampered with would send.
 */
export async function say(page: Page, message: unknown): Promise<void> {
  await page.evaluate((data: string) => {
    (window as unknown as { __say: (raw: string) => void }).__say(data);
  }, JSON.stringify(message));
}

/**
 * Stop this page's socket saying anything, and leave it open.
 *
 * What a killed tab or a cut network looks like from the table's side, and the
 * one thing closing the page cannot show: a close frame is an answer, and the
 * table acts on it at once. The case the timeout exists for is the one where no
 * answer ever comes.
 */
export async function goSilent(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __silence: () => void }).__silence();
  });
}

/** Put a message into the page's client that the table never sent. */
export async function forge(page: Page, message: unknown): Promise<void> {
  await page.evaluate((data: string) => {
    (window as unknown as { __forge: (raw: string) => void }).__forge(data);
  }, JSON.stringify(message));
}

/**
 * Every context this worker has opened and not yet closed.
 *
 * A test that fails part way through never reaches its own `close()` calls, and
 * Playwright does not close a context the test made itself. Left alone they pile
 * up across repeats in the same worker until the browser starts dropping
 * connections — which reads as a table losing a player, and turns one failing
 * test into several. `closeTables` in an `afterEach` is what stops that.
 */
const open = new Set<() => Promise<void>>();

/** Close everything this test opened, whether or not it got that far itself. */
export async function closeTables(): Promise<void> {
  const closing = [...open];
  open.clear();
  await Promise.all(closing.map((close) => close()));
}

/**
 * A browser context ready to enter a table, but not in one yet.
 *
 * Split from entering because opening a context is the slow part — the best part
 * of a second under a loaded suite — and a test watching a table's idle timeout
 * has to be able to arrive inside it.
 */
export async function prepareTablePage(
  browser: Browser,
  options: JoinOptions = {},
): Promise<TablePage> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installSocketShim(page, options);
  const seat: TablePage = {
    page,
    close: async () => {
      open.delete(seat.close);
      await context.close();
    },
  };
  open.add(seat.close);
  return seat;
}

/** Take a prepared context into a table. */
export async function enterTable(seat: TablePage, tableId: string): Promise<void> {
  await seat.page.goto(`/?table=${encodeURIComponent(tableId)}`);
  // After the page exists, because the observers watch elements on it. The
  // score starts at 0-0 either way, so nothing is missed by waiting.
  await watchScore(seat.page);
  await watchStatus(seat.page);
}

/** Open a browser at a table, on its own context, the way a second person would. */
export async function joinTable(
  browser: Browser,
  tableId: string,
  options: JoinOptions = {},
): Promise<TablePage> {
  const seat = await prepareTablePage(browser, options);
  await enterTable(seat, tableId);
  return seat;
}

export async function statusOf(page: Page): Promise<string> {
  return (await page.locator('#status').textContent()) ?? '';
}

export async function labels(page: Page): Promise<{ left: string; right: string }> {
  return {
    left: (await page.locator('#player-label').textContent()) ?? '',
    right: (await page.locator('#cpu-label').textContent()) ?? '',
  };
}

export async function scoreOf(page: Page): Promise<string> {
  return `${await page.locator('#player-score').textContent()}-${await page
    .locator('#cpu-score')
    .textContent()}`;
}

/** Wait until both browsers are on their paddles with each other. */
export async function expectPlaying(page: Page): Promise<void> {
  await expect
    .poll(() => statusOf(page), { timeout: CONVERGE_MS })
    .toBe('');
}

/**
 * Put a player's paddle across the middle of the court and leave it there.
 *
 * The opposite of `parkPaddleAtTop`: a paddle in the way is what makes a rally
 * last, which is what a test needs when it is about to look at a court and
 * would rather the score did not move while it does.
 */
export async function parkPaddleAtCentre(page: Page): Promise<void> {
  const box = await courtBox(page);
  await page.mouse.move(box.left + 100, Math.round(box.top + box.height / 2));
}

/**
 * Park a player's paddle at the top of the court and leave it there.
 *
 * A pointer names a place rather than a direction, so the paddle stays where it
 * was last pointed at without anything being held down — which is what makes a
 * point get scored while the test is busy asserting something else.
 */
export async function parkPaddleAtTop(page: Page): Promise<void> {
  const box = await courtBox(page);
  await page.mouse.move(box.left + 100, Math.round(box.top + 2));
}
