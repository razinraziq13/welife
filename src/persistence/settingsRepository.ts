import {
  AppSettingsPatchSchema,
  AppSettingsSchema,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsPatch,
} from '@contracts/appSettings';
import type { WeLifeDatabase } from './db';

const SETTINGS_KEY = 'app';

export interface LoadedSettings {
  settings: AppSettings;
  /** True when a stored row existed but failed validation and defaults were used. */
  recoveredFromInvalid: boolean;
}

/** Reads app settings; missing or corrupt rows fall back to defaults (never throws on bad data). */
export async function loadAppSettings(db: WeLifeDatabase): Promise<LoadedSettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  if (row === undefined) {
    return { settings: { ...DEFAULT_APP_SETTINGS }, recoveredFromInvalid: false };
  }
  const parsed = AppSettingsSchema.safeParse(row.value);
  if (!parsed.success) {
    return { settings: { ...DEFAULT_APP_SETTINGS }, recoveredFromInvalid: true };
  }
  return { settings: parsed.data, recoveredFromInvalid: false };
}

/**
 * Validates and applies a partial update atomically; returns the stored result.
 * Throws a ZodError if the patch is invalid, leaving storage untouched.
 */
export async function updateAppSettings(
  db: WeLifeDatabase,
  patch: AppSettingsPatch,
): Promise<AppSettings> {
  const validPatch = AppSettingsPatchSchema.parse(patch);
  return db.transaction('rw', db.settings, async () => {
    const { settings: current } = await loadAppSettings(db);
    const next = AppSettingsSchema.parse({ ...current, ...validPatch });
    await db.settings.put({ key: SETTINGS_KEY, value: next });
    return next;
  });
}
