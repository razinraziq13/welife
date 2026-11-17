import { test as base, expect } from '@playwright/test';

/** Fails any test whose page logs an uncaught error or console.error. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      await use(errors);
      expect(errors, 'unexpected browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
