import { useId, useState } from 'react';
import { Link } from 'react-router';
import { CalendarCheck, Lock, Search, Sparkles, Star } from 'lucide-react';
import type { HubItem } from '@engine/activities/hub';
import { HUB_CATEGORIES, type HubCategory } from '@engine/activities/lifestyle';
import { PageHeader } from '@app/components/PageHeader';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { displayValue } from '@app/i18n/format';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';
import { resolveLayout } from '../tabs/LifeTab';
import { SalonDialog } from '../SalonDialog';

/** Existing screens for paperwork that already has its own place in the game. */
const ADMIN_LINKS: { to: string; label: string; hint: string }[] = [
  { to: 'world', label: 'Visas and citizenship', hint: 'Apply, move abroad, check your status.' },
  { to: 'legal', label: 'Legal matters', hint: 'Court cases and records.' },
  { to: 'legacy', label: 'Make a will', hint: 'Decide who inherits what.' },
  { to: 'finance', label: 'Money and taxes', hint: 'Accounts, loans, insurance and tax.' },
];

function hint(item: HubItem): string {
  const text = t(`activityHint.${item.id}`);
  return text.startsWith('activityHint.') ? t('hubCategory.' + item.category) : text;
}

/**
 * Activities Hub (gameplay expansion, feature 8): everything you can do with your free time,
 * searchable and grouped, with costs, suggestions, favourites, monthly plans and a clear reason
 * for anything you cannot do right now.
 */
