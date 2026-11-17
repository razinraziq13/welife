import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // Controls are disabled until the stored preferences have loaded from the engine.
  // (Asserted on a radio: Playwright does not treat a disabled <fieldset> itself as disabled.)
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: /System/ }),
  ).toBeEnabled();
}

async function choose(page: Page, group: string, option: string) {
  await page.getByRole('group', { name: group }).locator('label', { hasText: option }).click();
}

test('theme choice applies immediately and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSettings(page);
  await choose(page, 'Theme', 'Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('Saved on this device')).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: /Dark/ }),
  ).toBeChecked();
});

test('"System" theme follows the device colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSettings(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('text size, contrast and motion are applied to the page', async ({ page }) => {
  await openSettings(page);
  await choose(page, 'Text size', '125%');
  await expect(page.locator('html')).toHaveAttribute('style', /font-size: 125%/);
  await choose(page, 'Contrast', 'High');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await choose(page, 'Motion', 'Reduced');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('style', /font-size: 125%/);
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
});

test('settings radios are operable with the keyboard', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSettings(page);
  const system = page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: /System/ });
  await system.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: /Light/ }),
  ).toBeChecked();
});

test('keyboard shortcuts navigate and open help, and can be turned off', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('engine-status')).toBeVisible();

  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/settings$/);
  // Focus moves to the new page heading for screen-reader and keyboard users.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('switch', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('switch', { name: 'Keyboard shortcuts' })).not.toBeChecked();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');
  await expect(dialog).toBeHidden();

  // The help dialog stays reachable from Settings even with shortcuts off.
  await page.getByRole('button', { name: 'View shortcuts' }).click();
  await expect(dialog).toBeVisible();
});
