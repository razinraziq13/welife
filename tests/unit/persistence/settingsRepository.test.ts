import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { DEFAULT_APP_SETTINGS } from '@contracts/appSettings';
import { WeLifeDatabase } from '@persistence/db';
import { loadAppSettings, updateAppSettings } from '@persistence/settingsRepository';
import { createTestDatabase } from '../../helpers/db';

const open: WeLifeDatabase[] = [];
function track(db: WeLifeDatabase): WeLifeDatabase {
  open.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.delete()));
});

describe('settings repository', () => {
  it('returns defaults when nothing has been stored', async () => {
    const db = track(createTestDatabase());
    expect(await loadAppSettings(db)).toEqual({
      settings: DEFAULT_APP_SETTINGS,
      recoveredFromInvalid: false,
    });
  });

  it('persists updates across database connections (simulated reload)', async () => {
    const db = track(createTestDatabase());
    await updateAppSettings(db, { theme: 'dark', textScale: 125 });
    db.close();

    const reopened = track(new WeLifeDatabase(db.name));
    const { settings } = await loadAppSettings(reopened);
    expect(settings).toEqual({ ...DEFAULT_APP_SETTINGS, theme: 'dark', textScale: 125 });
  });

  it('merges successive partial updates', async () => {
    const db = track(createTestDatabase());
    await updateAppSettings(db, { theme: 'light' });
    const result = await updateAppSettings(db, { contrast: 'high' });
    expect(result).toEqual({ ...DEFAULT_APP_SETTINGS, theme: 'light', contrast: 'high' });
  });

  it('rejects an invalid patch and leaves stored settings untouched', async () => {
    const db = track(createTestDatabase());
    await updateAppSettings(db, { theme: 'dark' });
    await expect(
      // Deliberately invalid input arriving from outside the type system.
      updateAppSettings(db, { textScale: 999 } as unknown as Parameters<
        typeof updateAppSettings
      >[1]),
    ).rejects.toBeInstanceOf(ZodError);
    expect((await loadAppSettings(db)).settings.theme).toBe('dark');
    expect((await loadAppSettings(db)).settings.textScale).toBe(100);
  });

  it('recovers from a corrupted stored row by falling back to defaults', async () => {
    const db = track(createTestDatabase());
    await db.settings.put({
      key: 'app',
      value: { theme: 'neon' } as unknown as typeof DEFAULT_APP_SETTINGS,
    });
    expect(await loadAppSettings(db)).toEqual({
      settings: DEFAULT_APP_SETTINGS,
      recoveredFromInvalid: true,
    });
    // A subsequent valid update repairs the row.
    await updateAppSettings(db, { motion: 'reduce' });
    expect((await loadAppSettings(db)).recoveredFromInvalid).toBe(false);
  });
});
