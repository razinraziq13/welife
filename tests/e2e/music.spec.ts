import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { advanceOnce, importSave } from './helpers';
import { adultSaveJson } from './adultSave';

test.describe('music career (E90)', () => {
  test.describe.configure({ timeout: 180_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-musician', { musician: true });
  });

  test('co-write a song, record and release it, play a show, and keep it after reload', async ({
    page,
  }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/career`);
    // Musicians open on the Music section.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Songwriting and studio' }),
    ).toBeVisible();
    await expect(page.getByText('No songs yet: begin by writing one.')).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(scan.violations).toEqual([]);
    const feedback = page.getByTestId('feedback');
    const decision = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('group', { name: 'Choices' }) });
    /** Answers any waiting life decision (it disables everything else). */
    const settle = async () => {
      while (await decision.isVisible()) await advanceOnce(page);
    };
    await settle();
    await page.getByLabel('New song title').fill('Harbour Lights');
    await page.getByRole('switch', { name: 'Co-write with another musician' }).click();
    await page.getByRole('button', { name: 'Start writing' }).click();
    await expect(feedback).toContainText('You started writing "Harbour Lights"');
    // One session a month on a song: write, then let the months pass.
    const write = page.getByRole('button', { name: 'Write: Harbour Lights' });
    for (let i = 0; i < 6 && (await write.isVisible()); i++) {
      await settle();
      if ((await write.getAttribute('aria-disabled')) !== 'true') {
        await write.click();
        await expect(feedback).toContainText('Harbour Lights');
      } else await advanceOnce(page);
    }
    await settle();
    await page.getByRole('button', { name: 'Record Harbour Lights' }).click();
    await expect(feedback).toContainText('Recording "Harbour Lights"');
    await advanceOnce(page);
    await settle();
    await page.getByRole('button', { name: 'Release the single' }).click();
    await expect(feedback).toContainText('"Harbour Lights" is out');
    await settle();
    const show = page.getByRole('button', { name: /^Play / }).first();
    await show.click();
    await expect(feedback).toContainText(/You played .* to \d+ people/);
    await advanceOnce(page);
    // Saved: after a reload the release is still there (Career opens on Music for musicians).
    await page.reload();
    await settle();
    await expect(page.getByRole('list', { name: 'Your releases' })).toContainText('Harbour Lights');
  });
});
