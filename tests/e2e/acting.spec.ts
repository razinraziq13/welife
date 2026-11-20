import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { advanceOnce, importSave } from './helpers';
import { adultSaveJson } from './adultSave';

test.describe('acting career (E89)', () => {
  test.describe.configure({ timeout: 180_000 });
  let json = '';
  test.beforeAll(async () => {
    json = await adultSaveJson('e2e-actor', { actor: true });
  });

  test('audition from the casting board, work on a production, see it in the filmography', async ({
    page,
  }) => {
    const saveId = await importSave(page, json);
    await page.goto(`/play/${saveId}/career`);
    // Actors open on the Acting section.
    await expect(page.getByRole('heading', { level: 2, name: 'Casting board' })).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(scan.violations).toEqual([]);
    const feedback = page.getByTestId('feedback');
    const castings = page.getByRole('list', { name: 'Castings' });
    for (let attempt = 0; attempt < 8; attempt++) {
      const accept = page.getByRole('button', { name: /^Accept / }).first();
      if (await accept.isVisible()) {
        if ((await accept.getAttribute('aria-disabled')) !== 'true') {
          await accept.click();
          break;
        }
      }
      // The first casting you can audition for, with an approach that suits its genre.
      let auditioned = false;
      for (const item of await castings.getByRole('listitem').all()) {
        const button = item.getByRole('button', { name: /^Audition for / });
        if (!(await button.isVisible()) || (await button.getAttribute('aria-disabled')) === 'true')
          continue;
        const lively = /(comedy|action|family)\)/.test((await item.textContent()) ?? '');
        await item
          .getByLabel('Audition approach')
          .selectOption(lively ? 'energetic' : 'restrained');
        await button.click();
        await expect(feedback).toBeVisible();
        auditioned = true;
        break;
      }
      if (!auditioned) await advanceOnce(page);
    }
    await expect(feedback).toContainText('You signed on');
    await expect(page.getByRole('heading', { level: 2, name: /^Now: / })).toBeVisible();
    await page.getByRole('button', { name: 'Study the script' }).click();
    await expect(feedback).toContainText('studied the script');
    const title = (
      (await page.getByRole('heading', { level: 2, name: /^Now: / }).textContent()) ?? ''
    ).replace('Now: ', '');
    // Up to a film's post-production or a TV season and its renewal window; decisions may interrupt.
    for (
      let i = 0;
      i < 12 && (await page.getByRole('heading', { name: /^Now: / }).isVisible());
      i++
    )
      await advanceOnce(page);
    await expect(page.getByRole('list', { name: 'Filmography' })).toContainText(title);
  });
});
