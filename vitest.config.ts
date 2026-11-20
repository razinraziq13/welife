import { defineConfig } from 'vitest/config';
import { aliases } from './aliases.ts';

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup/indexeddb.ts'],
    restoreMocks: true,
    // Many tests simulate years of a life; 5 s is too tight when the whole suite runs in parallel.
    testTimeout: 30_000,
  },
});
