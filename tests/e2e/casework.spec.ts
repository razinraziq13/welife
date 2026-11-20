import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { advanceOnce, importSave } from './helpers';
import { adultSaveJson } from './adultSave';

/** Takes the first case on the board, works it and resolves it with the first option. */
async function workACase(page: Page, board: string, resolve: string) {
  const decision = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('group', { name: 'Choices' }) });
  const settle = async () => {
    while (await decision.isVisible()) await advanceOnce(page);
  };
  await settle();
  await expect(page.getByRole('heading', { level: 2, name: board })).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(scan.violations).toEqual([]);
  const feedback = page.getByTestId('feedback');
  const take = page.getByRole('button', { name: /^Take on / }).first();
  for (let i = 0; i < 4 && (await take.getAttribute('aria-disabled')) === 'true'; i++) {
    await advanceOnce(page);
    await settle();
  }
  await take.click();
  await expect(feedback).toContainText('You took on');
  const work = page.getByRole('list', { name: /^Work on / });
  await work.getByRole('button').first().click();
  await expect(feedback).toContainText(/holds up|disputed/);
  await page.getByRole('button', { name: resolve }).first().click();
  await expect(feedback).toContainText(/a (good|mixed|poor) result/);
  await expect(page.getByRole('list', { name: 'Career record' })).toBeVisible();
}

test.describe('professional casework (E93)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('an admitted lawyer takes a case from the board, examines evidence and resolves it', async ({
    page,
  }) => {
    const json = await adultSaveJson('e2e-lawyer', {
      profession: { occupationId: 'lawyer', qualification: 'bachelor:law', licence: 'licence.law' },
    });
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByRole('button', { name: 'Cases', exact: true })).toBeVisible();
    await workACase(page, 'Case board', 'Negotiate a settlement');
  });

  test('a journalist with a media diploma verifies a claim and publishes a story', async ({
    page,
  }) => {
    const json = await adultSaveJson('e2e-journalist', {
      profession: { occupationId: 'journalist', qualification: 'diploma:media', licence: null },
    });
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/career`);
    await expect(page.getByRole('button', { name: 'Stories', exact: true })).toBeVisible();
    await workACase(page, 'Story desk', 'Publish a short news report');
  });

  test('a registered doctor reviews a patient case and arranges follow-up care', async ({
    page,
  }) => {
    const json = await adultSaveJson('e2e-doctor', {
      profession: {
        occupationId: 'doctor',
        qualification: 'bachelor:medicine',
        licence: 'licence.medicine',
      },
    });
    const saveId = await importSave(page, json);
    await page.goto('/play/' + saveId + '/career');
    await expect(page.getByRole('button', { name: 'Patients', exact: true })).toBeVisible();
    await workACase(page, 'Patient queue', 'Arrange follow-up care');
  });
});
