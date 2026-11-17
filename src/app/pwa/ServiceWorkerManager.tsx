import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@app/components/ui/button';
import { usePwaStore } from '@app/stores/pwaStore';

/**
 * Registers the service worker (offline support) and shows a prompt when a new
 * version has been downloaded. Updates are never applied silently, so an in-progress
 * game is not reloaded without the player's consent.
 */
export function ServiceWorkerManager() {
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      // Surfaced on the Home screen instead of leaving "Preparing offline mode…" forever.
      console.warn('Service worker registration failed', error);
      usePwaStore
        .getState()
        .setOfflineError(error instanceof Error ? error.message : 'Registration failed.');
    },
  });

  const setOfflineReady = usePwaStore((s) => s.setOfflineReady);

  useEffect(() => {
    const controlled = 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
    setOfflineReady(offlineReady || controlled);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg"
    >
      <RefreshCw aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">A new version of WeLife is ready.</p>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Dismiss update notice"
        onClick={() => {
          setNeedRefresh(false);
        }}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
