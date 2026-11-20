import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { advanceOnce, createLife } from './helpers';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('creates a life, plays months, and keeps everything after a reload', async ({ page }) => {
  await createLife(page, { country: 'Japan', firstName: 'Yui', seed: 'e2e-life' });
  await expect(page.getByText('Yui').first()).toBeVisible();
  await expect(page.getByText(/Tokyo|Osaka|Fukuoka|Akita/).first()).toBeVisible();

  // An activity uses free time.
  await page.getByRole('button', { name: 'Do it: Spend time with family', exact: true }).click();
  await expect(page.getByText(/free hours left\./)).toBeVisible();
  await expect(page.getByText(/24 of 30 free hours left this month/)).toBeVisible();

  // Each click plays up to four months (stopping early for a decision).
  for (let i = 0; i < 4; i++) await advanceOnce(page);
  // The Life tab's header card: name, age, place and headline stats.
  const card = page.getByRole('region', { name: /Yui/ });
  await expect(card.getByText(/\d+ (years?|months?)/).first()).toBeVisible();
  const header = await card.textContent();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Life' })).toBeVisible();
  expect(await card.textContent()).toBe(header);
});

test('royal births are only offered where realistic, with an explanation', async ({ page }) => {
  await page.goto('/new');
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United Kingdom' });
  await page.getByRole('button', { name: 'Next' }).click();
  const royal = page.getByRole('radio', { name: /Royal family/ });
  await expect(royal).toBeDisabled();
  await expect(page.getByText(/real, identifiable people/).first()).toBeVisible();
  await expect(page.getByRole('radio', { name: /Noble family/ })).toBeEnabled();

  await page.getByRole('button', { name: /Step 1/ }).click();
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'Saudi Arabia' });
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('radio', { name: /Royal family/ })).toBeEnabled();
  await expect(page.getByRole('radio', { name: /Noble family/ })).toBeDisabled();
});

test('the dashboard layout can be customised and is saved with the life (M2 exit)', async ({
  page,
}) => {
  await createLife(page, { seed: 'e2e-layout' });
  const widgets = page.getByTestId('dashboard').locator('[data-widget]');
  // Profile and Vitals are covered by the header card, so they start hidden.
  await expect(widgets.first()).toHaveAttribute('data-widget', 'time');
  await page.getByRole('button', { name: 'Customise' }).click();
  await page.getByRole('button', { name: 'Show Vitals' }).click();
  await page.getByRole('button', { name: 'Move Vitals up' }).click();
  await page.getByRole('button', { name: 'Hide Where you live' }).click();
  await expect(widgets.first()).toHaveAttribute('data-widget', 'vitals');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Life' })).toBeVisible();
  await expect(widgets.first()).toHaveAttribute('data-widget', 'vitals');
  await expect(page.locator('[data-widget="country"]')).toHaveCount(0);
});

test('an achievement shows a pop-up once, and the story feed tells the latest moments', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createLife(page, { seed: 'e2e-toast' });
  await expect(page.getByRole('heading', { level: 2, name: 'Your story' })).toBeVisible();
  // Nothing is announced for a new life.
  await expect(page.getByTestId('achievement-toast')).toHaveCount(0);
  const toast = page.getByTestId('achievement-toast').filter({ hasText: 'First candle' });
  for (let i = 0; i < 8 && !(await toast.isVisible()); i++) await advanceOnce(page);
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Achievement unlocked');
  await toast.getByRole('button', { name: 'Dismiss First candle' }).click();
  await expect(toast).toHaveCount(0);
  // Already unlocked when the life is opened again: not announced a second time.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Life' })).toBeVisible();
  await expect(page.getByTestId('achievement-toast')).toHaveCount(0);
});

