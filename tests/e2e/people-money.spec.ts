import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { advanceOnce, createLife } from './helpers';
import { adultSaveJson } from './adultSave';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  // Scan from the top: on phones the fixed bottom tab bar otherwise covers whatever control
  // happens to sit under it at the current scroll position, which axe reports as too small.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
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

  test('activities hub, grouped person actions and career play work and are accessible', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const saveId = await openAdult(page);
    // Activities Hub: search, do a paid activity, favourite it.
    await page.goto(`/play/${saveId}/activities`);
    await expect(page.getByRole('heading', { level: 1, name: 'Activities' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Suggested for you' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('searchbox', { name: 'Search activities' }).fill('cinema');
    await page.getByRole('button', { name: 'Do it: Go to the cinema' }).click();
    await expect(page.getByText('The film was better than the trailer.')).toBeVisible();
    await page.getByRole('button', { name: 'Add Go to the cinema to favourites' }).click();
    await expect(
      page.getByRole('button', { name: 'Remove Go to the cinema from favourites' }),
    ).toBeVisible();
    // A locked activity says why.
    await page.getByRole('searchbox', { name: 'Search activities' }).fill('doctor');
    await page.getByRole('button', { name: 'Do it: See a doctor' }).click();
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-kind', 'success');
    // Pressing it again explains why it cannot be done, in a pop-up. (The button is marked
    // unavailable, so Playwright will not click it; pressing it from the keyboard works, as a
    // tap does on a phone.)
    await page.getByRole('button', { name: 'Do it: See a doctor' }).focus();
    await page.keyboard.press('Enter');
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toHaveAttribute('data-kind', 'error');
    // On screen, wherever the page is scrolled (not just present in the page).
    await expect(feedback).toBeInViewport();
    await expect(feedback).toContainText('Not possible: Once a month; you have already done this.');
    await feedback.getByRole('button', { name: 'Close message' }).click();
    await expect(feedback).toHaveCount(0);

    // The barber or salon: pick a new style with a preview, then pay for it.
    await page.getByRole('searchbox', { name: 'Search activities' }).fill('salon');
    await page.getByRole('button', { name: 'Do it: Barber or salon' }).click();
    const salon = page.getByRole('dialog', { name: 'Barber or salon' });
    await expect(salon.getByRole('button', { name: 'Choose a new look' })).toBeDisabled();
    // Any style other than the current one.
    await salon.getByRole('radio', { checked: false }).first().check({ force: true });
    await expect(salon.getByRole('img', { name: /Preview of/ })).toBeVisible();
    await expectAccessible(page);
    await salon.getByRole('button', { name: 'Get this look' }).click();
    await expect(page.getByText(/You have a new look: /)).toBeVisible();

    // Career play on the Career tab.
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByRole('heading', { level: 2, name: 'Your career path' })).toBeVisible();
    await expect(page.getByText('Professional reputation')).toBeVisible();
    await expectAccessible(page);

    // Single adults can find profiles from the Dating App.
    await page.goto(`/play/${saveId}/social`);
    await expect(page.getByRole('heading', { level: 2, name: 'Dating App' })).toBeVisible();
    await page.getByRole('button', { name: /Look for love/ }).click();
    await expect(page.getByText(/seems interested in you|No spark this time/)).toBeVisible();
    await expectAccessible(page);

    // A person's actions are grouped, and closed ones explain why.
    await page.goto(`/play/${saveId}/social`);
    await page
      .getByRole('link', { name: /Parent · age/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 3, name: 'Talk' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Family' })).toBeVisible();
    await expectAccessible(page);
  });

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

test.describe('legacy, media, achievements and the event creator (M7-M8)', () => {
  test.describe.configure({ timeout: 150_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-legacy');
  });

  test('social media, a will, achievements and biography; screens are accessible', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'legacy.welife.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
    const saveId = /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';

    await page.goto(`/play/${saveId}/media`);
    await expect(page.getByRole('heading', { level: 1, name: 'Social media' })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Handle').fill('robin_e2e');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Account created.')).toBeVisible();
    await page.getByRole('button', { name: 'Informative', exact: true }).first().click();
    await expect(page.getByText(/Posted\.|backfired/)).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/play/${saveId}/legacy`);
    await expect(page.getByRole('heading', { level: 1, name: 'Legacy' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'The family line' })).toBeVisible();
    const share = page
      .getByRole('group', { name: 'Shares (percent)' })
      .getByRole('spinbutton')
      .first();
    await share.fill('100');
    await page.getByRole('button', { name: 'Save will' }).click();
    await expect(page.getByText('Your will has been saved.')).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/play/${saveId}/achievements`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Achievements and biography' }),
    ).toBeVisible();
    await expect(page.getByText('Coming of age', { exact: false }).first()).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('region', { name: 'Life stories' }).getByRole('link').first().click();
    await expect(page.getByRole('region', { name: 'At a glance' })).toBeVisible();
    await expectAccessible(page);
  });

  test('make a pack in the event creator, then enable it for a life', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'packs.welife.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
    const saveId = /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';

    await page.goto('/editor');
    await expect(page.getByRole('heading', { level: 1, name: 'Event creator' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'New pack' }).click();
    await page.getByLabel('Title').fill('A friendly neighbour');
    await expect(page.getByText('No problems found.')).toBeVisible();
    await page.getByRole('button', { name: 'Run test' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Eligible|Not eligible/ }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Save to library' }).click();
    await expect(page.getByText(/Saved My pack 1\.0\.0/)).toBeVisible();
    // A broken pack is refused with field paths and never stored.
    await page.getByLabel('Event id').fill('X');
    await expect(page.getByText(/events\.0\.id/)).toBeVisible();

    await page.goto(`/play/${saveId}/rules`);
    await page.getByRole('button', { name: 'Enable My pack 1.0.0' }).click();
    await expect(page.getByText('My pack 1.0.0 is enabled for this life.')).toBeVisible();
    await expectAccessible(page);

    await page.goto('/gallery');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Achievement gallery' }),
    ).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('rival job offers', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-rival', { rivalOffer: true });
  });

  test('a rival offer shows on Career and you can ask your employer to match it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'rival.welife.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(page).toHaveURL(/\/play\/[^/]+\/life$/);
    const saveId = /\/play\/([^/]+)\//.exec(page.url())?.[1] ?? '';
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByText(/They approached you/)).toBeVisible();
    await expect(page.getByText(/Accepting means leaving that job/)).toBeVisible();
    await expectAccessible(page);
    const match = page.getByRole('button', { name: /to match \(\d+% chance\)$/ });
    await match.click();
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toBeInViewport();
    await expect(feedback).toContainText(/matched the offer|would not match it/);
    if (((await feedback.textContent()) ?? '').includes('would not match')) {
      // Refused: the offer is still open, and asking again explains why it cannot be done.
      await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
      const again = page.getByRole('button', { name: /to match$/ });
      await again.focus();
      await page.keyboard.press('Enter');
      await expect(feedback).toHaveAttribute('data-kind', 'error');
      await expect(feedback).toContainText('already asked your employer');
    } else {
      await expect(page.getByText(/They approached you/)).toHaveCount(0);
    }
  });
});
