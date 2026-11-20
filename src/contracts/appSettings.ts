import { z } from 'zod';

/**
 * Device-level app preferences (spec §3.21 Settings / Accessibility).
 * Per-save rules (difficulty, Easy Migration) are NOT here: they belong to a save slot.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export const TEXT_SCALES = [90, 100, 110, 125, 150] as const;
export const MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;
export const CONTRAST_PREFERENCES = ['standard', 'high'] as const;
/** Game colour (cartoon redesign); jade is the original teal. */
export const PALETTES = ['jade', 'grape', 'guava', 'ocean'] as const;

export const AppSettingsSchema = z
  .object({
    theme: z.enum(THEME_PREFERENCES),
    /** Root font size as a percentage of the browser default. */
    textScale: z.literal(TEXT_SCALES),
    motion: z.enum(MOTION_PREFERENCES),
    contrast: z.enum(CONTRAST_PREFERENCES),
    /** Optional in older stored settings. */
    palette: z.enum(PALETTES).default('jade'),
    keyboardShortcuts: z.boolean(),
    /** Hide explanations of sensitive real-world laws (decision D6). Display only. */
    hideSensitive: z.boolean().default(false),
  })
  .strict();

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type ThemePreference = AppSettings['theme'];
export type TextScale = AppSettings['textScale'];
export type MotionPreference = AppSettings['motion'];
export type ContrastPreference = AppSettings['contrast'];

/** Patches never fill in defaults, so a partial update cannot reset other settings. */
export const AppSettingsPatchSchema = AppSettingsSchema.extend({
  hideSensitive: z.boolean(),
  palette: z.enum(PALETTES),
})
  .partial()
  .strict();
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>;

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  theme: 'system',
  textScale: 100,
  motion: 'system',
  contrast: 'standard',
  palette: 'jade',
  keyboardShortcuts: true,
  hideSensitive: false,
});
