import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export interface LifeOptions {
  country?: string;
  scenario?: string;
  firstName?: string;
  seed?: string;
}

/** Creates a life through the New Life wizard and waits for the Life tab. */
export async function createLife(page: Page, options: LifeOptions = {}): Promise<string> {
  await page.goto('/new');
  await expect(page.getByRole('heading', { level: 1, name: 'New life' })).toBeVisible();
  if (options.country)
    await page.getByLabel('Country', { exact: true }).selectOption({ label: options.country });
  await page.getByRole('button', { name: 'Next' }).click();
  if (options.scenario) {
    await page.locator('label', { hasText: options.scenario }).first().click();
  }
  await page.getByRole('button', { name: 'Next' }).click();
  if (options.firstName) await page.getByLabel('First name').fill(options.firstName);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('World seed').fill(options.seed ?? 'e2e-seed');
  await page.getByRole('button', { name: 'Start life' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Life' })).toBeVisible();
  const match = /\/play\/([^/]+)\/life$/.exec(page.url());
  return match?.[1] ?? '';
}

/** Clicks Advance Month once, answering any decision that appears. */
export async function advanceOnce(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog
      .getByRole('group', { name: 'Choices' })
      .getByRole('button', { disabled: false })
      .first()
      .click();
    await expect(dialog).toBeHidden();
    return;
  }
  const button = page.getByTestId('advance-month').locator('visible=true').first();
  const before = await button.textContent();
  await button.click();
  // One click plays up to four months: wait until the run has finished (Advance usable again
  // with a new month) or a decision dialog opened.
  await expect
    .poll(
      async () =>
        (await dialog.isVisible()) ||
        ((await button.textContent()) !== before && (await button.isEnabled())),
      { timeout: 30_000 },
    )
    .toBe(true);
}

/** Imports a save file (JSON text) from the home screen; returns the new save's id. */
export async function importSave(page: Page, json: string): Promise<string> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'fixture.welife.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
  return /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';
}
