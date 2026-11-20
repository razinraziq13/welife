import { Link } from 'react-router';
import type { DashboardWidget } from '@contracts/saves';
import type { GameView } from '@engine/view';
import { Avatar } from '@app/components/avatar/Avatar';
import { StatBar } from '@app/components/StatBar';
import { t } from '@app/i18n/en';
import {
  biographyText,
  countryName,
  formatAge,
  formatMoney,
  formatShortMonth,
  formatSignedMoney,
  outcomeText,
} from '@app/i18n/format';
import { fromMonthIndex, monthIndex } from '@engine/core/clock';
import { ActivityList } from './ActivityList';

export function tickToMonth(view: GameView, tick: number) {
  return fromMonthIndex(monthIndex(view.clock) - (view.tick - tick));
}

export function ProfileWidget({ view, base }: { view: GameView; base: string }) {
  const c = view.character;
  const h = view.household;
  return (
    <div className="flex items-start gap-4">
      <Avatar
        appearance={c.appearance}
        stage={c.stage}
        ageYears={c.age.years}
        className="size-24"
        label={`Portrait of ${c.displayName}`}
      />
      <div className="min-w-0 text-sm">
        <p className="text-lg font-semibold text-fg">{c.displayName}</p>
        <p className="text-muted">
          {t(`stage.${c.stage}`)} · {formatAge(c.age)}
        </p>
        <p className="text-muted">
          {c.location.name}, {view.country.name}
        </p>
        <p className="text-muted">
          {t(`scenario.${h.scenario}`)} · {t(`wealth.${h.wealth}`)}
        </p>
        {c.alive && (
          <p className="text-muted">
            {c.age.totalMonths === 0
              ? 'Born this month'
              : c.nextBirthdayInMonths === 0
                ? 'Birthday this month!'
                : `Next birthday in ${String(c.nextBirthdayInMonths)} month${c.nextBirthdayInMonths === 1 ? '' : 's'}`}
          </p>
        )}
        <Link
          to={`${base}/character`}
          className="mt-1 inline-block font-medium text-primary underline-offset-2 hover:underline"
        >
          Character details
        </Link>
      </div>
    </div>
  );
}

export function VitalsWidget({ view }: { view: GameView }) {
  const s = view.character.stats;
  return (
    <div>
      <StatBar label={t('stat.health')} value={s.health} />
      <StatBar label={t('stat.happiness')} value={s.happiness} />
      <StatBar label={t('stat.energy')} value={s.energy} />
      <StatBar label={t('stat.stress')} value={s.stress} inverted />
    </div>
  );
}

export function NeedsWidget({ view }: { view: GameView }) {
  const n = view.character.needs;
  return (
    <div>
      {(['rest', 'nutrition', 'social', 'leisure'] as const).map((key) => (
        <StatBar key={key} label={t(`need.${key}`)} value={n[key]} />
      ))}
    </div>
  );
}

export function TimeWidget({ view }: { view: GameView }) {
  const { totalHours, usedHours } = view.time;
  const left = Math.max(0, totalHours - usedHours);
  const percent = totalHours === 0 ? 0 : Math.round((usedHours / totalHours) * 100);
  return (
    <div className="text-sm">
      <p className="text-fg">
        <strong>{left}</strong> of {totalHours} free hours left this month.
      </p>
      <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${String(percent)}%` }} />
      </div>
      <p className="mt-2 text-muted">
        Activities cost time and energy. Repeating the same one in a month helps less each time.
        Free time resets when you advance.
      </p>
    </div>
  );
}

export function FeedWidget({ view, limit = 12 }: { view: GameView; limit?: number }) {
  const entries = [...view.feed].reverse().slice(0, limit);
  if (entries.length === 0) return <p className="text-sm text-muted">Nothing has happened yet.</p>;
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="w-20 shrink-0 text-xs text-muted">
            {formatShortMonth(tickToMonth(view, entry.tick))}
          </span>
          <span className="text-fg">{biographyText(entry)}</span>
        </li>
      ))}
    </ol>
  );
}

export function FamilyWidget({ view, base }: { view: GameView; base: string }) {
  const members = view.household.members;
  return (
    <div className="text-sm">
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar
              appearance={m.appearance}
              stage={m.stage}
              ageYears={m.age.years}
              className="size-9"
              framed={false}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-fg">{m.displayName}</span>
              <span className="block text-xs text-muted">
                {m.relation ? t(`relation.${m.relation}`) : ''} ·{' '}
                {m.alive ? `age ${String(m.age.years)}` : `died at ${String(m.age.years)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        to={`${base}/social`}
        className="mt-2 inline-block font-medium text-primary underline-offset-2 hover:underline"
      >
        Open Social
      </Link>
    </div>
  );
}

export function CountryWidget({ view }: { view: GameView }) {
  const c = view.country;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted">Country</dt>
      <dd className="text-fg">{c.name}</dd>
      <dt className="text-muted">Home</dt>
      <dd className="text-fg">
        {view.character.location.name} ({view.character.location.kind})
      </dd>
      <dt className="text-muted">Currency</dt>
      <dd className="text-fg">{c.currency.code}</dd>
      <dt className="text-muted">Typical monthly wage</dt>
      <dd className="text-fg">≈ {formatMoney(c.medianMonthlyWageMinor, c.currency)}</dd>
      {view.household.originCountryCode && (
        <>
          <dt className="text-muted">Family origin</dt>
          <dd className="text-fg">{countryName(view.household.originCountryCode)}</dd>
        </>
      )}
    </dl>
  );
}

