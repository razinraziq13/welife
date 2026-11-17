import { Link } from 'react-router';
import {
  Bell,
  ChevronRight,
  GitBranch,
  LogOut,
  Settings,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Avatar } from '@app/components/avatar/Avatar';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { countryName, formatMoney } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { HABIT_KEYS, SKILL_KEYS } from '@engine/state/schema';
import type { PersonView } from '@engine/view';
import { ActivityList } from '../ActivityList';

function habitLevel(value: number): string {
  if (value >= 70) return 'Strong habit';
  if (value >= 40) return 'Regular';
  if (value >= 15) return 'Forming';
  return 'Not yet a habit';
}

export function CareerTab() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const c = session.view.character;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Career"
        description="Skills and habits you build now shape the opportunities you will have later."
      />
      <Card title="Education and work">
        <p className="text-sm text-fg">
          School, further study and jobs are not simulated in this build of WeLife yet. Everything
          you practise now is kept and will count when they are.
        </p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Skills">
          {SKILL_KEYS.map((key) => (
            <StatBar key={key} label={t(`skill.${key}`)} value={c.skills[key]} />
          ))}
        </Card>
        <Card
          title="Habits"
          description="Habits form from repeating an activity month after month, and fade if you stop."
        >
          <dl className="divide-y divide-border text-sm">
            {HABIT_KEYS.map((key) => (
              <div key={key} className="flex justify-between gap-2 py-2">
                <dt className="text-fg">{t(`habit.${key}`)}</dt>
                <dd className="text-muted">{habitLevel(c.habits[key])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <Card title="Practise and learn">
        <ActivityList
          filter={(a) =>
            a.category === 'learn' || a.category === 'creative' || a.category === 'health'
          }
        />
      </Card>
    </div>
  );
}

export function FinanceTab() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const h = view.household;
  const c = view.country;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Finance" />
      <Card title="Your household">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Circumstances</dt>
          <dd className="text-fg">{t(`wealth.${h.wealth}`)}</dd>
          <dt className="text-muted">Family background</dt>
          <dd className="text-fg">{t(`scenario.${h.scenario}`)}</dd>
          {h.familyTrade && (
            <>
              <dt className="text-muted">Family business</dt>
              <dd className="text-fg">A {t(`trade.${h.familyTrade}`)}</dd>
            </>
          )}
          {h.originCountryCode && (
            <>
              <dt className="text-muted">Family origin</dt>
              <dd className="text-fg">{countryName(h.originCountryCode)}</dd>
            </>
          )}
        </dl>
        <p className="mt-3 text-sm text-muted">
          Your household’s circumstances already affect your life: nutrition, and how much you get
          out of practising skills.
        </p>
      </Card>
      <Card title={`Cost of living in ${view.character.location.name}`}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Currency</dt>
          <dd className="text-fg">
            {c.currency.code} ({c.currency.symbol})
          </dd>
          <dt className="text-muted">Typical monthly wage</dt>
          <dd className="text-fg">≈ {formatMoney(c.medianMonthlyWageMinor, c.currency)}</dd>
          <dt className="text-muted">Living costs vs. national average</dt>
          <dd className="text-fg">{c.locationCostIndex}%</dd>
          <dt className="text-muted">National costs vs. the United States</dt>
          <dd className="text-fg">{c.costOfLivingIndex}%</dd>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Approximate baseline figures (about {c.sourceAsOf}); later values are simulated.
        </p>
      </Card>
      <Card title="Your money">
        <p className="text-sm text-fg">
          You have no personal accounts yet. Bank accounts, income, spending, taxes and savings are
          not simulated in this build of WeLife.
        </p>
      </Card>
    </div>
  );
}

function PersonCard({ person }: { person: PersonView }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-3">
      <Avatar
        appearance={person.appearance}
        stage={person.stage}
        ageYears={person.age.years}
        className="size-14"
        framed={false}
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-fg">{person.displayName}</p>
        <p className="text-muted">
          {person.relation ? t(`relation.${person.relation}`) : ''} ·{' '}
          {person.alive ? `age ${String(person.age.years)}` : `died at ${String(person.age.years)}`}
        </p>
        {person.closeness !== null && person.alive && (
          <StatBar label="Closeness" value={person.closeness * 10} compact />
        )}
      </div>
    </li>
  );
}

