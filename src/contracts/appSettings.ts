import { z } from 'zod';

/**
 * Device-level app preferences (spec §3.21 Settings / Accessibility).
 * Per-save rules (difficulty, Easy Migration) are NOT here: they belong to a save slot.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export const TEXT_SCALES = [90, 100, 110, 125, 150] as const;
export const MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;
export const CONTRAST_PREFERENCES = ['standard', 'high'] as const;

export const AppSettingsSchema = z
  .object({
    theme: z.enum(THEME_PREFERENCES),
    /** Root font size as a percentage of the browser default. */
    textScale: z.literal(TEXT_SCALES),
    motion: z.enum(MOTION_PREFERENCES),
    contrast: z.enum(CONTRAST_PREFERENCES),
    keyboardShortcuts: z.boolean(),
  })
  .strict();

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type ThemePreference = AppSettings['theme'];
export type TextScale = AppSettings['textScale'];
export type MotionPreference = AppSettings['motion'];
export type ContrastPreference = AppSettings['contrast'];

export const AppSettingsPatchSchema = AppSettingsSchema.partial().strict();
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>;

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  theme: 'system',
  textScale: 100,
  motion: 'system',
  contrast: 'standard',
  keyboardShortcuts: true,
});
