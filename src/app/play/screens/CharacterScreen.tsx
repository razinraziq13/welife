import type { ReactNode } from 'react';
import {
  Briefcase,
  Cake,
  Crown,
  Flower2,
  GraduationCap,
  MapPin,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Avatar } from '@app/components/avatar/Avatar';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import {
  causeText,
  formatAge,
  formatMonth,
  formatShortMonth,
  qualificationName,
} from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { NEED_KEYS, SKILL_KEYS, STAT_KEYS } from '@engine/state/schema';
import { FeedWidget, tickToMonth } from '../widgets';
import { HeadlineStats, occupationLine } from '../LifeHero';

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-fg">{children}</dd>
    </div>
  );
}

/** Character Detail (spec §3.4). Personality traits are hidden by design; only their effects show. */
export function CharacterScreen() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const c = view.character;
  const highest = view.education.qualifications.at(-1);
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Portrait"
        className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-md"
      >
        <div aria-hidden="true" className="wl-town-scene h-36 sm:h-44" />
        <div className="flex flex-wrap items-start gap-4 px-4 pb-5 sm:px-6">
          <Avatar
            appearance={c.appearance}
            stage={c.stage}
            ageYears={c.age.years}
            className="-mt-16 size-32 shrink-0 rounded-[2rem] border-[6px] border-white bg-primary-soft shadow-lg sm:size-40"
            label={`Portrait of ${c.displayName}`}
          />
          <div className="min-w-0 flex-1 pt-3">
            <PageHeader title={c.displayName} documentTitle="Character" />
            <p className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-fg">
                <Crown aria-hidden="true" className="size-3.5 text-accent-strong" />
                Generation {view.legacy.generation}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-fg">
                <Sparkles aria-hidden="true" className="size-3.5 text-accent-strong" />
                {t(`stage.${c.stage}`)}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">Your story so far</p>
          </div>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Personal details">
          <dl className="flex flex-col divide-y divide-border text-sm">
            <Detail icon={UserRound} label="Age">
              {formatAge(c.age)}
            </Detail>
            <Detail icon={Cake} label="Born">
              {formatMonth(c.birth)} in {view.country.name}
            </Detail>
            {c.death && (
              <Detail icon={Flower2} label="Died">
                {formatMonth(c.death)} ({t(`cause.${c.deathCause ?? 'natural'}`)})
              </Detail>
            )}
            <Detail icon={MapPin} label="Lives in">
              {c.location.name}, {c.location.region}
            </Detail>
            <Detail icon={Briefcase} label="Occupation">
              {occupationLine(view)}
            </Detail>
            <Detail icon={GraduationCap} label="Education">
              {highest ? qualificationName(highest, c.countryCode) : 'No qualifications yet'}
            </Detail>
            <Detail icon={Users} label="Gender">
              {c.identity.gender === 'nonbinary'
                ? 'Non-binary'
                : c.identity.gender === 'female'
                  ? 'Female'
                  : 'Male'}
            </Detail>
          </dl>
        </Card>
        <Card title="Key statistics">
          <HeadlineStats view={view} />
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Stats">
          {STAT_KEYS.map((key) => (
            <StatBar
              key={key}
              label={t(`stat.${key}`)}
              value={c.stats[key]}
              inverted={key === 'stress'}
              compact
            />
          ))}
        </Card>
        <Card title="Needs">
          {NEED_KEYS.map((key) => (
            <StatBar key={key} label={t(`need.${key}`)} value={c.needs[key]} compact />
          ))}
        </Card>
        <Card title="Skills">
          {SKILL_KEYS.map((key) => (
            <StatBar key={key} label={t(`skill.${key}`)} value={c.skills[key]} compact />
          ))}
        </Card>
      </div>
      <Card title="Recent changes" description="Every change to your stats has a cause.">
        {c.statLog.length === 0 ? (
          <p className="text-sm text-muted">No changes yet.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {[...c.statLog]
              .reverse()
              .slice(0, 20)
              .map((change, index) => {
                const [group, key] = change.key.split('.') as [string, string];
                return (
                  <li key={`${String(change.tick)}-${String(index)}`} className="flex gap-3">
                    <span className="w-20 shrink-0 text-xs text-muted">
                      {formatShortMonth(tickToMonth(view, change.tick))}
                    </span>
                    <span className="flex-1 text-fg">
                      {t(`${group === 'skills' ? 'skill' : 'stat'}.${key}`)}{' '}
                      <strong className={change.delta >= 0 ? 'text-success' : 'text-danger'}>
                        {change.delta > 0 ? '+' : ''}
                        {(change.delta / 10).toFixed(1)}
                      </strong>
                    </span>
                    <span className="text-muted">{causeText(change.cause)}</span>
                  </li>
                );
              })}
          </ol>
        )}
      </Card>
      <Card title="Life story">
        <FeedWidget view={view} limit={80} />
      </Card>
    </div>
  );
}
