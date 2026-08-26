/**
 * Test-side scaffolding for driving the game the way a player does.
 *
 * Two boundaries are substituted and nothing else: `window.AudioContext`
 * becomes a recorder, because Playwright cannot hear, and the clock is
 * Playwright's, so frames advance the same number of times on every run. The
 * game itself is untouched — the court is read back out of the canvas and the
 * score out of the DOM, exactly as they are presented to a player.
 */

import { devices, type Page } from '@playwright/test';

/**
 * The phone the touch tests are driven on.
 *
 * It lives here rather than inline in `playwright.config.ts` because the
 * determinism test builds its own contexts, and those have to be the same phone
 * as the project the rest of the touch tests run in — a context without
 * `hasTouch` cannot be touched at all. One definition, imported by both.
 */
export const TOUCH_DEVICE = devices['Pixel 5'];

/** One sound the game asked the browser to play. */
export interface RecordedSound {
  type: string;
  frequencyStart: number;
  frequencyEnd?: number;
  gainStart?: number;
  gainEnd?: number;
  /** Whether this tone was wired through to the context's destination. */
  connectedToDestination?: boolean;
  startAt: number;
  stopAt: number;
  durationMs: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Span {
  top: number;
  bottom: number;
}

/**
 * The canvas's box on screen, in viewport coordinates.
 *
 * No width: the mapping under test is purely vertical, and advertising a
 * horizontal half would suggest the pointer's x mattered to it.
 */
export interface Box {
  left: number;
  top: number;
  height: number;
}

/** A frame of Playwright's faked clock: `requestAnimationFrame` runs on it. */
export const FRAME_MS = 16;

/**
 * Take over the clock and hold it still, always at the same instant.
 *
 * `install` on its own leaves the clock running at the speed of the real one,
 * so frames would keep arriving between one assertion and the next and no two
 * runs would see the same rally. Pausing at a fixed instant means time moves
 * only when a test asks it to, and animation frames land on the same 16 ms grid
 * every run.
 */
export async function installClock(page: Page): Promise<void> {
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
}

/**
 * Replace `window.AudioContext` with something that records what was asked for
 * instead of making a noise. Must run before the page loads.
 */
export async function recordSound(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sounds: Record<string, unknown>[] = [];
    (window as unknown as { __sounds: unknown[] }).__sounds = sounds;

    const param = (record: Record<string, unknown>, name: string) => ({
      value: 0,
      setValueAtTime(value: number) {
        record[`${name}Start`] = value;
        return this;
      },
      exponentialRampToValueAtTime(value: number) {
        record[`${name}End`] = value;
        return this;
      },
      linearRampToValueAtTime(value: number) {
        record[`${name}End`] = value;
        return this;
      },
      cancelScheduledValues() {
        return this;
      },
    });

    class RecordingAudioContext {
      state = 'running';
      destination = { kind: 'destination' };

      get currentTime(): number {
        return performance.now() / 1000;
      }

      resume(): Promise<void> {
        this.state = 'running';
        return Promise.resolve();
      }

      close(): Promise<void> {
        this.state = 'closed';
        return Promise.resolve();
      }

      createOscillator() {
        const record: Record<string, unknown> = { type: 'sine' };
        return {
          record,
          frequency: param(record, 'frequency'),
          set type(value: string) {
            record.type = value;
          },
          get type(): string {
            return record.type as string;
          },
          connect(target: { record?: Record<string, unknown> }) {
            if (target.record) {
              record.gainStart = target.record.gainStart;
              record.gainEnd = target.record.gainEnd;
              target.record.owner = record;
              if (target.record.reachesDestination === true) {
                record.connectedToDestination = true;
              }
            }
            return target;
          },
          disconnect() {},
          start(when: number) {
            record.startAt = when;
            sounds.push(record);
          },
          stop(when: number) {
            record.stopAt = when;
            record.durationMs =
              Math.round((when - (record.startAt as number)) * 100000) / 100;
          },
        };
      }

      createGain() {
        const record: Record<string, unknown> = {};
        return {
          record,
          gain: param(record, 'gain'),
          // A tone nobody can hear is scheduled exactly like one they can, so
          // the graph is followed too: reaching the destination is the part
          // that makes a sound a sound.
          connect(target: { kind?: string }) {
            if (target && target.kind === 'destination') {
              record.reachesDestination = true;
              const owner = record.owner as Record<string, unknown> | undefined;
              if (owner) {
                owner.connectedToDestination = true;
              }
            }
            return target;
          },
          disconnect() {},
        };
      }
    }

    (window as unknown as { AudioContext: unknown }).AudioContext =
      RecordingAudioContext;
  });
}

