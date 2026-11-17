import { create } from 'zustand';

/** Chromium-only install prompt event (not in the standard DOM typings). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaState {
  installPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  offlineReady: boolean;
  /** Set when the service worker could not be registered, so offline play is unavailable. */
  offlineError: string | null;
  setInstallPrompt: (event: BeforeInstallPromptEvent | null) => void;
  markInstalled: () => void;
  setOfflineReady: (ready: boolean) => void;
  setOfflineError: (message: string) => void;
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export const usePwaStore = create<PwaState>()((set) => ({
  installPrompt: null,
  installed: isStandalone(),
  offlineReady: false,
  offlineError: null,
  setInstallPrompt: (installPrompt) => {
    set({ installPrompt });
  },
  markInstalled: () => {
    set({ installed: true, installPrompt: null });
  },
  setOfflineReady: (offlineReady) => {
    set({ offlineReady });
  },
  setOfflineError: (offlineError) => {
    set({ offlineError, offlineReady: false });
  },
}));

/** Must run before React renders so an early `beforeinstallprompt` is not missed. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwaStore.getState().setInstallPrompt(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    usePwaStore.getState().markInstalled();
  });
}

/** iPhone/iPad Safari has no install prompt; users add to Home Screen from the Share menu. */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return iOS && ua.includes('Safari') && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
