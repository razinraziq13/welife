import { AppSettingsSchema, DEFAULT_APP_SETTINGS, type AppSettings } from '@contracts/appSettings';

/** Key for the localStorage mirror read by the pre-paint script in index.html. */
export const APPEARANCE_MIRROR_KEY = 'welife.appearance';

export interface SystemPreferences {
  prefersDark: boolean;
  prefersReducedMotion: boolean;
}

export interface ResolvedAppearance {
  theme: 'light' | 'dark';
  motion: 'reduce' | 'full';
  contrast: 'standard' | 'high';
  palette: AppSettings['palette'];
  fontSizePercent: number;
}

export function resolveAppearance(
  settings: AppSettings,
  system: SystemPreferences,
): ResolvedAppearance {
  const theme =
    settings.theme === 'system' ? (system.prefersDark ? 'dark' : 'light') : settings.theme;
  const motion =
    settings.motion === 'system'
      ? system.prefersReducedMotion
        ? 'reduce'
        : 'full'
      : settings.motion;
  return {
    theme,
    motion,
    contrast: settings.contrast,
    palette: settings.palette,
    fontSizePercent: settings.textScale,
  };
}

const THEME_COLORS: Record<ResolvedAppearance['theme'], string> = {
  light: '#f6f5f1',
  dark: '#111614',
};

export function applyAppearance(root: HTMLElement, appearance: ResolvedAppearance): void {
  root.dataset.theme = appearance.theme;
  root.dataset.motion = appearance.motion;
  root.dataset.contrast = appearance.contrast;
  root.dataset.palette = appearance.palette;
  root.style.fontSize = `${appearance.fontSizePercent}%`;
  const meta = root.ownerDocument.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', THEME_COLORS[appearance.theme]);
}

/**
 * Settings mirrored to localStorage purely so the first paint uses the right theme.
 * IndexedDB (via the engine worker) remains the source of truth.
 */
export function readAppearanceMirror(): AppSettings {
  try {
    const raw = localStorage.getItem(APPEARANCE_MIRROR_KEY);
    if (raw === null) return { ...DEFAULT_APP_SETTINGS };
    const parsed = AppSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...DEFAULT_APP_SETTINGS };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function writeAppearanceMirror(settings: AppSettings): void {
  try {
    localStorage.setItem(APPEARANCE_MIRROR_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, blocked): the pre-paint theme falls back to system.
  }
}
