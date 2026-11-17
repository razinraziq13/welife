import { describe, expect, it } from 'vitest';
import {
  AppSettingsPatchSchema,
  AppSettingsSchema,
  DEFAULT_APP_SETTINGS,
} from '@contracts/appSettings';

describe('AppSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(AppSettingsSchema.parse(DEFAULT_APP_SETTINGS)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('freezes the defaults so they cannot be mutated by accident', () => {
    expect(Object.isFrozen(DEFAULT_APP_SETTINGS)).toBe(true);
  });

  it.each([
    ['unknown theme', { theme: 'sepia' }],
    ['text scale outside the allowed steps', { textScale: 115 }],
    ['non-boolean shortcuts flag', { keyboardShortcuts: 'yes' }],
    ['unknown motion value', { motion: 'none' }],
  ])('rejects %s', (_label, override) => {
    expect(AppSettingsSchema.safeParse({ ...DEFAULT_APP_SETTINGS, ...override }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict)', () => {
    expect(AppSettingsSchema.safeParse({ ...DEFAULT_APP_SETTINGS, extra: true }).success).toBe(
      false,
    );
  });
});

describe('AppSettingsPatchSchema', () => {
  it('accepts partial updates', () => {
    expect(AppSettingsPatchSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' });
    expect(AppSettingsPatchSchema.parse({})).toEqual({});
  });

  it('rejects unknown keys and invalid values', () => {
    expect(AppSettingsPatchSchema.safeParse({ difficulty: 'casual' }).success).toBe(false);
    expect(AppSettingsPatchSchema.safeParse({ textScale: 0 }).success).toBe(false);
  });
});
