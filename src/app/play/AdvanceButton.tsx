import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@app/components/ui/button';
import { formatMonth } from '@app/i18n/format';
import { addMonths } from '@engine/core/clock';
import { ADVANCE_MONTHS, useGameStore } from '@app/stores/gameStore';
import { cn } from '@app/lib/cn';
import { ActionButton } from './ActionButton';

/**
 * The Advance control: plays up to four months, stopping early for a decision. When it cannot
 * be used, it says why (no silent disabled buttons).
 */
export function AdvanceButton({
  className,
  size = 'lg',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const session = useGameStore((s) => s.session);
  const busy = useGameStore((s) => s.busy || s.advancing);
  // A waiting recap keeps Advance locked until Continue, so months never stack behind it.
  const recapOpen = useGameStore((s) => s.recap !== null);
  const advance = useGameStore((s) => s.advance);
  const rewindMonths = useGameStore((s) => s.rewindMonths);
  const reasonId = useId();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Close the time menu on Escape or a tap outside it.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);
  if (!session) return null;
  const view = session.view;
  const reason =
    view.lifeStatus !== 'alive'
      ? 'This life has ended.'
      : view.pendingEvent
        ? 'Make the waiting decision first.'
        : null;
  return (
    <div className={cn('flex flex-col items-stretch gap-1', className)}>
      <div className="flex items-stretch">
        <Button
          className="wl-advance-button min-w-0 flex-1 rounded-l-2xl rounded-r-none font-extrabold text-white"
          size={size}
          disabled={busy || recapOpen || reason !== null}
          aria-describedby={reasonId}
          onClick={() => void advance()}
          data-testid="advance-month"
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <CalendarDays aria-hidden="true" className="size-5" />
          )}
          <span className="flex-1 text-center">
            Advance to {formatMonth(addMonths(view.clock, ADVANCE_MONTHS))}
          </span>
          <ArrowRight aria-hidden="true" className="size-5" />
        </Button>
        <div ref={box} className="relative shrink-0">
          <Button
            size={size}
            className="wl-advance-button h-full rounded-l-none rounded-r-2xl border-l border-white/30 px-3 text-white"
            aria-label="Time options"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => {
              setOpen((o) => !o);
            }}
          >
            <ChevronDown aria-hidden="true" className="size-5" />
          </Button>
          {open && (
            <div
              id={menuId}
              role="group"
              aria-label="Step through time"
              className="absolute right-0 bottom-full z-50 mb-2 grid w-52 gap-1 rounded-2xl border border-border bg-surface p-2 shadow-lg md:top-full md:bottom-auto md:mt-2 md:mb-0"
            >
              {(
                [
                  ['Advance 4 months', 4],
                  ['Rewind 4 months', -4],
                ] as const
              ).map(([label, months]) => (
                <ActionButton
                  key={label}
                  size="sm"
                  variant="secondary"
                  reason={
                    months > 0
                      ? reason
                      : view.tick < -months
                        ? 'Not enough months played to go back that far.'
                        : null
                  }
                  busy={busy}
                  onAct={() => {
                    setOpen(false);
                    void (months > 0 ? advance(months) : rewindMonths(-months));
                  }}
                >
                  {label}
                </ActionButton>
              ))}
            </div>
          )}
        </div>
      </div>
      <p id={reasonId} className="text-center text-xs text-muted">
        {reason ?? `${String(ADVANCE_MONTHS)} months; stops early if a decision comes up.`}
      </p>
    </div>
  );
}
