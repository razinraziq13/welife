import { fileURLToPath } from 'node:url';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** Import aliases shared by Vite and Vitest. Keep in sync with tsconfig.base.json `paths`. */
export const aliases: Record<string, string> = {
  '@contracts': fromRoot('./src/contracts'),
  '@engine': fromRoot('./src/engine'),
  '@persistence': fromRoot('./src/persistence'),
  '@worker': fromRoot('./src/worker'),
  '@app': fromRoot('./src/app'),
};
