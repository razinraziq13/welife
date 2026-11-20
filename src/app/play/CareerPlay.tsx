import { Link } from 'react-router';
import { Briefcase, Landmark, Lock, Star, Store, UserRound } from 'lucide-react';
import type { GameView } from '@engine/view';
import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { ActionButton } from './ActionButton';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';

/**
 * Career play (gameplay expansion, feature 6): the track's own actions, professional
 * reputation, a specialism, job satisfaction and what drives it, and links to the people and
 * systems a career involves (manager, business, politics).
 */
export function CareerPlayCard({ view, base }: { view: GameView; base: string }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = view.pendingEvent !== null;
  const c = view.work.career;
  const currency = view.country.currency;
  const job = view.work.job;
  if (!job && !c.ownsBusiness && !c.inPolitics) return null;
  const hoursLeft = Math.max(0, view.time.totalHours - view.time.usedHours);
  return (
    <Card
      title="Your career path"
      description={
        c.track
          ? `${t(`careerTrack.${c.track}`)} career. Extra work uses free time (${String(hoursLeft)} hours left this month); each action once a month.`
          : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <StatBar label="Professional reputation" value={c.reputation} />
            <p className="mt-1 text-xs text-muted">
              Grows with good work, networking and standing out. It helps with raises and
              promotions.
            </p>
          </div>
          <div>
            {c.specialty ? (
              <p className="flex items-center gap-2 text-sm text-fg">
                <Star aria-hidden="true" className="size-4 text-accent-strong" />
                Specialism: <strong>{c.specialty}</strong>
              </p>
            ) : (
              <>
                <StatBar label="Towards a specialism" value={c.specialtyProgress * 10} />
                <p className="mt-1 text-xs text-muted">
                  A specialism raises your pay by 10% and stays with you across jobs.
                </p>
              </>
            )}
          </div>
        </div>

        {c.acting &&
          (c.acting.music ? (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <h3 className="font-semibold text-fg">Your music</h3>
              <p className="mt-1 text-muted">
                {c.acting.credits} release{c.acting.credits === 1 ? '' : 's'} that ran their course.
                Play gigs for pay and reputation; release a single for royalties (a bigger name
                earns more).
              </p>
              {c.acting.contract?.kind === 'single' && (
                <p className="mt-1 text-fg">
                  Your single earns{' '}
                  <Money minor={c.acting.contract.monthlyMinor} currency={currency} /> a month in
                  royalties, {c.acting.contract.monthsLeft} month
                  {c.acting.contract.monthsLeft === 1 ? '' : 's'} to go.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <h3 className="font-semibold text-fg">Screen work</h3>
              <p className="mt-1 text-muted">
                {c.acting.credits} screen credit{c.acting.credits === 1 ? '' : 's'}. Auditions now
                offer {c.acting.nextRole} roles (supporting from 2 credits; lead from 5 credits and
                reputation 50).
              </p>
              {c.acting.contract && c.acting.contract.kind !== 'single' && (
                <p className="mt-1 text-fg">
                  Working on a {c.acting.contract.kind === 'film' ? 'film' : 'TV series'} as{' '}
                  {c.acting.contract.role}
                  {c.acting.contract.monthlyMinor > 0n && (
                    <>
                      {' '}
                      for <Money minor={c.acting.contract.monthlyMinor} currency={currency} /> a
                      month
                    </>
                  )}
                  , {c.acting.contract.monthsLeft} month
                  {c.acting.contract.monthsLeft === 1 ? '' : 's'} to go.
                </p>
              )}
            </div>
          ))}

        {c.satisfaction && (
          <div>
            <h3 className="text-sm font-semibold text-fg">
              Job satisfaction: {c.satisfaction.score}/100
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {c.satisfaction.factors.map((f) => (
                <li
                  key={f.key}
                  className={cn(
                    'rounded-full px-2 py-0.5 font-medium',
                    f.effect > 0 ? 'bg-primary-soft text-fg' : 'bg-surface-2 text-danger',
                  )}
                >
                  {t(`satisfaction.${f.key}`)} {f.effect > 0 ? '+' : ''}
                  {f.effect}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">
              Satisfaction affects your happiness each month.
            </p>
          </div>
        )}

        {c.actions.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg">At work this month</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {c.actions.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3"
                >
                  <div>
                    <p className="font-medium text-fg">{t(`workAction.${a.id}`)}</p>
                    <p className="text-xs text-muted">{t(`workActionHint.${a.id}`)}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {a.hours} h · energy {Math.round(a.energy / 10)}
                  </p>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    busy={busy}
                    reason={pending ? 'Make the waiting decision first.' : a.reason}
                    onAct={() => void send({ type: 'workAction', actionId: a.id })}
                    aria-label={`Do it: ${t(`workAction.${a.id}`)}`}
                  >
                    Do it
                  </ActionButton>
                  {!a.available && (
                    <p className="flex items-start gap-1 text-xs text-muted">
                      <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      {a.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-sm">
          {job?.managerId && (
            <Link
              to={`${base}/people/${job.managerId}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 font-medium text-fg hover:bg-primary-soft"
            >
              <UserRound aria-hidden="true" className="size-4" />
              Talk to {job.managerName ?? 'your manager'} (raise, promotion, mentoring)
            </Link>
          )}
          {c.ownsBusiness && (
            <Link
              to={`${base}/business`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 font-medium text-fg hover:bg-primary-soft"
            >
              <Store aria-hidden="true" className="size-4" />
              Run your business (hiring, launches, rivals)
            </Link>
          )}
          {c.inPolitics && (
            <Link
              to={`${base}/politics`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 font-medium text-fg hover:bg-primary-soft"
            >
              <Landmark aria-hidden="true" className="size-4" />
              Politics (campaigns, approval)
            </Link>
          )}
          {!job && !c.ownsBusiness && (
            <p className="flex items-center gap-2 text-muted">
              <Briefcase aria-hidden="true" className="size-4" />
              Find a job to unlock work actions.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
