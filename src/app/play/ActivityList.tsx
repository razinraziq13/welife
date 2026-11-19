import type { ActivityAvailability } from '@engine/activities/activities';
import { ActionButton } from './ActionButton';
import { t } from '@app/i18n/en';
import { displayValue } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';

const REASON: Record<NonNullable<ActivityAvailability['reason']>, string> = {
  'too-young': 'Too young for this yet',
  'too-old': 'Outgrown',
  'no-time': 'No free time left this month',
};

/** Activities with their time/energy cost and how effective the next attempt will be. */
export function ActivityList({ filter }: { filter?: (a: ActivityAvailability) => boolean }) {
  const session = useGameStore((s) => s.session);
  const busy = useGameStore((s) => s.busy);
  const act = useGameStore((s) => s.act);
  const last = useGameStore((s) => s.lastActivity);
  if (!session) return null;
  const view = session.view;
  const pending = view.pendingEvent !== null;
  const items = view.activities.filter(filter ?? (() => true));
  if (view.lifeStatus !== 'alive')
    return <p className="text-sm text-muted">No activities: this life has ended.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border">
        {items.map((a) => {
          const reason = pending
            ? 'Make the waiting decision first'
            : a.reason
              ? REASON[a.reason]
              : null;
          return (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{t(`activity.${a.id}`)}</p>
                <p className="text-xs text-muted">
                  {t(`activityCategory.${a.category}`)} · {a.hours} h ·{' '}
                  {a.energy >= 0
                    ? `${String(displayValue(a.energy))} energy`
                    : `restores ${String(displayValue(-a.energy))} energy`}
                  {a.timesThisMonth > 0 &&
                    ` · done ${String(a.timesThisMonth)}× this month, next attempt ${String(a.nextEffectPercent)}% effective`}
                </p>
                {reason && <p className="text-xs font-medium text-danger">{reason}</p>}
              </div>
              <ActionButton
                size="sm"
                variant="secondary"
                busy={busy}
                reason={reason}
                onAct={() => void act(a.id)}
                aria-label={`Do it: ${t(`activity.${a.id}`)}${reason ? ` (unavailable: ${reason})` : ''}`}
              >
                Do it
              </ActionButton>
            </li>
          );
        })}
      </ul>
      {last && (
        <p role="status" className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg">
          {t(`activity.${last.activityId}`)}: {t(`activityStatus.${last.status}`)}
          {last.changes.filter((c) => c.delta !== 0).length > 0 &&
            ' ' +
              last.changes
                .filter((c) => c.delta !== 0)
                .map(
                  (c) =>
                    `${t(`${c.kind === 'stat' ? 'stat' : c.kind === 'need' ? 'need' : 'skill'}.${c.key}`)} ${c.delta > 0 ? '+' : ''}${(c.delta / 10).toFixed(1)}`,
                )
                .join(', ')}
          {` · ${String(last.hoursLeft)} free hours left.`}
        </p>
      )}
    </div>
  );
}
