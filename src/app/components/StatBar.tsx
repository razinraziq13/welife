import { cn } from '@app/lib/cn';
import { displayValue } from '@app/i18n/format';

interface StatBarProps {
  label: string;
  /** Fixed-point tenths (0..1000). */
  value: number;
  /** For stats where high is bad (stress). */
  inverted?: boolean;
  compact?: boolean;
}

/** Labelled value with a decorative bar; the number itself is always visible text. */
export function StatBar({ label, value, inverted = false, compact = false }: StatBarProps) {
  const shown = displayValue(value);
  const good = inverted ? shown <= 40 : shown >= 60;
  const bad = inverted ? shown >= 70 : shown <= 30;
  return (
    <div className={compact ? 'py-1' : 'py-1.5'}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-fg">{label}</span>
        <span className="font-semibold tabular-nums text-fg">{shown}</span>
      </div>
      <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            good ? 'bg-success' : bad ? 'bg-danger' : 'bg-primary',
          )}
          style={{ width: `${String(Math.max(2, shown))}%` }}
        />
      </div>
    </div>
  );
}
