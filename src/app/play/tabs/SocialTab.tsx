import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Heart, Network, UserPlus } from 'lucide-react';
import type { GameView, PersonSummary } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Avatar } from '@app/components/avatar/Avatar';
import { Button, buttonVariants } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { t } from '@app/i18n/en';
import { formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { ActivityList } from '../ActivityList';
import { ActionButton } from '../ActionButton';
import { tickToMonth } from '../widgets';

const FAMILY = new Set([
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'auntUncle',
  'nieceNephew',
  'cousin',
]);

type Filter = 'family' | 'friends' | 'others';

export function PersonRow({ person, base }: { person: PersonSummary; base: string }) {
  return (
    <li>
      <Link
        to={`${base}/people/${person.id}`}
        className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2"
      >
        <Avatar
          appearance={person.appearance}
          stage={person.stage}
          ageYears={person.age.years}
          className="size-12"
          framed={false}
        />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold text-fg">{person.displayName}</span>
          <span className="block text-muted">
            {person.relation ? t(`relation.${person.relation}`) : 'Acquaintance'} ·{' '}
            {person.alive
              ? `age ${String(person.age.years)}`
              : `died at ${String(person.age.years)}`}
            {person.sameHousehold ? ' · lives with you' : ''}
          </span>
          {person.alive && person.closeness !== null && (
            <StatBar label="Closeness" value={person.closeness * 10} compact />
          )}
        </span>
        <ChevronRight aria-hidden="true" className="size-4 text-muted" />
      </Link>
    </li>
  );
}

function DatingApp({ view, base }: { view: GameView; base: string }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy || s.advancing);
  const dating = view.social.dating;
  if (!dating || view.lifeStatus !== 'alive') return null;
  const profile = dating.profiles[0];
  const waiting = view.pendingEvent ? 'Make the waiting decision first.' : null;
  const searchReason =
    waiting ??
    (view.time.totalHours - view.time.usedHours < 6
      ? 'Looking for love takes 6 hours of free time.'
      : null);
  const person = profile && view.social.people.find((p) => p.id === profile.id);
  return (
    <Card
      title="Dating App"
      description="Discover singles, like or pass, and get to know your matches."
    >
      {profile ? (
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-3">
            {person && (
              <Avatar
                appearance={person.appearance}
                stage={person.stage}
                ageYears={person.age.years}
                className="size-14"
              />
            )}
            <div>
              <h3 className="font-semibold text-fg">
                {profile.name}, {profile.age}
              </h3>
              <p className="text-sm text-muted">
                {profile.interests.map((interest) => t(`interest.${interest}`)).join(' · ')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              reason={waiting}
              busy={busy}
              onAct={() =>
                void send({
                  type: 'respondToDatingProfile',
                  personId: profile.id,
                  response: 'like',
                })
              }
            >
              <Heart aria-hidden="true" className="size-4" /> Like
            </ActionButton>
            <ActionButton
              variant="secondary"
              reason={waiting}
              busy={busy}
              onAct={() =>
                void send({
                  type: 'respondToDatingProfile',
                  personId: profile.id,
                  response: 'pass',
                })
              }
            >
              Pass for this month
            </ActionButton>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">No new profiles. Look for love to discover someone.</p>
      )}
      <ActionButton
        className="mt-3"
        variant="secondary"
        reason={searchReason}
        busy={busy}
        onAct={() => void send({ type: 'lookForLove' })}
      >
        Look for love (6 h)
      </ActionButton>
      {dating.matches.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="font-semibold text-fg">Matches</h3>
          <ul className="divide-y divide-border">
            {dating.matches.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link
                  to={`${base}/people/${match.id}`}
                  className="font-medium text-primary underline"
                >
                  {match.name}, {match.age}
                </Link>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    busy={busy}
                    reason={waiting}
                    onAct={() =>
                      void send({ type: 'interact', personId: match.id, interactionId: 'chat' })
                    }
                  >
                    Chat (2 h)
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    busy={busy}
                    reason={waiting ?? match.askOutReason}
                    onAct={() =>
                      void send({ type: 'interact', personId: match.id, interactionId: 'askOut' })
                    }
                  >
                    Ask on a date (4 h)
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function SocialTab() {
  const session = useGameStore((s) => s.session);
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const [filter, setFilter] = useState<Filter>('family');
  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  const social = view.social;
  const partner = social.partner;
  const people = social.people.filter((p) => !p.isPartner);
  const groups: Record<Filter, PersonSummary[]> = {
    family: people.filter((p) => p.relation !== null && FAMILY.has(p.relation)),
    friends: people.filter((p) => p.relation === 'friend' && p.alive),
    others: people.filter(
      (p) =>
        (p.relation === null || (!FAMILY.has(p.relation) && p.relation !== 'friend')) && p.alive,
    ),
  };
  const shown = [...groups[filter]].sort(
    (a, b) => Number(b.alive) - Number(a.alive) || (b.closeness ?? 0) - (a.closeness ?? 0),
  );
  const disabled = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Social"
        description="Family, friends, partners and everyone you know. People remember how you treat them."
      />
      <DatingApp view={view} base={base} />
      {partner && (
        <Card title="Your partner">
          <ul>
            <PersonRow person={partner} base={base} />
          </ul>
          <p className="mt-1 text-sm text-muted">
            {t(`partnership.${partner.partnership.status}`)} since{' '}
            {formatShortMonth(tickToMonth(view, partner.partnership.since))}
            {partner.partnership.planningFamily ? ' · trying for a child' : ''}
          </p>
        </Card>
      )}
      {social.expecting.length > 0 && (
        <p
          role="status"
          className="rounded-2xl border border-border bg-accent-soft p-3 text-sm text-fg"
        >
          {social.expecting
            .map(
              (e) =>
                `${e.kind === 'birth' ? 'A baby is due' : 'Your adoption completes'} in ${formatShortMonth(tickToMonth(view, e.dueTick))}.`,
            )
            .join(' ')}
        </p>
      )}
      <Card title="People you know">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <ChoiceGroup
            legend="Show"
            name="people-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'family', label: `Family (${String(groups.family.length)})` },
              { value: 'friends', label: `Friends (${String(groups.friends.length)})` },
              { value: 'others', label: `Others (${String(groups.others.length)})` },
            ]}
          />
          <Link
            to={`${base}/family`}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            <Network aria-hidden="true" className="size-4" /> Family tree
          </Link>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted">
            {filter === 'friends'
              ? 'No friends yet. Spend time with classmates, neighbours or colleagues, then ask them to be friends.'
              : 'Nobody here yet.'}
          </p>
        ) : (
          <ul className="grid gap-1 md:grid-cols-2">
            {shown.map((p) => (
              <PersonRow key={p.id} person={p} base={base} />
            ))}
          </ul>
        )}
      </Card>
      {social.dating && (
        <Card
          title="Dating"
          description={`You are single. Get close to someone (closeness ${String(social.dating.needed)}) and you can ask them on a date. People you are getting close to wait to see where it goes.`}
        >
          {social.dating.candidates.length === 0 ? (
            <p className="text-sm text-muted">
              No single people your age that you know yet. Look for love, or go out and meet people.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {social.dating.candidates.map((d) => {
                const ready = d.closeness >= (social.dating?.needed ?? 45);
                return (
                  <li key={d.id}>
                    <Link
                      to={`${base}/people/${d.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-primary-soft"
                    >
                      <Heart
                        aria-hidden="true"
                        className={
                          ready ? 'size-5 shrink-0 text-danger' : 'size-5 shrink-0 text-muted'
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">
                          {d.name}, {d.age}
                          {d.interested && (
                            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-fg">
                              Interested in you
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted">
                          {ready
                            ? 'Close enough to ask on a date.'
                            : `Closeness ${String(d.closeness)} of ${String(social.dating?.needed ?? 45)}: spend time together.`}{' '}
                          Chemistry {d.chemistry}.
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      {social.canMeetPeople && (
        <Card
          title="Meet new people"
          description="Go out to events and places where people meet. It takes 6 hours and might introduce you to someone new."
        >
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => void send({ type: 'meetPeople' })}
          >
            <UserPlus aria-hidden="true" className="size-4" /> Go out and meet people
          </Button>
        </Card>
      )}
      <Card title="Spend time together">
        <ActivityList filter={(a) => a.category === 'social'} />
      </Card>
    </div>
  );
}
