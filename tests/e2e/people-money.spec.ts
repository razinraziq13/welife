import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { advanceOnce, createLife } from './helpers';
import { adultSaveJson } from './adultSave';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.help} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
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

test.describe('companies and property (M5)', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-tycoon');
  });

  test('start and run a company, buy property and invest; screens are accessible', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'tycoon.welife.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
    const saveId = /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';

    await page.goto(`/play/${saveId}/business`);
    await expect(page.getByRole('heading', { level: 1, name: 'Business' })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Kind of business').selectOption({ label: 'Consultancy' });
    await page.getByLabel('Company name').fill('Robin Advisory');
    await page.getByLabel(/^Your investment/).fill('200000');
    await page.getByRole('button', { name: 'Start the company' }).click();
    await expect(page.getByText('Robin Advisory is open for business.')).toBeVisible();
    await page.getByRole('link', { name: /Robin Advisory/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Robin Advisory' })).toBeVisible();
    await page.getByRole('button', { name: /^Hire one person at/ }).click();
    await expect(page.getByText(/Staff set to/)).toBeVisible();
    await expectAccessible(page);

    // A month of trading produces an operating statement.
    const advance = page.getByTestId('advance-month').locator('visible=true').first();
    const before = await advance.textContent();
    await advance.click();
    // The month is committed when the Advance button moves on; until then, answer any
    // decision (several can fall in one month) with an available choice.
    const dialog = page.getByRole('dialog');
    await expect
      .poll(
        async () => {
          if (await dialog.isVisible()) {
            const choice = dialog
              .getByRole('group', { name: 'Choices' })
              .getByRole('button', { disabled: false })
              .first();
            if ((await choice.count()) > 0)
              await choice.click({ timeout: 2_000 }).catch(() => null);
            return 'deciding';
          }
          return (await advance.textContent()) === before ? 'waiting' : 'done';
        },
        { timeout: 60_000, intervals: [300] },
      )
      .toBe('done');
    await expect(page.getByRole('table', { name: 'Operating statement' })).toBeVisible();

    await page.goto(`/play/${saveId}/property`);
    await expect(page.getByRole('heading', { level: 1, name: 'Property' })).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/play/${saveId}/finance`);
    await expect(page.getByRole('heading', { level: 2, name: 'Investments' })).toBeVisible();
    await page.getByRole('textbox', { name: /^Invest [(]/ }).fill('500');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await expect(page.getByText('Investment bought.')).toBeVisible();
  });
});

test.describe('institutions and civic life (M6)', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-civic');
  });

  test('apply for a visa, join a party, choose a belief; civic screens are accessible', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'civic.welife.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
    const saveId = /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';

    // World and migration: country rules, a visa application.
    await page.goto(`/play/${saveId}/world`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'World and migration' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your status' })).toContainText('United Kingdom');
    await expectAccessible(page);
    await page
      .getByLabel('Country', { exact: true })
      .selectOption({ label: 'United Arab Emirates' });
    await expect(
      page.getByText('Citizenship is by descent; naturalisation is by nomination only.', {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Apply: Employment residence visa, United Arab Emirates' })
      .click();
    await expect(page.getByText(/Application sent/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Applications' })).toContainText(
      'Waiting for a decision',
    );
    await expectAccessible(page);

    // Politics: join a fictional party.
    await page.goto(`/play/${saveId}/politics`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Politics and public life' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText('You joined the party.')).toBeVisible();
    await expectAccessible(page);

    // Religion: choose a belief.
    await page.goto(`/play/${saveId}/religion`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Religion and belief' }),
    ).toBeVisible();
    const belief = page.getByLabel('Belief', { exact: true });
    const next = (await belief.inputValue()) === 'buddhism' ? 'Sikhism' : 'Buddhism';
    await belief.selectOption({ label: next });
    await expect(page.getByText('Belief updated.')).toBeVisible();
    await expectAccessible(page);

    for (const [path, heading] of [
      ['health', 'Health care'],
      ['legal', 'Law'],
      ['military', 'Military service'],
    ] as const) {
      await page.goto(`/play/${saveId}/${path}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expectAccessible(page);
    }
  });
});
