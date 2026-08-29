import { defineConfig, devices } from '@playwright/test';

import { TOUCH_DEVICE } from './tests/e2e/support/pong';
import {
  TABLE_PORT,
  TABLE_URL,
  TEST_IDLE_TIMEOUT_MS,
  TEST_LIVENESS_TIMEOUT_MS,
} from './tests/e2e/support/table';

const PORT = 4173;

/** The one spec that needs a finger, and the only one the phone project runs. */
const TOUCH_SPEC = /touch\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    // Desktop Chrome has no touch, so the touch spec cannot run here — and the
    // rest of the suite stays on the desktop it has always been written for.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: TOUCH_SPEC,
    },
    {
      name: 'mobile-chrome',
      use: { ...TOUCH_DEVICE },
      testMatch: TOUCH_SPEC,
    },
  ],
  webServer: [
    {
      // The tests drive the built app, the same bundle a player would load.
      command: 'npm run build && npm run preview',
      url: `http://localhost:${PORT}`,
      // Never reuse a server someone left running: the build is part of this
      // command, so a reused server means the suite passes against whatever was
      // last built rather than against the source in front of it.
      reuseExistingServer: false,
      timeout: 120_000,
      // The bundle reads the table server's address at build time, and this
      // build is for a suite whose table server is the one started below.
      env: { VITE_TABLE_URL: TABLE_URL },
    },
    {
      // A real Worker running the real Durable Object, locally. The networked
      // tests are about what two browsers and a server do to each other, and a
      // stub in place of the server would answer the wrong question.
      command: [
        'npx wrangler dev --config worker/wrangler.toml',
        `--port ${TABLE_PORT} --local`,
        // Production tables idle out after a minute; a suite cannot wait one.
        `--var IDLE_TIMEOUT_MS:${TEST_IDLE_TIMEOUT_MS}`,
        // And a silent socket keeps its seat for ninety seconds in production,
        // which is three minutes of suite to watch one go and one stay.
        `--var LIVENESS_TIMEOUT_MS:${TEST_LIVENESS_TIMEOUT_MS}`,
      ].join(' '),
      // Something to ask that is not a game socket, so readiness does not depend
      // on taking one of the two paddles at a table.
      url: `http://127.0.0.1:${TABLE_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