export function SocialTab() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const parents = view.household.members.filter((m) => m.relation === 'parent');
  const siblings = view.household.members.filter((m) => m.relation === 'sibling');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Social"
        description="Your family. Friends, relationships and community life join here as you grow."
      />
      <Card title="Family tree">
        <div
          className="flex flex-col items-center gap-3 text-center text-sm"
          aria-label="Family tree"
        >
          <ul className="flex flex-wrap justify-center gap-4">
            {parents.map((p) => (
              <li key={p.id} className="flex flex-col items-center">
                <Avatar
                  appearance={p.appearance}
                  stage={p.stage}
                  ageYears={p.age.years}
                  className="size-14"
                />
                <span className="font-medium text-fg">{p.identity.firstName}</span>
                <span className="text-xs text-muted">
                  {t('relation.parent')}
                  {p.alive ? '' : ' (died)'}
                </span>
              </li>
            ))}
          </ul>
          <div aria-hidden="true" className="h-4 w-px bg-border" />
          <ul className="flex flex-wrap justify-center gap-4">
            {[...siblings, null].map((s) =>
              s === null ? (
                <li key="you" className="flex flex-col items-center">
                  <Avatar
                    appearance={view.character.appearance}
                    stage={view.character.stage}
                    ageYears={view.character.age.years}
                    className="size-14"
                  />
                  <span className="font-semibold text-fg">You</span>
                  <span className="text-xs text-muted">{view.character.identity.firstName}</span>
                </li>
              ) : (
                <li key={s.id} className="flex flex-col items-center">
                  <Avatar
                    appearance={s.appearance}
                    stage={s.stage}
                    ageYears={s.age.years}
                    className="size-14"
                  />
                  <span className="font-medium text-fg">{s.identity.firstName}</span>
                  <span className="text-xs text-muted">{t('relation.sibling')}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      </Card>
      <Card title="Family members">
        <ul className="grid gap-2 md:grid-cols-2">
          {view.household.members.map((m) => (
            <PersonCard key={m.id} person={m} />
          ))}
        </ul>
      </Card>
      <Card title="Spend time together">
        <ActivityList filter={(a) => a.category === 'social'} />
      </Card>
    </div>
  );
}

export function MoreTab() {
  const session = useGameStore((s) => s.session);
  const close = useGameStore((s) => s.close);
  if (!session) return null;
  const base = `/play/${session.saveId}`;
  const items = [
    {
      to: `${base}/character`,
      label: 'Character details',
      desc: 'Stats, needs, skills and your life story',
      icon: UserRound,
    },
    {
      to: `${base}/timeline`,
      label: 'Timeline and rewind',
      desc: `Monthly history · ${session.branch.name}`,
      icon: GitBranch,
    },
    {
      to: `${base}/notifications`,
      label: 'Notifications',
      desc: `${String(session.view.unreadCount)} unread`,
      icon: Bell,
    },
    {
      to: `${base}/rules`,
      label: 'Game rules',
      desc: 'Difficulty and Easy Migration for this life',
      icon: SlidersHorizontal,
    },
    {
      to: '/settings',
      label: 'Settings',
      desc: 'Theme, text size, motion and shortcuts',
      icon: Settings,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="More" />
      <Card>
        <ul className="divide-y divide-border">
          {items.map(({ to, label, desc, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-surface-2"
              >
                <Icon aria-hidden="true" className="size-5 text-muted" />
                <span className="flex-1">
                  <span className="block font-medium text-fg">{label}</span>
                  <span className="block text-sm text-muted">{desc}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 text-muted" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/"
              onClick={close}
              className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-surface-2"
            >
              <LogOut aria-hidden="true" className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block font-medium text-fg">Back to your lives</span>
                <span className="block text-sm text-muted">Everything is saved automatically</span>
              </span>
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
