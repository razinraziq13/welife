import { useEffect, useSyncExternalStore } from 'react';
import type { AppSettings } from '@contracts/appSettings';
import { applyAppearance, resolveAppearance } from './appearance';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Applies theme, contrast, motion and text size to <html>, tracking OS preference changes. */
export function useAppearance(settings: AppSettings): void {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    applyAppearance(
      document.documentElement,
      resolveAppearance(settings, { prefersDark, prefersReducedMotion }),
    );
  }, [settings, prefersDark, prefersReducedMotion]);
}
