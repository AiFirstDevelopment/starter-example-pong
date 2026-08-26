import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2020',
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
