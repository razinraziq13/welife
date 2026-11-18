import { useId, useState } from 'react';
import { Link } from 'react-router';
import { addMonths } from '@engine/core/clock';
import type { GameView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { formatMonth, formatShortMonth, outcomeText } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

const TARGET: Record<string, string> = {
  career: 'career',
  finance: 'finance',
  social: 'social',
  calendar: 'calendar',
  character: 'character',
  family: 'family',
};

function entryText(key: string, params: Record<string, string | number>): string {
  return outcomeText(key, params);
}

function TimeCard({ view }: { view: GameView }) {
  const time = view.calendar.time;
  const left = Math.max(0, time.total - time.used);
  return (
    <Card
      title={`This month: ${formatMonth(view.clock)}`}
      description="Free time for activities, people and plans. Commitments you choose change it."
    >
      <dl className="text-sm">
        {time.lines.map((line, i) => (
          <div key={`${line.key}-${String(i)}`} className="flex justify-between gap-3 py-1">
            <dt className="text-muted">{outcomeText(line.key, line.params ?? {})}</dt>
            <dd className="font-medium tabular-nums text-fg">
              {line.hours > 0 && line.key !== 'time.base' ? '+' : ''}
              {line.hours} h
            </dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2">
          <dt className="font-semibold text-fg">Available</dt>
          <dd className="font-semibold tabular-nums text-fg">{time.total} h</dd>
        </div>
        <div className="flex justify-between gap-3 py-1">
          <dt className="text-muted">Used so far</dt>
          <dd className="tabular-nums text-fg">{time.used} h</dd>
        </div>
        <div className="flex justify-between gap-3 py-1">
          <dt className="text-muted">Left</dt>
          <dd className="font-semibold tabular-nums text-fg">{left} h</dd>
        </div>
      </dl>
    </Card>
  );
}

function PlansCard({ view }: { view: GameView }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const activityId = useId();
  const timesId = useId();
  const options = view.activities.filter((a) => a.reason !== 'too-young' && a.reason !== 'too-old');
  const [activity, setActivity] = useState(options[0]?.id ?? '');
  const [times, setTimes] = useState(1);
  const disabled = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  const plans = view.calendar.plans;
  const overBudget = view.calendar.plannedHours > view.calendar.time.total;
  return (
    <Card
      title="Monthly plan"
      description="Recurring activities happen automatically at the end of each month, using whatever free time is left."
    >
      {plans.length === 0 ? (
        <p className="text-sm text-muted">No recurring activities yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 text-fg">
                {t(`activity.${p.activityId}`)} × {p.timesPerMonth}{' '}
                <span className="text-muted">({p.hours} h a month)</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => void send({ type: 'cancelPlan', planId: p.id })}
                aria-label={`Remove ${t(`activity.${p.activityId}`)} from the plan`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {overBudget && (
        <p role="note" className="mt-2 text-sm text-danger">
          Conflict: your plan needs {view.calendar.plannedHours} h but you have{' '}
          {view.calendar.time.total} h. Some activities will be skipped.
        </p>
      )}
      {options.length > 0 && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ type: 'planActivity', activityId: activity, timesPerMonth: times });
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={activityId} className="text-sm text-fg">
              Activity
            </label>
            <select
              id={activityId}
              value={activity}
              onChange={(e) => {
                setActivity(e.target.value);
              }}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
            >
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {t(`activity.${a.id}`)} ({a.hours} h)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={timesId} className="text-sm text-fg">
              Times a month
            </label>
            <select
              id={timesId}
              value={times}
              onChange={(e) => {
                setTimes(Number(e.target.value));
              }}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" disabled={disabled}>
            Add to plan
          </Button>
        </form>
      )}
    </Card>
  );
}

function BookCard({ view }: { view: GameView }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const kindId = useId();
  const monthId = useId();
  const adult = view.character.age.years >= 18;
  const [kind, setKind] = useState<string>(adult ? 'vacation:domestic' : 'checkup:general');
  const [offset, setOffset] = useState(2);
  const disabled = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  const [itemKind, option] = kind.split(':') as ['vacation' | 'checkup', string];
  const target = view.tick + offset;
  const cost =
    itemKind === 'checkup'
      ? view.calendar.checkupCostMinor
      : (view.calendar.vacations.find((v) => v.id === option)?.costMinor ?? 0n);
  const clashes = view.calendar.upcoming.filter(
    (u) =>
      u.tick === target &&
      (u.kind === 'exam' ||
        u.kind === 'interview' ||
        u.kind === 'wedding' ||
        u.kind === 'family' ||
        u.kind === itemKind),
  );
  return (
    <Card
      title="Book something"
      description="Holidays restore rest and happiness; a check-up is good for your health. Costs are paid in the month itself."
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ type: 'scheduleItem', itemKind, option, tick: target });
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={kindId} className="text-sm text-fg">
            What
          </label>
          <select
            id={kindId}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {adult &&
              view.calendar.vacations.map((v) => (
                <option key={v.id} value={`vacation:${v.id}`}>
                  {t(`vacation.${v.id}`)}
                </option>
              ))}
            <option value="checkup:general">{t('checkup.general')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={monthId} className="text-sm text-fg">
            When
          </label>
          <select
            id={monthId}
            value={offset}
            onChange={(e) => {
              setOffset(Number(e.target.value));
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {formatMonth(addMonths(view.clock, n))}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" disabled={disabled}>
          Book
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted">
        Cost: <Money minor={cost} currency={view.country.currency} />
        {itemKind === 'checkup' ? ' before healthcare coverage' : ''}.
      </p>
      {clashes.length > 0 && (
        <p role="note" className="mt-1 text-sm text-danger">
          Clash: {clashes.map((c) => entryText(c.key, c.params)).join('; ')}.
        </p>
      )}
      {!adult && (
        <p className="mt-1 text-xs text-muted">
          Holidays can be booked from 18; your family takes you on trips until then.
        </p>
      )}
    </Card>
  );
}

function UpcomingCard({ view, base }: { view: GameView; base: string }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const upcoming = view.calendar.upcoming;
  const byMonth = new Map<number, typeof upcoming>();
  for (const u of upcoming) byMonth.set(u.tick, [...(byMonth.get(u.tick) ?? []), u]);
  return (
    <Card title="The next 12 months">
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">Nothing scheduled.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {[...byMonth].map(([tick, entries]) => (
            <li key={tick}>
              <h3 className="text-sm font-semibold text-fg">
                {formatShortMonth(tickToMonth(view, tick))}
              </h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {entries.map((e, i) => {
                  const href =
                    e.target === 'person' && e.targetId
                      ? `${base}/people/${e.targetId}`
                      : `${base}/${TARGET[e.target] ?? 'calendar'}`;
                  return (
                    <li
                      key={`${e.kind}-${String(i)}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Link to={href} className="text-fg underline-offset-2 hover:underline">
                        {entryText(e.key, e.params)}
                      </Link>
                      {e.params.cost && e.kind !== 'wedding' && (
                        <span className="text-xs text-muted">
                          (
                          <Money
                            minor={BigInt(String(e.params.cost))}
                            currency={view.country.currency}
                          />
                          )
                        </span>
                      )}
                      {e.itemId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || view.pendingEvent !== null}
                          onClick={() => {
                            if (e.itemId) void send({ type: 'cancelItem', itemId: e.itemId });
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Calendar (spec §3.6): the month's time, recurring plans, bookings and the year ahead. */
export function CalendarScreen() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" />
      <div className="grid gap-4 lg:grid-cols-2">
        <TimeCard view={view} />
        <PlansCard view={view} />
      </div>
      <BookCard view={view} />
      <UpcomingCard view={view} base={base} />
    </div>
  );
}
