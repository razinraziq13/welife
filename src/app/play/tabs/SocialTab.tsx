import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Network, UserPlus } from 'lucide-react';
import type { PersonSummary } from '@engine/view';
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