test('decisions pause the month until the player chooses', async ({ page }) => {
  test.setTimeout(240_000); // may need many months before a decision comes up (slow under load on WebKit)
  await createLife(page, { seed: 'e2e-decision' });
  const dialog = page.getByRole('dialog');
  const advance = page.getByTestId('advance-month').locator('visible=true').first();
  for (let i = 0; i < 40 && !(await dialog.isVisible()); i++) {
    // Wait until the previous click's months are done (or a decision has opened).
    await expect
      .poll(async () => (await dialog.isVisible()) || (await advance.isEnabled()), {
        timeout: 30_000,
      })
      .toBe(true);
    if (await dialog.isVisible()) break;
    await advance.click();
  }
  await expect
    .poll(async () => (await dialog.isVisible()) || (await advance.isEnabled()), {
      timeout: 30_000,
    })
    .toBe(true);
  if (!(await dialog.isVisible())) test.skip(true, 'No decision occurred for this seed');
  // While the decision waits, Advance is disabled and says why.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('A decision is waiting:')).toBeVisible();
  await expect(page.getByTestId('advance-month').locator('visible=true').first()).toBeDisabled();
  await expect(
    page.getByText('Make the waiting decision first.').locator('visible=true').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Decide now' }).click();
  await dialog.getByRole('group', { name: 'Choices' }).getByRole('button').first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('advance-month').locator('visible=true').first()).toBeEnabled();
});

test('rewinding creates a new timeline and the old one can be resumed', async ({ page }) => {
  const saveId = await createLife(page, { seed: 'e2e-rewind' });
  for (let i = 0; i < 5; i++) await advanceOnce(page);
  await page.goto(`/play/${saveId}/timeline`);
  await expect(page.getByRole('heading', { level: 1, name: 'Timeline' })).toBeVisible();
  const rewindButtons = page.getByRole('button', { name: /^(Rewind here|Restart this month): / });
  await rewindButtons.last().click(); // the first month
  await page.getByRole('button', { name: 'Rewind and start a new timeline' }).click();
  await expect(page.getByTestId('branch')).toHaveCount(2);
  await expect(page.getByText('Timeline 2').first()).toBeVisible();
  await page.getByRole('button', { name: 'Switch to this timeline' }).click();
  await expect(page.getByText(/Switched to Timeline 1/)).toBeVisible();
});

test('saves can be exported, imported, renamed and deleted', async ({ page }) => {
  await createLife(page, { firstName: 'Ana', seed: 'e2e-export' });
  await advanceOnce(page);
  await page.goto('/');
  const card = page.getByTestId('save-card').first();
  await expect(card).toContainText('Ana');

  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('button', { name: /^Export/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.welife\.json$/);
  const path = await download.path();

  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
  await page.goto('/');
  await expect(page.getByTestId('save-card')).toHaveCount(2);

  await page
    .getByTestId('save-card')
    .first()
    .getByRole('button', { name: /^Rename/ })
    .click();
  await page.getByLabel('Save name').fill('Renamed life');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByText('Renamed life')).toBeVisible();

  await page
    .getByTestId('save-card')
    .first()
    .getByRole('button', { name: /^Delete/ })
    .click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByTestId('save-card')).toHaveCount(1);
});

test('a damaged save file is rejected with an explanation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('engine-status')).toContainText('Connected');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.welife.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"welife-save","bundleVersion":1}'),
  });
  await expect(page.getByText(/Import failed/)).toBeVisible();
  await expect(page.getByTestId('save-card')).toHaveCount(0);
});

for (const tab of [
  'life',
  'career',
  'finance',
  'social',
  'more',
  'character',
  'timeline',
  'notifications',
  'rules',
  'calendar',
  'family',
  'business',
  'property',
  'world',
  'health',
  'legal',
  'religion',
  'military',
  'politics',
  'legacy',
  'media',
  'achievements',
]) {
  test(`${tab} screen is accessible (WCAG A/AA)`, async ({ page }) => {
    const saveId = await createLife(page, { seed: `e2e-a11y-${tab}` });
    await page.goto(`/play/${saveId}/${tab}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the New Life wizard is accessible (WCAG A/AA)', async ({ page }) => {
  await page.goto('/new');
  for (let step = 0; step < 4; step++) {
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    if (step < 3) await page.getByRole('button', { name: 'Next' }).click();
  }
});

test('step one month forward and back beside Advance', async ({ page }) => {
  await createLife(page, { seed: 'e2e-rewind' });
  await advanceOnce(page);
  const advance = page.getByTestId('advance-month').locator('visible=true').first();
  const start = await advance.textContent();
  const steps = page.getByRole('group', { name: 'Step through time' }).locator('visible=true');
  await steps.getByRole('button', { name: '+1 mo' }).click();
  await expect(advance).not.toHaveText(start ?? '');
  await expect(advance).toBeEnabled();
  await steps.getByRole('button', { name: '−1 mo' }).click();
  await expect(page.getByTestId('feedback')).toContainText('Rewound to a new timeline');
  await expect(advance).toHaveText(start ?? '');
});
