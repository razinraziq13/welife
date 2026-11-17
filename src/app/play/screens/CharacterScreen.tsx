import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Avatar } from '@app/components/avatar/Avatar';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { causeText, formatAge, formatMonth, formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { NEED_KEYS, SKILL_KEYS, STAT_KEYS } from '@engine/state/schema';
import { FeedWidget, tickToMonth } from '../widgets';

/** Character Detail (spec §3.4). Personality traits are hidden by design; only their effects show. */
export function CharacterScreen() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const c = view.character;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={c.displayName} documentTitle="Character" />
      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar
            appearance={c.appearance}
            stage={c.stage}
            ageYears={c.age.years}
            className="size-32"
            label={`Portrait of ${c.displayName}`}
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm">
            <dt className="text-muted">Age</dt>
            <dd className="text-fg">{formatAge(c.age)}</dd>
            <dt className="text-muted">Born</dt>
            <dd className="text-fg">
              {formatMonth(c.birth)} in {view.country.name}
            </dd>
            {c.death && (
              <>
                <dt className="text-muted">Died</dt>
                <dd className="text-fg">
                  {formatMonth(c.death)} ({t(`cause.${c.deathCause ?? 'natural'}`)})
                </dd>
              </>
            )}
            <dt className="text-muted">Life stage</dt>
            <dd className="text-fg">{t(`stage.${c.stage}`)}</dd>
            <dt className="text-muted">Lives in</dt>
            <dd className="text-fg">
              {c.location.name}, {c.location.region}
            </dd>
            <dt className="text-muted">Gender</dt>
            <dd className="text-fg">
              {c.identity.gender === 'nonbinary'
                ? 'Non-binary'
                : c.identity.gender === 'female'
                  ? 'Female'
                  : 'Male'}
            </dd>
          </dl>
        </div>
      </Card>
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
