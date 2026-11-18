import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import {
  Bell,
  Briefcase,
  CalendarDays,
  HeartHandshake,
  Home,
  Loader2,
  Menu,
  Wallet,
} from 'lucide-react';
import { Avatar } from '@app/components/avatar/Avatar';
import { buttonVariants } from '@app/components/ui/button';
import { Button } from '@app/components/ui/button';
import { formatAge, formatMonth, setActiveCurrency, setCustomEventTexts } from '@app/i18n/format';
import { SuccessionPanel } from './screens/LegacyScreen';
import { cn } from '@app/lib/cn';
import { getEngine } from '@app/bridge/engine';
import { describeError } from '@app/bridge/errors';
import { useGameStore } from '@app/stores/gameStore';
import { AdvanceButton } from './AdvanceButton';
import { EventDialog } from './EventDialog';

export const TABS = [
  { to: 'life', label: 'Life', icon: Home },
  { to: 'career', label: 'Career', icon: Briefcase },
  { to: 'finance', label: 'Finance', icon: Wallet },
  { to: 'social', label: 'Social', icon: HeartHandshake },
  { to: 'more', label: 'More', icon: Menu },
] as const;

function OpenError({ saveId }: { saveId: string }) {
  const { error, errorCode, open } = useGameStore();
  const [repairError, setRepairError] = useState<string | null>(null);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold text-fg">This life could not be opened</h1>
      <p role="alert" className="text-danger">
        {error}
      </p>
      {errorCode === 'CORRUPTED' && (
        <>
          <p className="text-sm text-muted">
            The latest saved state is damaged. WeLife can rebuild it from the last complete month.
            Actions taken after that month will be lost.
          </p>
          <div>
            <Button
              onClick={() => {
                void getEngine()
                  .call('saves.repair', { saveId })
                  .then(() => open(saveId))
                  .catch((err: unknown) => {
                    setRepairError(describeError(err));
                  });
              }}
            >
              Repair from the last complete month
            </Button>
          </div>
          {repairError && (
            <p role="alert" className="text-sm text-danger">
              Repair failed: {repairError}
            </p>
          )}
        </>
      )}
      <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
        Back to your lives
      </Link>
    </div>
  );
}

export function PlayLayout() {
  const { saveId = '' } = useParams();
  const { session, phase, saveId: openId, open, message, clearMessage } = useGameStore();

  useEffect(() => {
    if (openId !== saveId) void open(saveId);
  }, [saveId, openId, open]);

  const currency = session?.view.country.currency;
  useEffect(() => {
    setActiveCurrency(currency ?? null);
  }, [currency]);
  const customTexts = session?.view.customEventTexts;
  useEffect(() => {
    setCustomEventTexts(customTexts ?? {});
  }, [customTexts]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(clearMessage, 6000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, clearMessage]);

  if (phase === 'error') return <OpenError saveId={saveId} />;
  if (session?.saveId !== saveId) {
    return (
      <p className="flex items-center gap-2 text-muted" role="status">
        <Loader2 aria-hidden="true" className="size-5 animate-spin" /> Opening your life…
      </p>
    );
  }

  const view = session.view;
  const c = view.character;
  const base = `/play/${saveId}`;

  return (
    <div className="pb-24 md:pb-0">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <Link
          to={`${base}/character`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl"
        >
          <Avatar
            appearance={c.appearance}
            stage={c.stage}
            ageYears={c.age.years}
            className="size-12"
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fg">{c.displayName}</span>
            <span className="block text-sm text-muted">
              {c.alive ? formatAge(c.age) : `Died at ${String(c.age.years)}`} ·{' '}
              {formatMonth(view.clock)}
            </span>
          </span>
        </Link>
        <Link
          to={`${base}/calendar`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-11')}
          aria-label="Calendar"
        >
          <CalendarDays aria-hidden="true" className="size-5" />
        </Link>
        <Link
          to={`${base}/notifications`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative size-11')}
          aria-label={`Notifications, ${view.unreadCount > 99 ? '99+' : String(view.unreadCount)} unread`}
        >
          <Bell aria-hidden="true" className="size-5" />
          {view.unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-center text-[0.65rem] font-bold text-danger-fg"
            >
              {view.unreadCount > 99 ? '99+' : view.unreadCount}
            </span>
          )}
        </Link>
        <AdvanceButton className="hidden md:flex" size="md" />
      </div>

      <div className="flex flex-col gap-3">
        {!session.replayGuaranteed && (
          <p
            role="note"
            className="rounded-2xl border border-border bg-surface-2 p-3 text-sm text-fg"
          >
            Some months on this timeline were played with an older version of WeLife. Your save
            works normally, but replaying them exactly is not guaranteed.
          </p>
        )}
        {view.lifeStatus === 'ended' && (
          <div role="status" className="rounded-2xl border border-border bg-surface-2 p-4 text-fg">
            <p className="font-semibold">
              {c.displayName}’s life has ended at the age of {c.age.years}.
            </p>
            <p className="mt-1 text-sm text-muted">
              There is no adult relative to carry on the family story. You can read their story,
              rewind to an earlier month on a new timeline, or begin a new life.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={`${base}/character`}
                className={buttonVariants({ size: 'sm', variant: 'secondary' })}
              >
                Read their story
              </Link>
              <Link
                to={`${base}/timeline`}
                className={buttonVariants({ size: 'sm', variant: 'secondary' })}
              >
                Rewind
              </Link>
              <Link to="/new" className={buttonVariants({ size: 'sm' })}>
                Start a new life
              </Link>
            </div>
          </div>
        )}
        {view.lifeStatus === 'succession' && <SuccessionPanel />}
        <EventDialog />
        <div aria-live="polite" className="min-h-0 text-sm">
          {message && <p className="rounded-xl bg-surface-2 px-3 py-2 text-fg">{message}</p>}
        </div>
      </div>

      <div className="mt-2 md:grid md:grid-cols-[11rem_1fr] md:gap-6">
        <nav aria-label="Game sections" className="hidden md:block">
          <ul className="sticky top-20 flex flex-col gap-1">
            {TABS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={`${base}/${to}`}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-3 rounded-xl px-3 font-medium',
                      isActive
                        ? 'bg-primary-soft text-fg'
                        : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>

      {/* Phone: Advance and the five tabs stay within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="px-3 pt-2">
          <AdvanceButton size="md" />
        </div>
        <nav aria-label="Game sections">
          <ul className="grid grid-cols-5">
            {TABS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={`${base}/${to}`}
                  className={({ isActive }) =>
                    cn(
                      'flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                      isActive ? 'text-primary' : 'text-muted',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