export function MoneyWidget({ view, base }: { view: GameView; base: string }) {
  const f = view.finance;
  const p = f.personal;
  const h = f.household;
  return (
    <div className="text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {p && (
          <>
            <dt className="text-muted">Your money</dt>
            <dd className="text-right font-semibold text-fg">
              {formatMoney((p.checking ?? 0n) + (p.savings ?? 0n), f.currency)}
            </dd>
            <dt className="text-muted">Net worth</dt>
            <dd className="text-right text-fg">{formatMoney(p.netWorth, f.currency)}</dd>
          </>
        )}
        <dt className="text-muted">This month</dt>
        <dd className="text-right text-fg">
          {formatSignedMoney(
            f.month.totalIncome -
              f.month.totalExpenses -
              f.month.repaid.reduce((sum, r) => sum + r.amount, 0n),
            f.currency,
          )}
        </dd>
        {h && !h.isHead && (
          <>
            <dt className="text-muted">Family savings</dt>
            <dd className="text-right text-fg">
              {formatMoney(h.checking + h.savings, f.currency)}
            </dd>
          </>
        )}
      </dl>
      <Link
        to={`${base}/finance`}
        className="mt-2 inline-block font-medium text-primary underline-offset-2 hover:underline"
      >
        Open Finance
      </Link>
    </div>
  );
}

export function StudiesWidget({ view, base }: { view: GameView; base: string }) {
  const school = view.education.current;
  const job = view.work.job;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {school ? (
        <div>
          <p className="font-medium text-fg">{school.programName ?? school.stageName}</p>
          <p className="text-muted">{school.institution}</p>
          {school.stage !== 'preschool' && (
            <StatBar label="Grade average" value={school.grade} compact />
          )}
        </div>
      ) : (
        <p className="text-muted">Not in education.</p>
      )}
      {job ? (
        <div>
          <p className="font-medium text-fg">{job.title}</p>
          <p className="text-muted">{job.employer}</p>
          <StatBar label="Performance" value={job.performance} compact />
        </div>
      ) : view.work.canWork ? (
        <p className="text-muted">
          {view.work.retired
            ? 'Retired.'
            : `No job · ${String(view.work.postings.length)} openings nearby.`}
        </p>
      ) : null}
      <Link
        to={`${base}/career`}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        Open Career
      </Link>
    </div>
  );
}

export function CalendarWidget({ view, base }: { view: GameView; base: string }) {
  const next = view.calendar.upcoming.slice(0, 5);
  return (
    <div className="text-sm">
      {next.length === 0 ? (
        <p className="text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {next.map((e, i) => (
            <li key={`${e.kind}-${String(i)}`} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs text-muted">
                {formatShortMonth(tickToMonth(view, e.tick))}
              </span>
              <span className="text-fg">{outcomeText(e.key, e.params)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to={`${base}/calendar`}
        className="mt-2 inline-block font-medium text-primary underline-offset-2 hover:underline"
      >
        Open calendar
      </Link>
    </div>
  );
}

export function PeopleWidget({ view, base }: { view: GameView; base: string }) {
  const friends = view.social.people
    .filter((p) => p.alive && (p.relation === 'friend' || p.isPartner))
    .sort((a, b) => (b.closeness ?? 0) - (a.closeness ?? 0))
    .slice(0, 5);
  return (
    <div className="text-sm">
      {friends.length === 0 ? (
        <p className="text-muted">No close friends yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {friends.map((p) => (
            <li key={p.id}>
              <Link
                to={`${base}/people/${p.id}`}
                className="flex items-center gap-3 rounded-lg hover:bg-surface-2"
              >
                <Avatar
                  appearance={p.appearance}
                  stage={p.stage}
                  ageYears={p.age.years}
                  className="size-9"
                  framed={false}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{p.displayName}</span>
                  <span className="block text-xs text-muted">
                    {p.isPartner ? t('relation.partner') : t('relation.friend')}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to={`${base}/social`}
        className="mt-2 inline-block font-medium text-primary underline-offset-2 hover:underline"
      >
        Open Social
      </Link>
    </div>
  );
}

export function renderWidget(id: DashboardWidget, view: GameView, base: string) {
  switch (id) {
    case 'profile':
      return <ProfileWidget view={view} base={base} />;
    case 'vitals':
      return <VitalsWidget view={view} />;
    case 'time':
      return <TimeWidget view={view} />;
    case 'activities':
      return <ActivityList />;
    case 'feed':
      return <FeedWidget view={view} />;
    case 'needs':
      return <NeedsWidget view={view} />;
    case 'family':
      return <FamilyWidget view={view} base={base} />;
    case 'country':
      return <CountryWidget view={view} />;
    case 'money':
      return <MoneyWidget view={view} base={base} />;
    case 'studies':
      return <StudiesWidget view={view} base={base} />;
    case 'calendar':
      return <CalendarWidget view={view} base={base} />;
    case 'people':
      return <PeopleWidget view={view} base={base} />;
  }
}
