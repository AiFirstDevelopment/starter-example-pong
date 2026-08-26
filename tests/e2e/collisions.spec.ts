import { expect, test } from '@playwright/test';

import {
  frameOfSound,
  installClock,
  paddleAt,
  recordFrames,
  recordSound,
  runFrames,
  sounds,
  type Sample,
} from './support/pong';

/** What each of the three events should sound like. */
const PADDLE_SOUND = { type: 'square', frequencyStart: 459, durationMs: 90 };
const WALL_SOUND = { type: 'square', frequencyStart: 226, durationMs: 16 };
const OUT_OF_PLAY_SOUND = {
  type: 'sawtooth',
  frequencyStart: 490,
  frequencyEnd: 120,
  durationMs: 300,
};

/** How far the ball travelled between two frames. */
function travel(samples: Sample[], from: number, to: number): { x: number; y: number } {
  const start = samples[from]?.ball;
  const end = samples[to]?.ball;
  if (!start || !end) {
    throw new Error(`the ball was not on the court between frames ${from} and ${to}`);
  }
  return { x: end.x - start.x, y: end.y - start.y };
}

test.beforeEach(async ({ page }) => {
  await installClock(page);
  await recordSound(page);
  await page.goto('/?seed=1');
  await page.keyboard.press('Space');
});

test('AC3: the computer moves to meet the ball and returns the serve', async ({
  page,
}) => {
  // The seeded serve climbs towards the top of the computer's half.
  await runFrames(page, 40);
  const chasing = await paddleAt(page, 'cpu');
  expect(chasing.top).toBeLessThan(200);

  const samples = await recordFrames(page, 80);
  const hit = frameOfSound(samples, 1);
  expect(hit).toBeGreaterThan(-1);

  const played = await sounds(page);
  expect(played).toHaveLength(1);
  expect(played[0]).toMatchObject(PADDLE_SOUND);

  // It happened at the computer's end, and sent the ball back.
  expect(samples[hit - 1]?.ball?.x).toBeGreaterThan(700);
  expect(travel(samples, hit + 1, hit + 6).x).toBeLessThan(0);
});

test('AC4: a paddle strike plays the paddle sound and nothing else, and turns the ball around', async ({
  page,
}) => {
  const samples = await recordFrames(page, 100);
  const hit = frameOfSound(samples, 1);
  expect(hit).toBeGreaterThan(-1);

  const played = await sounds(page);
  expect(played).toHaveLength(1);
  expect(played[0]).toMatchObject(PADDLE_SOUND);
  expect(played[0].frequencyStart).not.toBe(WALL_SOUND.frequencyStart);
  expect(played[0].type).not.toBe(OUT_OF_PLAY_SOUND.type);
  // Scheduled and audible: a tone wired to nothing is silence.
  expect(played[0].connectedToDestination).toBe(true);

  expect(travel(samples, hit - 6, hit - 1).x).toBeGreaterThan(0);
  expect(travel(samples, hit + 1, hit + 6).x).toBeLessThan(0);
});

test('AC5: a wall strike sounds different from a paddle strike and flips the ball over', async ({
  page,
}) => {
  const samples = await recordFrames(page, 170);
  const bounce = frameOfSound(samples, 2);
  expect(bounce).toBeGreaterThan(-1);

  const [paddle, wall] = await sounds(page);
  expect(wall).toMatchObject(WALL_SOUND);
  expect(wall.frequencyStart).not.toBe(paddle.frequencyStart);
  expect(wall.durationMs).not.toBe(paddle.durationMs);

  // It was travelling up, and afterwards it is travelling down.
  expect(travel(samples, bounce - 6, bounce - 1).y).toBeLessThan(0);
  expect(travel(samples, bounce + 1, bounce + 6).y).toBeGreaterThan(0);
  expect(samples[bounce]?.ball?.y).toBeLessThan(30);
});

test('AC6: the ball leaving the court plays a third sound, unlike the other two', async ({
  page,
}) => {
  const samples = await recordFrames(page, 230);
  const gone = frameOfSound(samples, 3);
  expect(gone).toBeGreaterThan(-1);

  const [paddle, wall, out] = await sounds(page);
  expect(out).toMatchObject(OUT_OF_PLAY_SOUND);

  for (const played of [paddle, wall, out]) {
    expect(played.connectedToDestination).toBe(true);
  }

  // Different in timbre, in pitch and in length from both of the others.
  for (const other of [paddle, wall]) {
    expect(out.type).not.toBe(other.type);
    expect(out.frequencyStart).not.toBe(other.frequencyStart);
    expect(out.durationMs).not.toBe(other.durationMs);
  }

  // It sounded as the ball ran off the left-hand edge, past the player.
  expect(samples[gone - 1]?.ball?.x ?? 0).toBeLessThan(20);
});
