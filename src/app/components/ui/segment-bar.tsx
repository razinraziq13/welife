import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@app/lib/cn';

export interface Segment<V extends string> {
  value: V;
  label: string;
  icon: LucideIcon;
  /** A segment that opens another screen instead of switching in place. */
  to?: string;
}

const BASE =
  'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-xs font-medium sm:flex-row sm:gap-2 sm:px-2 sm:text-sm';
const IDLE = 'text-muted hover:bg-surface-2 hover:text-fg';

/** Icon-over-label section bar (as on the Investments screen): one section shown at a time. */
export function SegmentBar<V extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly Segment<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col rounded-xl border border-border bg-surface p-1"
    >
      {items.map(({ value: v, label: text, icon: Icon, to }) =>
        to ? (
          <Link key={v} to={to} className={cn(BASE, IDLE)}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {text}
          </Link>
        ) : (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => {
              onChange(v);
            }}
            className={cn(BASE, value === v ? 'bg-primary-soft font-semibold text-fg' : IDLE)}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {text}
          </button>
        ),
      )}
    </nav>
  );
}
