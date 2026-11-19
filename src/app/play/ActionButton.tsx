import type { ComponentProps } from 'react';
import { Button } from '@app/components/ui/button';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';

type Props = Omit<ComponentProps<typeof Button>, 'onClick' | 'disabled'> & {
  /** Why it cannot be done right now (null when it can). */
  reason: string | null;
  /** Busy (a command is in flight): plainly disabled. */
  busy?: boolean;
  onAct: () => void;
};

/**
 * A button for something that may not be possible right now. When it is not, it still looks
 * dimmed and is marked unavailable for screen readers, but tapping it explains why in the
 * pop-up ("You cannot afford this right now.") instead of doing nothing.
 */
export function ActionButton({
  reason,
  busy = false,
  onAct,
  className,
  children,
  ...props
}: Props) {
  const explain = useGameStore((s) => s.explain);
  return (
    <Button
      {...props}
      disabled={busy}
      aria-disabled={reason !== null || undefined}
      className={cn(reason !== null && 'opacity-60', className)}
      onClick={() => {
        if (reason !== null) explain(reason);
        else onAct();
      }}
    >
      {children}
    </Button>
  );
}
