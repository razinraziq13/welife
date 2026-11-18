import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { advanceOnce, createLife } from './helpers';
import { adultSaveJson } from './adultSave';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test('family, people, the family tree and the calendar work from birth (M3)', async ({ page }) => {
  const saveId = await createLife(page, { seed: 'e2e-people' });
  await page.getByRole('link', { name: 'Social' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Social' })).toBeVisible();
  const parent = page.getByRole('link', { name: /Parent · age/ }).first();
  await expect(parent).toBeVisible();
  await parent.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your relationship' })).toBeVisible();
  await expectAccessible(page);

  await page.goto(`/play/${saveId}/family`);
  await expect(page.getByRole('heading', { level: 1, name: 'Family tree' })).toBeVisible();
  await expect(page.getByText('You', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  await page.getByLabel('Activity').selectOption({ label: 'Spend time with family (6 h)' });
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText(/Spend time with family × 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Book' }).click();
  await expect(page.getByRole('link', { name: 'Health check-up' })).toBeVisible();
  await expectAccessible(page);

  // The plan runs when the month ends, and the family's money moves through the ledger.
  await advanceOnce(page);
  await page.getByRole('link', { name: 'Finance' }).last().click();
  await expect(page.getByText(/This month they took in/)).toBeVisible();
});

test.describe('an adult life', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson();
  });

  async function openAdult(page: Page): Promise<string> {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'adult.welife.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
    return /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';
  }

  test('career, finance and people screens work for an adult (M4) and are accessible', async ({
    page,
  }) => {
    const saveId = await openAdult(page);
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByRole('heading', { level: 1, name: 'Career' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Your job|Work/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Job board' })).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/play/${saveId}/finance`);
    await expect(page.getByRole('heading', { level: 2, name: 'Your accounts' })).toBeVisible();
    await expect(page.getByText('Current account', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Recent transactions' }),
    ).toBeVisible();
    await expectAccessible(page);

    // Move money and see the result explained.
    await page
      .getByLabel(/^Amount/)
      .first()
      .fill('1');
    await page.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByText('Money moved.')).toBeVisible();

    // An invalid amount is explained instead of sent.
    await page
      .getByLabel(/^Amount/)
      .first()
      .fill('abc');
    await page.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter an amount');

    await page.goto(`/play/${saveId}/social`);
    await page.locator('label', { hasText: /^Others/ }).click();
    await page
      .getByRole('link', { name: /age \d+/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Do something together' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Chat · 2 h$/ }).click();
    await expect(
      page
        .getByRole('status')
        .or(page.locator('[aria-live="polite"]'))
        .filter({ hasText: /chat/i })
        .first(),
    ).toBeVisible();
    await expectAccessible(page);
  });
});
