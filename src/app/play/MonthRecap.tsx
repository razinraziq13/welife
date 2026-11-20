import { Button } from '@app/components/ui/button';
import { Dialog } from '@app/components/ui/dialog';
import { Money } from '@app/components/Money';
import { t } from '@app/i18n/en';
import { displayValue, formatMonth, storyText } from '@app/i18n/format';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';

const STATS = ['health', 'happiness', 'intelligence', 'energy'] as const;
/** Same routine categories the Life story feed leaves out. */
const QUIET = new Set(['activity', 'rules', 'achievement']);

/**
 * After Advance: what changed over the months just played (stats, money, story). Shown once
 * any waiting decision is answered, so it never competes with the decision dialog.
 */
export function MonthRecap() {
  const recap = useGameStore((s) => s.recap);
  const view = useGameStore((s) => s.session?.view);
  const close = useGameStore((s) => s.closeRecap);
  if (!recap || !view || view.pendingEvent) return null;
  const changes = STATS.map(
    (key) =>
      [key, displayValue(view.character.stats[key]) - displayValue(recap.stats[key])] as const,
  ).filter(([, delta]) => delta !== 0);
  const events = view.feed
    .filter((e) => e.tick > recap.fromTick && !QUIET.has(e.category))
    .reverse()
    .slice(0, 5);
  const cur = view.finance.currency;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={recap.months === 1 ? '1 month later' : `${String(recap.months)} months later`}
    >
      <p className="text-sm text-muted">Now {formatMonth(view.clock)}. Here is what changed.</p>
      {changes.length > 0 && (
        <ul aria-label="Stat changes" className="mt-3 flex flex-wrap gap-2">
          {changes.map(([key, delta]) => (
            <li
              key={key}
              className={cn(
                'rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold',
                delta > 0 ? 'text-success' : 'text-danger',
              )}
            >
              {t(`stat.${key}`)} {delta > 0 ? '+' : ''}
              {delta}
            </li>
          ))}
        </ul>
      )}
      {/* Children have no account of their own: the family pays, so there is nothing to show. */}
      {(recap.moneyIn !== 0n || recap.moneyOut !== 0n) && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {(
            [
              ['Money in', recap.moneyIn, false],
              ['Money out', recap.moneyOut, false],
              ['Net', recap.moneyIn - recap.moneyOut, true],
            ] as const
          ).map(([label, amount, signed]) => (
            <div key={label} className="rounded-xl border border-border bg-surface-2/50 p-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold">
                <Money minor={amount} currency={cur} signed={signed} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {events.length > 0 && (
        <ul aria-label="What happened" className="mt-3 divide-y divide-border text-sm">
          {events.map((entry) => (
            <li key={entry.id} className="py-2 text-fg">
              {storyText(entry)}
            </li>
          ))}
        </ul>
      )}
      <Button className="mt-4 w-full" onClick={close}>
        Continue
      </Button>
    </Dialog>
  );
}