export function ActivitiesHubScreen() {
  const session = useGameStore((s) => s.session);
  const send = useGameStore((s) => s.send);
  const act = useGameStore((s) => s.act);
  const busy = useGameStore((s) => s.busy);
  const setLayout = useGameStore((s) => s.setLayout);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HubCategory | 'all'>('all');
  const [salonOpen, setSalonOpen] = useState(false);
  const searchId = useId();
  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  const layout = resolveLayout(session.layout);
  const favourites = new Set(layout.favourites ?? []);
  const pending = view.pendingEvent !== null;
  const alive = view.lifeStatus === 'alive';
  const hoursLeft = Math.max(0, view.time.totalHours - view.time.usedHours);
  const currency = view.country.currency;
  const items = view.hub.items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const q = query.trim().toLowerCase();
  const matches = (i: HubItem) =>
    (category === 'all' || i.category === category) &&
    (q === '' ||
      t(`activity.${i.id}`).toLowerCase().includes(q) ||
      hint(i).toLowerCase().includes(q));
  const filtered = items.filter(matches);
  const browsing = q === '' && category === 'all';

  const toggleFavourite = (id: string) => {
    const next = favourites.has(id) ? [...favourites].filter((f) => f !== id) : [...favourites, id];
    void setLayout({ ...layout, favourites: next });
  };
  const doIt = (item: HubItem) => {
    if (item.id === 'salon') setSalonOpen(true);
    else if (item.kind === 'activity') void act(item.id);
    else void send({ type: 'act', activityId: item.id });
  };

  const card = (item: HubItem, reason?: string) => {
    const name = t(`activity.${item.id}`);
    const blocked = !alive
      ? 'This life has ended.'
      : pending
        ? 'Make the waiting decision first.'
        : item.reason;
    const fav = favourites.has(item.id);
    return (
      <li
        key={`${reason ?? ''}${item.id}`}
        className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-fg">{name}</p>
            <p className="text-xs text-muted">{hint(item)}</p>
            {reason && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                <Sparkles aria-hidden="true" className="size-3.5" />
                {reason}
              </p>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-pressed={fav}
            aria-label={fav ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
            onClick={() => {
              toggleFavourite(item.id);
            }}
          >
            <Star
              aria-hidden="true"
              className={cn('size-4', fav && 'fill-current text-accent-strong')}
            />
          </Button>
        </div>
        <p className="text-xs text-muted">
          {item.hours} h ·{' '}
          {item.energy >= 0
            ? `${String(displayValue(item.energy))} energy`
            : `restores ${String(displayValue(-item.energy))} energy`}
          {' · '}
          {item.costMinor > 0n ? <Money minor={item.costMinor} currency={currency} /> : 'free'}
          {item.timesThisMonth > 0 && ` · done ${String(item.timesThisMonth)}× this month`}
        </p>
        {item.progress !== null && (
          <div>
            <div className="flex justify-between text-xs text-muted">
              <span>Progress</span>
              <span className="font-semibold text-fg">{item.progress}%</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${String(Math.max(2, item.progress))}%` }}
              />
            </div>
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {blocked ? (
            <p className="flex items-start gap-1 text-xs text-muted">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {blocked}
            </p>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                doIt(item);
              }}
              aria-label={`Do it: ${name}`}
            >
              Do it
            </Button>
          )}
          {item.recurring &&
            alive &&
            (item.planned ? (
              <Link
                to={`${base}/calendar`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                <CalendarCheck aria-hidden="true" className="size-3.5" />
                Monthly plan
              </Link>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || pending}
                onClick={() =>
                  void send({ type: 'planActivity', activityId: item.id, timesPerMonth: 1 })
                }
                aria-label={`Do ${name} every month`}
              >
                Every month
              </Button>
            ))}
        </div>
      </li>
    );
  };

  const grid = (list: HubItem[]) => (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((i) => card(i))}</ul>
  );
  const favouriteItems = [...favourites]
    .map((id) => byId.get(id))
    .filter((i): i is HubItem => i !== undefined);
  const suggested = view.hub.recommendations
    .map((r) => {
      const [key, progress] = r.reason.split(':');
      return {
        item: byId.get(r.id),
        reason: t(`hubReason.${key ?? ''}`, { progress: progress ?? '' }),
      };
    })
    .filter((s): s is { item: HubItem; reason: string } => s.item !== undefined);

  return (
    <div className="flex flex-col gap-4">
      {salonOpen && (
        <SalonDialog
          view={view}
          open={salonOpen}
          onOpenChange={setSalonOpen}
          cutMinor={view.hub.salon.cutMinor}
          colourMinor={view.hub.salon.colourMinor}
        />
      )}
      <PageHeader
        title="Activities"
        description={`Everything you can do with your free time. ${String(hoursLeft)} hours left this month.`}
      />
      <div className="flex flex-col gap-3">
        <label htmlFor={searchId} className="sr-only">
          Search activities
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Search activities"
            className="h-11 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-fg placeholder:text-muted"
          />
        </div>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
          {(['all', ...HUB_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
              }}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm font-medium',
                category === c
                  ? 'border-primary bg-primary-soft text-fg'
                  : 'border-border bg-surface text-muted hover:text-fg',
              )}
            >
              {c === 'all' ? 'All' : t(`hubCategory.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {browsing && suggested.length > 0 && (
        <Card title="Suggested for you" description="Picked from how you are doing right now.">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {suggested.map((s) => card(s.item, s.reason))}
          </ul>
        </Card>
      )}
      {browsing && favouriteItems.length > 0 && (
        <Card title="Favourites">{grid(favouriteItems)}</Card>
      )}

      {browsing ? (
        HUB_CATEGORIES.map((c) => {
          const list = filtered.filter((i) => i.category === c);
          if (list.length === 0 && c !== 'admin') return null;
          return (
            <Card key={c} title={t(`hubCategory.${c}`)}>
              {grid(list)}
              {c === 'admin' && <AdminLinks base={base} />}
            </Card>
          );
        })
      ) : (
        <Card title={category === 'all' ? 'Results' : t(`hubCategory.${category}`)}>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No activities match. Try another word or category.</p>
          ) : (
            grid(filtered)
          )}
          {category === 'admin' && q === '' && <AdminLinks base={base} />}
        </Card>
      )}
    </div>
  );
}

function AdminLinks({ base }: { base: string }) {
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {ADMIN_LINKS.map((l) => (
        <li key={l.to}>
          <Link
            to={`${base}/${l.to}`}
            className="flex min-h-11 flex-col rounded-xl border border-border px-3 py-2 hover:bg-primary-soft"
          >
            <span className="text-sm font-medium text-fg">{l.label}</span>
            <span className="text-xs text-muted">{l.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
