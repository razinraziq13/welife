import { useId } from 'react';
import { CalendarArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@app/components/ui/button';
import { formatMonth } from '@app/i18n/format';
import { addMonths } from '@engine/core/clock';
import { useGameStore } from '@app/stores/gameStore';
import { cn } from '@app/lib/cn';

/** The monthly Advance control. When it cannot be used, it says why (no silent disabled buttons). */
export function AdvanceButton({
  className,
  size = 'lg',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const session = useGameStore((s) => s.session);
  const busy = useGameStore((s) => s.busy);
  const advance = useGameStore((s) => s.advance);
  const reasonId = useId();
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
      <Button
        size={size}
        disabled={busy || reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => void advance()}
        data-testid="advance-month"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        ) : (
          <CalendarArrowUp aria-hidden="true" className="size-5" />
        )}
        Advance to {formatMonth(addMonths(view.clock, 1))}
      </Button>
      {reason && (
        <p id={reasonId} className="text-center text-xs text-muted">
          {reason}
        </p>
      )}
    </div>
  );
}
