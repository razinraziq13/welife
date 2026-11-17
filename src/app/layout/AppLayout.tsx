import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Settings as SettingsIcon } from 'lucide-react';
import { Logo } from '@app/components/Logo';
import { cn } from '@app/lib/cn';
import { useShortcuts } from '@app/keyboard/useShortcuts';
import { ShortcutsDialog } from '@app/keyboard/ShortcutsDialog';
import type { ShortcutAction } from '@app/keyboard/shortcuts';
import { useAppStore } from '@app/stores/appStore';
import { useShortcutsDialogStore } from '@app/stores/uiStore';
import { PAGE_TITLE_ID } from './constants';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const shortcutsEnabled = useAppStore((s) => s.settings.keyboardShortcuts);
  const { open: shortcutsOpen, setOpen: setShortcutsOpen } = useShortcutsDialogStore();
  const firstRender = useRef(true);
  const [announcement, setAnnouncement] = useState('');

  // On client-side navigation, move focus to the new page heading and announce it,
  // matching what screen-reader users get from a full page load.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = document.getElementById(PAGE_TITLE_ID);
    heading?.focus();
    setAnnouncement(heading?.textContent ?? '');
  }, [location.pathname]);

  const onShortcut = useCallback(
    (action: ShortcutAction) => {
      if (action === 'help') setShortcutsOpen(true);
      if (action === 'home') void navigate('/');
      if (action === 'settings') void navigate('/settings');
    },
    [navigate, setShortcutsOpen],
  );
  useShortcuts(shortcutsEnabled, onShortcut);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 rounded-lg font-semibold text-fg">
            <Logo className="size-7" />
            <span className="text-lg tracking-tight">WeLife</span>
          </Link>
          <nav aria-label="Primary">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-soft text-fg'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <SettingsIcon aria-hidden="true" className="size-4" />
              Settings
            </NavLink>
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] outline-none"
      >
        <Outlet />
      </main>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
