import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { advanceOnce, createLife, importSave, closeRecap } from './helpers';
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
  await page.getByRole('link', { name: 'Money', exact: true }).last().click();
  await expect(page.getByText(/This month they took in/)).toBeVisible();
});

test.describe('an adult life', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson();
  });

  test('activities hub, grouped person actions and career play work and are accessible', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const saveId = await importSave(page, json);
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
    await page.getByText('Search filters', { exact: true }).click();
    await page.getByLabel('Minimum age').fill('130');
    await page.getByRole('button', { name: /Look for love/ }).click();
    await expect(page.getByText(/No new profiles fit your filters/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
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
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByRole('heading', { level: 1, name: 'Career' })).toBeVisible();
    await page.getByRole('button', { name: 'Job', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Your job|Work/ })).toBeVisible();
    await page.getByRole('button', { name: 'Job App', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Job App' })).toBeVisible();
    const jobApp = page.getByRole('region', { name: 'Job App' });
    const experienced = jobApp.getByRole('switch', {
      name: 'Executive and specialist openings only',
    });
    await experienced.click();
    await expect(experienced).toBeChecked();
    await expect(jobApp.getByText(/Requires \d+ years in/).first()).toBeVisible();
    await experienced.click();
    await page.getByRole('button', { name: 'Paths', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Choose a path' })).toBeVisible();
    for (const path of ['Musician', 'Actor', 'Film director'])
      await expect(
        page.getByRole('button', { name: `Start freelancing as ${path}` }),
      ).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Enlist|Open Military)$/ })).toBeVisible();
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
    const saveId = await importSave(page, json);

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
    // Wait for the full advance to finish and answer any decisions along the way.
    const dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('group', { name: 'Choices' }) });
    await expect
      .poll(
        async () => {
          if (await closeRecap(page)) return 'recap';
          if (await dialog.isVisible()) {
            const choice = dialog
              .getByRole('group', { name: 'Choices' })
              .getByRole('button', { disabled: false })
              .first();
            if ((await choice.count()) > 0)
              await choice.click({ timeout: 2_000 }).catch(() => null);
            return 'deciding';
          }
          return (await advance.isEnabled()) && (await advance.textContent()) !== before
            ? 'done'
            : 'waiting';
        },
        { timeout: 60_000, intervals: [300] },
      )
      .toBe('done');
    await expect(page.getByRole('table', { name: 'Operating statement' })).toBeVisible();
    // Consultancies win client briefs; any business can commission market research.
    await expect(page.getByRole('heading', { level: 2, name: 'Client contracts' })).toBeVisible();
    await page.getByRole('button', { name: /^Commission a survey/ }).click();
    await expect(page.getByTestId('feedback')).toContainText('The survey is in');
    await expect(page.getByText(/^At your price/)).toBeVisible();

    await page.goto(`/play/${saveId}/property`);
    await expect(page.getByRole('heading', { level: 1, name: 'Property' })).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/play/${saveId}/finance`);
    await page.getByText('Investments', { exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Investments' })).toBeVisible();
    await page.getByRole('button', { name: /^Buy a ticket/ }).click();
    await expect(page.getByTestId('feedback')).toContainText(/ticket/);
    await page.getByLabel(/^Roulette/).fill('1');
    await page.getByRole('button', { name: 'Spin' }).click();
    await expect(page.getByTestId('feedback')).toContainText('came up');
    await page.getByRole('link', { name: 'Open investments' }).click();
    await page.getByRole('link', { name: 'Crypto', exact: true }).click();
    await page.getByRole('link', { name: /^Bitcoin/ }).click();
    await page.getByLabel(/^Buy Bitcoin/).fill('500');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await expect(page.getByTestId('feedback')).toContainText('Investment bought');
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
    const saveId = await importSave(page, json);

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
    const saveId = await importSave(page, json);

    await page.goto(`/play/${saveId}/media`);
    await expect(page.getByRole('heading', { level: 1, name: 'Social media' })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Handle').fill('robin_e2e');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Account created.')).toBeVisible();
    await page.getByRole('button', { name: 'Informative', exact: true }).first().click();
    await expect(page.getByText(/Posted\.|backfired/)).toBeVisible();
    await expectAccessible(page);
    // The Life tab shows the account as a feed and can post too (E100).
    await page.goto(`/play/${saveId}/life`);
    await expect(page.getByRole('heading', { level: 2, name: 'Your socials' })).toBeVisible();
    const posts = page.getByRole('list', { name: /^Posts on / }).getByRole('listitem');
    await expect(posts).toHaveCount(1);
    await page
      .getByRole('group', { name: 'Post style' })
      .getByRole('button', { name: 'Funny' })
      .click();
    await expect(posts).toHaveCount(2);
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
    const saveId = await importSave(page, json);

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
    json = await adultSaveJson('e2e-rival-3', { rivalOffer: true });
  });

  test('a rival offer shows on Career and you can ask your employer to match it', async ({
    page,
  }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByText(/They approached you/)).toBeVisible();
    await expect(page.getByText(/Accepting means leaving that job/)).toBeVisible();
    // Job board filters: an impossible minimum pay hides everything, clearing it brings them back.
    const count = page.getByText(/^Showing \d+ of \d+ jobs/);
    await expect(count).toBeVisible();
    await page.getByLabel(/^Min pay a month/).fill('99999999');
    await expect(page.getByText('No jobs match these filters.')).toBeVisible();
    await page.getByLabel(/^Min pay a month/).fill('');
    await page.getByRole('switch', { name: 'Only jobs I qualify for' }).click();
    await expect(count).toBeVisible();
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

test.describe('retirement fund lump sum', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-pension', { age: 56 });
  });

  test('explains payouts and takes a one-off lump sum from 55', async ({ page }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/finance`);
    await page.getByText('Investments', { exact: true }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Taking money out' })).toBeVisible();
    await expect(page.getByText(/pays you a monthly income once you retire/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: /^Take 25% as cash \(/ }).click();
    await page.getByRole('button', { name: 'Take the cash' }).click();
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toHaveAttribute('data-kind', 'success');
    await expect(feedback).toContainText('You took a lump sum from your retirement fund');
    // A second time is not possible, and tapping explains why.
    const again = page.getByRole('button', { name: 'Take 25% as cash' });
    await again.focus();
    await page.keyboard.press('Enter');
    await expect(feedback).toHaveAttribute('data-kind', 'error');
    await expect(feedback).toContainText('already taken your one-off lump sum');
  });
});

