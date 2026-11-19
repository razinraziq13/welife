import { defineConfig } from 'vitest/config';
import { aliases } from './aliases.ts';

/** The 10,000-month soak (spec §8). Several minutes long, so it runs on its own: `npm run soak`. */
export default defineConfig({
  resolve: { alias: aliases },
  test: {
    include: ['tests/soak/**/*.test.ts'],
    environment: 'node',
    testTimeout: 1_200_000,
  },
});