/** Everything the game has played so far, in order. */
export async function sounds(page: Page): Promise<RecordedSound[]> {
  return page.evaluate(
    () => (window as unknown as { __sounds: RecordedSound[] }).__sounds,
  );
}

/** Where the ball is, read back off the canvas by its colour. */
export async function ballAt(page: Page): Promise<Point | null> {
  return (await sample(page)).ball;
}

/**
 * The top and bottom of a paddle, read back off the canvas by its colour.
 *
 * `sample` below scans the same two columns at the same threshold, off the
 * image it is already taking. The two readings have to agree, so a change to
 * either the paddle's colour or the threshold belongs in both.
 */
export async function paddleAt(page: Page, side: 'player' | 'cpu'): Promise<Span> {
  return page.evaluate((column: number) => {
    const canvas = document.getElementById('court') as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('no canvas context');
    }
    const { data, height } = context.getImageData(column, 0, 1, canvas.height);
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      const i = y * 4;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
        top = top === -1 ? y : top;
        bottom = y;
      }
    }
    return { top, bottom };
  }, side === 'player' ? 30 : 770);
}

/**
 * Where the canvas is on screen, which is not where the court is: the page is
 * responsive, so the canvas is drawn at 800x480 and displayed at whatever width
 * is going. Tests that point at the court have to go through this rather than
 * assume the two agree.
 */
export async function courtBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const rect = (
      document.getElementById('court') as HTMLCanvasElement
    ).getBoundingClientRect();
    return { left: rect.left, top: rect.top, height: rect.height };
  });
}

/** A finger on the screen, put down, dragged about, and lifted. */
export interface Finger {
  /** Land the finger at `point`. */
  down(point: Point): Promise<void>;
  /** Drag it to `point`, still down. */
  moveTo(point: Point): Promise<void>;
  /** Lift it off. */
  up(): Promise<void>;
  /** What the page made of the gesture since the finger last landed. */
  seen(): Promise<PointerTally>;
}

/** What the page has made of the finger so far. */
export interface PointerTally {
  moves: number;
  /**
   * Of those, the ones a finger sent. A test that asserts the paddle did *not*
   * move needs to know one of these arrived, or it is asserting about a gesture
   * the page never heard.
   */
  touchMoves: number;
  /** The browser took the gesture for a scroll and stopped reporting it. */
  cancelled: boolean;
}

/** Have the page count the pointer events it sees, once per page. */
async function countPointerEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const counted = window as unknown as { __pointer?: PointerTally };
    if (counted.__pointer !== undefined) {
      return;
    }
    const tally: PointerTally = { moves: 0, touchMoves: 0, cancelled: false };
    counted.__pointer = tally;
    // Registered after the game's own listener, so a count that has moved means
    // the game has already had this event.
    window.addEventListener('pointermove', (event) => {
      tally.moves += 1;
      if (event.pointerType === 'touch') {
        tally.touchMoves += 1;
      }
    });
    window.addEventListener('pointercancel', () => {
      tally.cancelled = true;
    });
  });
}

async function pointerTally(page: Page): Promise<PointerTally> {
  return page.evaluate(
    () => ({ ...(window as unknown as { __pointer: PointerTally }).__pointer }),
  );
}

