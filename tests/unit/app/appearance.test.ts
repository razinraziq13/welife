import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@contracts/appSettings';
import { resolveAppearance } from '@app/theme/appearance';

const settings = (overrides: Partial<AppSettings>): AppSettings => ({
  ...DEFAULT_APP_SETTINGS,
  ...overrides,
});

describe('resolveAppearance', () => {
  it('follows the OS when theme and motion are "system"', () => {
    expect(
      resolveAppearance(settings({}), { prefersDark: true, prefersReducedMotion: true }),
    ).toEqual({ theme: 'dark', motion: 'reduce', contrast: 'standard', fontSizePercent: 100 });
    expect(
      resolveAppearance(settings({}), { prefersDark: false, prefersReducedMotion: false }),
    ).toMatchObject({ theme: 'light', motion: 'full' });
  });

  it('lets explicit choices override the OS', () => {
    expect(
      resolveAppearance(settings({ theme: 'light', motion: 'full' }), {
        prefersDark: true,
        prefersReducedMotion: true,
      }),
    ).toMatchObject({ theme: 'light', motion: 'full' });
    expect(
      resolveAppearance(settings({ theme: 'dark', motion: 'reduce' }), {
        prefersDark: false,
        prefersReducedMotion: false,
      }),
    ).toMatchObject({ theme: 'dark', motion: 'reduce' });
  });

  it('passes through contrast and text scale', () => {
    expect(
      resolveAppearance(settings({ contrast: 'high', textScale: 150 }), {
        prefersDark: false,
        prefersReducedMotion: false,
      }),
    ).toMatchObject({ contrast: 'high', fontSizePercent: 150 });
  });
});
