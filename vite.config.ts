import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2020',
  },
  test: {
    /**
     * Two projects, because the two halves of this repository are compiled
     * against different types.
     *
     * `tests/unit` is browser code under the root `tsconfig.json`, which types
     * it with `vite/client` and the DOM. `worker/tests` is Workers code under
     * `worker/tsconfig.json`, which is the only place `DurableObjectNamespace`
     * and its siblings exist — a test that drives `worker/table.ts` cannot
     * type-check anywhere else. Vitest runs both in node; the split is what
     * lets `npm run build` check each with the types it actually has.
     */
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { test: { name: 'worker', include: ['worker/tests/**/*.test.ts'] } },
    ],
  },
});
