import { defineConfig } from 'vitest/config';
import { aliases } from './aliases.ts';

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup/indexeddb.ts'],
    restoreMocks: true,
  },
});
