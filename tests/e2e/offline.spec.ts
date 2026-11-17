import { expect, test } from './fixtures';

// Playwright can only intercept/emulate offline service-worker behaviour reliably in Chromium.
test.skip(({ browserName }) => browserName !== 'chromium', 'Service worker offline test: Chromium');

test('after the first visit the app boots and runs fully offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('engine-status')).toContainText('Connected');

  // Wait until the service worker has installed, precached everything and taken control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if ((await page.evaluate(() => navigator.serviceWorker.controller)) === null) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await expect(page.getByTestId('offline-status')).toContainText('Ready to play');

  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'WeLife' })).toBeVisible();
  // The engine worker script also comes from the cache, and IndexedDB works offline.
  await expect(page.getByTestId('engine-status')).toContainText('Connected');

  // Deep links work offline too (navigation fallback to the cached app shell).
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.getByRole('group', { name: 'Theme' }).locator('label', { hasText: 'Dark' }).click();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