/**
 * Wait until the page has seen the finger move.
 *
 * The clock is Playwright's and it is held still, but Chromium's touch delivery
 * runs on the browser's own frames and not on that clock: a move dispatched now
 * reaches the page a moment later, which is after `runFrames` has already run
 * the game forward. Left alone the paddle is one move behind every assertion,
 * and two runs of the same script disagree about where it was.
 *
 * Polled from here rather than with `waitForFunction`, because the page's
 * timers and animation frames are the frozen ones and would never poll. Node's
 * clock is the real one.
 *
 * A gesture the browser decides is a scroll ends in `pointercancel` and sends
 * nothing further. That is the answer for a drag that began off the court, and
 * it is an answer, so it ends the wait too.
 */
async function seenTheFinger(page: Page, moves: number): Promise<void> {
  const deadline = Date.now() + 2000;
  for (;;) {
    const tally = await pointerTally(page);
    if (tally.cancelled || tally.moves > moves) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error('the page never saw the finger move');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * A finger, dispatched through CDP.
 *
 * `page.touchscreen` can tap and nothing else, and a paddle that follows a
 * finger is all in the drag. `Input.dispatchTouchEvent` sends the real thing:
 * genuine pointer events carrying `pointerType: 'touch'`, implicit capture
 * included, so the game sees what a phone sends it rather than a mouse in
 * disguise.
 *
 * Returned a piece at a time rather than as one gesture because the interesting
 * assertions are mid-drag — where the paddle is after this move, before the
 * next one — and frames have to run between them.
 */
export async function finger(page: Page): Promise<Finger> {
  const session = await page.context().newCDPSession(page);
  await countPointerEvents(page);
  let down = false;

  return {
    async down(point: Point): Promise<void> {
      down = true;
      await page.evaluate(() => {
        const tally = (window as unknown as { __pointer: PointerTally }).__pointer;
        tally.moves = 0;
        tally.touchMoves = 0;
        tally.cancelled = false;
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.x, y: point.y }],
      });
    },
    async moveTo(point: Point): Promise<void> {
      if (!down) {
        throw new Error('the finger is not on the screen to move');
      }
      const before = (await pointerTally(page)).moves;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x, y: point.y }],
      });
      await seenTheFinger(page, before);
    },
    async up(): Promise<void> {
      if (!down) {
        throw new Error('the finger is not on the screen to lift');
      }
      down = false;
      // A touchEnd carries the points still down, and this was the only one.
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    },
    async seen(): Promise<PointerTally> {
      return pointerTally(page);
    },
  };
}

/** Land a finger on `from`, drag it to `to`, and lift it. */
export async function touchDrag(page: Page, from: Point, to: Point): Promise<void> {
  const hand = await finger(page);
  await hand.down(from);
  await hand.moveTo(to);
  await hand.up();
}

/**
 * One computed CSS property of an element on the assembled page.
 *
 * Computed rather than declared: it is what the browser resolved after the
 * whole stylesheet, and it is the value the browser itself acts on when it
 * decides whether a gesture is the page's to pan with or the game's to play.
 */
export async function computedStyle(
  page: Page,
  selector: string,
  property: string,
): Promise<string> {
  return page.evaluate(
    ({ selector, property }) => {
      const element = document.querySelector(selector);
      if (element === null) {
        throw new Error(`nothing on the page matches ${selector}`);
      }
      return getComputedStyle(element).getPropertyValue(property);
    },
    { selector, property },
  );
}

/** An image of the whole court, for asking whether anything moved. */
export async function courtImage(page: Page): Promise<string> {
  return page.evaluate(() =>
    (document.getElementById('court') as HTMLCanvasElement).toDataURL(),
  );
}

export async function score(page: Page): Promise<{ player: string; cpu: string }> {
  return {
    player: (await page.locator('#player-score').textContent()) ?? '',
    cpu: (await page.locator('#cpu-score').textContent()) ?? '',
  };
}

/** Run the game forward whole animation frames at a time. */
export async function runFrames(page: Page, frames: number): Promise<void> {
  await page.clock.runFor(frames * FRAME_MS);
}

/** What the game showed, and how much it had played, at the end of one frame. */
export interface Sample {
  frame: number;
  played: number;
  ball: Point | null;
  /** Where each paddle was drawn, the same reading `paddleAt` takes. */
  player: Span;
  cpu: Span;
  playerScore: string;
  cpuScore: string;
}

