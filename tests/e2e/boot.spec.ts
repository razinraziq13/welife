import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('boots, connects to the engine worker and reports device status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'WeLife' })).toBeVisible();
  await expect(page).toHaveTitle('WeLife');
  await expect(page.getByTestId('engine-status')).toContainText('Connected');
  await expect(page.getByTestId('engine-status')).toContainText('storage schema v1');
  await expect(page.getByTestId('storage-usage')).toContainText('Using');
});

test('has no horizontal scrolling at the current viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('engine-status')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const [name, path] of [
  ['home', '/'],
  ['settings', '/settings'],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${name} screen has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/Connected|Theme/).first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}

test('unknown addresses show a not-found page with a way home', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'WeLife' })).toBeVisible();
});

test('serves a valid web app manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe('WeLife');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
});