test.describe('investments dashboard', () => {
  test.describe.configure({ timeout: 120_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-bonds');
  });

  test('choose an investment, view monthly moves and trade Bitcoin', async ({ page }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/finance`);
    await page.getByText('Investments', { exact: true }).click();
    await page.getByRole('link', { name: 'Open investments' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Investments' })).toBeVisible();
    await page.getByRole('link', { name: 'Crypto', exact: true }).click();
    const bitcoin = page.getByRole('link', { name: /^Bitcoin/ });
    await expect(bitcoin).toContainText(/[-+]?\d+(\.\d+)?%/);
    await bitcoin.click();
    const chart = page.getByRole('region', { name: 'Bitcoin price history' });
    await expect(chart.getByText(/this month/)).toBeVisible();
    await chart.getByRole('button', { name: '6 months', exact: true }).click();
    await chart.getByText('Monthly prices').click();
    await expect(chart.getByRole('row')).toHaveCount(8);
    await chart.getByRole('button', { name: '24 months', exact: true }).click();
    await expect(chart.getByRole('row')).toHaveCount(26);
    await expectAccessible(page);

    await page.getByLabel(/^Buy Bitcoin/).fill('100');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await expect(page.getByTestId('feedback')).toContainText('Investment bought');
    await expect(page.getByText('Cost basis')).toBeVisible();
    await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
    const holdings = page.getByRole('region', { name: 'Your holdings' });
    await holdings.getByRole('link', { name: /^Bitcoin/ }).click();
    await page.getByLabel(/^Sell Bitcoin/).fill('50');
    await page.getByLabel(/^Sell Bitcoin/).press('Enter');
    await expect(page.getByTestId('feedback')).toContainText('Investment sold');
    await page.getByRole('link', { name: 'Funds', exact: true }).click();
    await page.getByRole('link', { name: /^Technology stock fund/ }).click();
    await expect(
      page.getByRole('region', { name: 'Technology stock fund price history' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Stocks', exact: true }).click();
    await page.getByRole('link', { name: /^Selara Systems/ }).click();
    await expect(page.getByRole('region', { name: 'Selara Systems price history' })).toBeVisible();
  });

  test('buy a bond, see its interest and sale price, sell it early', async ({ page }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/finance`);
    await page.getByText('Investments', { exact: true }).click();
    await page.getByRole('link', { name: 'Open investments' }).click();
    await page.getByRole('link', { name: 'Bonds', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Government bonds' })).toBeVisible();
    await page.getByText(/^10 years$/).click();
    await page.getByLabel(/^Buy bonds/).fill('1000');
    await expect(page.getByText(/^Monthly interest /)).toBeVisible();
    await page.getByRole('button', { name: 'Buy bonds', exact: true }).click();
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toContainText('10-year government bond');
    await expect(page.getByText(/10-year at/)).toBeVisible();
    await expect(page.getByText(/a month · matures/)).toBeVisible();
    await expect(page.getByText(/if sold now/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
    await page.getByRole('link', { name: /10-year government bond/ }).click();
    const sellEarly = page.getByRole('button', { name: 'Sell early', exact: true });
    const sale = page.getByRole('dialog', { name: 'Sell this bond early?' });
    await sellEarly.press('Enter');
    await sale.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sellEarly).toBeFocused();
    await sellEarly.click();
    await sale.getByRole('button', { name: 'Sell', exact: true }).click();
    await expect(feedback).toContainText('Bond sold');
    await expect(page.getByText(/10-year at/)).toHaveCount(0);
  });

  test('quotes and sells a mixed portfolio in one action', async ({ page }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/finance/investments/crypto/bitcoin`);
    await page.getByLabel(/^Buy Bitcoin/).fill('100');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toContainText('Investment bought');
    await page.getByRole('link', { name: 'Bonds', exact: true }).click();
    await page.getByLabel(/^Buy bonds/).fill('200');
    await page.getByRole('button', { name: 'Buy bonds', exact: true }).click();
    await expect(feedback).toContainText('5-year government bond');
    await page.getByRole('link', { name: 'Portfolio', exact: true }).click();

    const portfolio = page.getByRole('region', { name: 'Portfolio', exact: true });
    const holdings = page.getByRole('region', { name: 'Your holdings' });
    await expect(holdings.getByRole('link')).toHaveCount(2);
    const quote = await portfolio.locator('dd').first().innerText();
    const liquidation = page.getByRole('dialog', { name: 'Sell all investments?' });
    const sellAll = portfolio.getByRole('button', { name: 'Sell all investments' });
    await sellAll.click();
    await expect(liquidation).toContainText(quote);
    await expect(liquidation).toContainText('sold early and stop paying interest');
    await liquidation.getByRole('button', { name: 'Cancel' }).click();
    await expect(holdings.getByRole('link')).toHaveCount(2);

    await sellAll.click();
    await liquidation.getByRole('button', { name: 'Sell all investments' }).click();
    await expect(feedback).toContainText('All investments sold');
    await expect(holdings.getByRole('link')).toHaveCount(0);
    await expect(sellAll).toHaveCount(0);
    await page.reload();
    await expect(holdings.getByText(/make your first investment/)).toBeVisible();
  });
});

test.describe('Shopping', () => {
  test.describe.configure({ timeout: 120_000 });

  test('browses the shops and keeps a purchased vehicle after reload', async ({ page }) => {
    const saveId = await importSave(
      page,
      await adultSaveJson('e2e-shopping', { cashGiftMinor: 1_000_000_000n }),
    );
    await page.getByRole('link', { name: 'Money', exact: true }).last().click();
    await page
      .getByRole('link', { name: /^Shopping/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Shopping' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Property for sale/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage your properties' })).toBeVisible();
    await page.getByLabel('Deposit', { exact: true }).selectOption('100');
    await page
      .getByRole('button', { name: /^Buy the (apartment|house) for/ })
      .first()
      .click();
    await expect(page.getByTestId('feedback')).toContainText('Property bought.');
    await page.getByText('Aeroplanes', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Buy Selat Trainer' })).toBeVisible();
    await page.getByText('Helicopters', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Buy Bayu Scout' })).toBeVisible();
    await page.getByText('New cars', { exact: true }).click();
    await expect(page.getByText('Compact hatchback · New')).toBeVisible();
    await page.getByText('Used cars', { exact: true }).click();
    await expect(page.getByText(/Compact hatchback.*Condition/)).toBeVisible();
    await page.getByRole('button', { name: 'Buy Meranti City' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm purchase' }).click();
    await expect(page.getByTestId('feedback')).toContainText('You bought the Meranti City.');
    await expect(page.getByRole('region', { name: 'Your vehicles' })).toContainText('Bought used');
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/play/${saveId}/shopping$`));
    await expect(page.getByRole('region', { name: 'Your vehicles' })).toContainText('Meranti City');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Sell Meranti City' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sell', exact: true }).click();
    await expect(page.getByTestId('feedback')).toContainText('You sold the Meranti City');
    await expect(page.getByText('Vehicles you buy appear here.')).toBeVisible();
  });
});

test.describe('Health care', () => {
  test('a long-term condition can be cured with an expensive treatment', async ({ page }) => {
    const saveId = await importSave(
      page,
      await adultSaveJson('e2e-asthma', { condition: 'asthma' }),
    );
    await page.goto(`/play/${saveId}/health`);
    await expect(page.getByText(/Biologic therapy: 6 months, 60% chance/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: /^Cure privately now/ }).click();
    await expect(page.getByTestId('feedback')).toContainText('Private treatment has started.');
    await expect(page.getByText(/In treatment · long-term · Biologic therapy/)).toBeVisible();
  });
});