/**
 * Play the game forward frame by frame, noting after each one where the ball
 * is and how many sounds have been played. That is enough to say what happened
 * around a given sound: which way the ball was travelling before it, and which
 * way afterwards.
 */
export async function recordFrames(page: Page, frames: number): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    await page.clock.runFor(FRAME_MS);
    samples.push({ frame, ...(await sample(page)) });
  }
  return samples;
}

/** The frame on which the nth sound (1-based) was played, or -1. */
export function frameOfSound(samples: Sample[], nth: number): number {
  return samples.findIndex((entry) => entry.played >= nth);
}

async function sample(page: Page): Promise<Omit<Sample, 'frame'>> {
  return page.evaluate(() => {
    const canvas = document.getElementById('court') as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    const played = (window as unknown as { __sounds: unknown[] }).__sounds.length;
    const playerScore = document.getElementById('player-score')?.textContent ?? '';
    const cpuScore = document.getElementById('cpu-score')?.textContent ?? '';
    if (context === null) {
      return {
        played,
        ball: null,
        player: { top: -1, bottom: -1 },
        cpu: { top: -1, bottom: -1 },
        playerScore,
        cpuScore,
      };
    }
    const { data, width, height } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    let sumX = 0;
    let sumY = 0;
    let found = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i] > 200 && data[i + 1] > 150 && data[i + 1] < 240 && data[i + 2] < 160) {
          sumX += x;
          sumY += y;
          found += 1;
        }
      }
    }
    // The same column and the same threshold `paddleAt` uses, off the reading
    // of the canvas this frame already took.
    const spanAt = (column: number) => {
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
        const i = (y * width + column) * 4;
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
          top = top === -1 ? y : top;
          bottom = y;
        }
      }
      return { top, bottom };
    };

    return {
      played,
      ball: found === 0 ? null : { x: sumX / found, y: sumY / found },
      player: spanAt(30),
      cpu: spanAt(770),
      playerScore,
      cpuScore,
    };
  });
}

/**
 * How far the thing moved from one frame to the next, frame by frame.
 *
 * A reading of -1 is nothing found on the canvas, which is not a distance, so
 * the run breaks there rather than reporting a jump off the edge of the court.
 */
export function frameSteps(readings: (number | null)[]): number[] {
  const steps: number[] = [];
  for (let i = 1; i < readings.length; i += 1) {
    const from = readings[i - 1];
    const to = readings[i];
    if (from === null || to === null || from < 0 || to < 0) {
      throw new Error(`nothing to measure between frames ${i - 1} and ${i}`);
    }
    steps.push(to - from);
  }
  return steps;
}

/** The biggest change from one step to the next: how uneven the motion was. */
export function unevenness(steps: number[]): number {
  let worst = 0;
  for (let i = 1; i < steps.length; i += 1) {
    worst = Math.max(worst, Math.abs(steps[i] - steps[i - 1]));
  }
  return worst;
}

/**
 * How many times the ball turned around at a paddle across these samples.
 *
 * A strike is the only thing that reverses the ball horizontally, and the trail
 * shows it whether or not a sound announced it — which is what lets a muted
 * stretch be checked for the strike it silenced. A ball that vanishes off the
 * court and reappears on the centre spot has been served, not struck, so the
 * jump breaks the run rather than counting as a reversal.
 */
export function paddleStrikes(samples: Sample[]): number {
  const SERVE_JUMP = 20;
  let strikes = 0;
  let previous: Point | null = null;
  let heading = 0;

  for (const entry of samples) {
    const ball = entry.ball;
    if (ball === null) {
      previous = null;
      heading = 0;
      continue;
    }
    if (previous !== null) {
      const dx = ball.x - previous.x;
      if (dx !== 0 && Math.abs(dx) < SERVE_JUMP) {
        const direction = Math.sign(dx);
        if (heading !== 0 && direction !== heading) {
          strikes += 1;
        }
        heading = direction;
      } else {
        heading = 0;
      }
    }
    previous = ball;
  }
  return strikes;
}
