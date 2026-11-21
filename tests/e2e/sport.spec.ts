import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { advanceOnce, importSave } from './helpers';
import { adultSaveJson } from './adultSave';

test.describe('athlete career (E98)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('choose tennis, train, play a month of tournaments and see the ranking', async ({
    page,
  }) => {
    const saveId = await importSave(page, await adultSaveJson('e2e-athlete'));
    await page.goto(`/play/${saveId}/career`);
    const decision = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('group', { name: 'Choices' }) });
    while (await decision.isVisible()) await advanceOnce(page);
    await page.getByRole('button', { name: 'Athlete', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Tennis' }).click();
    await expect(page.getByTestId('feedback')).toContainText('committing to tennis');
    await page.getByRole('button', { name: 'Rest and recovery (readiness)' }).click();
    await expect(page.getByTestId('feedback')).toContainText('Rest and recovery');
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(scan.violations).toEqual([]);
    await advanceOnce(page);
    while (await decision.isVisible()) await advanceOnce(page);
    await expect(page.getByText(/World ranking #\d+/)).toBeVisible();
  });
});
