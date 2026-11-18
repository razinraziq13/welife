import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { PersonDetailView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Avatar } from '@app/components/avatar/Avatar';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { countryName, formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

/** Readable memory descriptions (what one person remembers about the other). */
const MEMORY_TEXT: Record<string, string> = {
  firstFriend: 'Your first friend at school',
  stoodUpForMe: 'You stood up for them when they were being teased',
  gotHelp: 'You fetched help when they were being teased',
  leftAlone: 'You walked away when they were being teased',
  lookedAway: 'You looked away when they needed help',
  goodTeammate: 'A good teammate on a school project',
  didNothing: 'You left them to do the project work',
  believedInMe: 'They believed in you',
  goodSport: 'You were gracious when they were picked ahead of you',
  playedTogether: 'Playing together as children',
  thereForMe: 'You were there for them in a hard time',
  notThere: 'You were not there when they needed you',
  helpedMe: 'You helped them out',
  visitedMe: 'You visited when they were unwell',
  stories: 'Their stories about growing up',
  confided: 'A heart-to-heart',
  gift: 'A gift from you',
  argument: 'An argument with you',
  becameFriends: 'Becoming friends',
  endedFriendship: 'The end of your friendship',
  turnedDown: 'They turned you down',
  firstDate: 'Your first date',
  engaged: 'Getting engaged',
  wedding: 'Your wedding',
  brokeUp: 'The break-up',
  greatDay: 'A great day together',
  apologised: 'Your apology, years later',
  reportedMe: 'You reported them to your manager',
  tookCredit: 'They took credit for your idea',
  askedForRaise: 'You asked them for a raise',
  lentMeMoney: 'You lent them money',
  refusedHelp: 'You refused to lend them money',
};

export function PersonScreen() {
  const { personId = '' } = useParams();
  const session = useGameStore((s) => s.session);
  const fetchPerson = useGameStore((s) => s.person);
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const [person, setPerson] = useState<PersonDetailView | null | undefined>(undefined);
  const tick = session?.view.tick;
  const version = session?.view;

  useEffect(() => {
    let cancelled = false;
    void fetchPerson(personId).then((p) => {
      if (!cancelled) setPerson(p);
    });
    return () => {
      cancelled = true;
    };
  }, [personId, fetchPerson, version]);

  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  const back = (
    <Link
      to={`${base}/social`}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4" /> Social
    </Link>
  );
  if (person === undefined)
    return (
      <p role="status" className="text-muted">
        Loading…
      </p>
    );
  if (person === null) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <p className="text-fg">This person is not part of your life.</p>
      </div>
    );
  }
  const memoryLine = (m: PersonDetailView['theirMemories'][number]) => (
    <li key={`${m.key}-${String(m.tick)}`} className="flex justify-between gap-2">
      <span className={m.valence < 0 ? 'text-danger' : 'text-fg'}>
        {MEMORY_TEXT[m.key] ?? m.key}
      </span>
      <span className="shrink-0 text-xs text-muted">
        {formatShortMonth(tickToMonth(view, m.tick))}
      </span>
    </li>
  );
  const available = person.interactions.filter((i) => i.available);
  // Partner-only and age-gated options are summarised rather than listed one by one.
  const unavailable = person.interactions.filter(
    (i) =>
      !i.available &&
      i.reason !== 'This is only for your partner.' &&
      i.reason !== 'You are too young for this.',
  );
  const nothingYet =
    available.length === 0
      ? (person.interactions.find((i) => i.reason === 'You have no free time left this month.')
          ?.reason ??
        (view.character.age.years < 3
          ? 'You are too young to do things with other people yet.'
          : 'Nothing is possible right now.'))
      : null;
  return (
    <div className="flex flex-col gap-4">
      {back}
      <PageHeader title={person.displayName} />
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar
            appearance={person.appearance}
            stage={person.stage}
            ageYears={person.age.years}
            className="size-28"
            label={`Portrait of ${person.displayName}`}
          />
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Relationship</dt>
            <dd className="text-fg">
              {person.relation ? t(`relation.${person.relation}`) : 'Acquaintance'}
            </dd>
            <dt className="text-muted">Age</dt>
            <dd className="text-fg">
              {person.alive ? person.age.years : `Died at ${String(person.age.years)}`}
            </dd>
            <dt className="text-muted">Lives in</dt>
            <dd className="text-fg">
              {person.location}, {countryName(person.countryCode)}
              {person.sameHousehold ? ' (with you)' : ''}
            </dd>
            {person.occupation && (
              <>
                <dt className="text-muted">Work</dt>
                <dd className="text-fg">
                  {person.occupation}, {person.employer}
                </dd>
              </>
            )}
            {person.retired && !person.occupation && (
              <>
                <dt className="text-muted">Work</dt>
                <dd className="text-fg">Retired</dd>
              </>
            )}
            {person.education && (
              <>
                <dt className="text-muted">Education</dt>
                <dd className="text-fg">
                  {person.education.includes(':')
                    ? person.education.split(':').join(' in ')
                    : person.education}
                </dd>
              </>
            )}
            {person.partnerName && (
              <>
                <dt className="text-muted">Partner</dt>
                <dd className="text-fg">
                  {person.partnerId && person.partnerId !== view.character.id ? (
                    <Link
                      to={`${base}/people/${person.partnerId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {person.partnerName}
                    </Link>
                  ) : (
                    person.partnerName
                  )}
                </dd>
              </>
            )}
            {person.childrenCount > 0 && (
              <>
                <dt className="text-muted">Children</dt>
                <dd className="text-fg">{person.childrenCount}</dd>
              </>
            )}
            {person.interests.length > 0 && (
              <>
                <dt className="text-muted">Interests</dt>
                <dd className="text-fg">
                  {person.interests.map((i) => t(`interest.${i}`)).join(', ')}
                </dd>
              </>
            )}
          </dl>
        </div>
      </Card>
      {person.alive && (
        <Card title="Your relationship">
          <StatBar
            label="Closeness"
            value={person.closeness === null ? 0 : person.closeness * 10}
          />
          <StatBar label="Trust" value={person.trust * 10} />
          <StatBar label="Respect" value={person.respect * 10} />
          <StatBar label="Conflict" value={person.conflict * 10} inverted />
          <StatBar label="Chemistry" value={person.chemistry * 10} />
          <p className="mt-2 text-xs text-muted">
            Chemistry comes from personalities and shared interests. Last time together:{' '}
            {formatShortMonth(tickToMonth(view, person.lastContactTick))}.
          </p>
        </Card>
      )}
      {person.alive && person.interactions.length > 0 && (
        <Card
          title="Do something together"
          description={
            tick !== undefined
              ? `Each takes free time. You have ${String(Math.max(0, view.time.totalHours - view.time.usedHours))} hours left this month.`
              : undefined
          }
        >
          {nothingYet && <p className="text-sm text-muted">{nothingYet}</p>}
          <ul className="flex flex-wrap gap-2">
            {available.map((i) => (
              <li key={i.id}>
                <Button
                  size="sm"
                  variant={
                    i.id === 'argue' || i.id === 'breakUp' || i.id === 'endFriendship'
                      ? 'ghost'
                      : 'secondary'
                  }
                  disabled={busy}
                  onClick={() =>
                    void send({ type: 'interact', personId: person.id, interactionId: i.id })
                  }
                >
                  {t(`interaction.${i.id}`)} · {i.hours} h
                </Button>
              </li>
            ))}
          </ul>
          {unavailable.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-primary">
                Why some options are not available
              </summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {unavailable.map((i) => (
                  <li key={i.id}>
                    {t(`interaction.${i.id}`)}: {i.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
      {view.pendingEvent && (
        <p className="text-sm text-muted">
          Make the waiting decision first to do things with people.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`What ${person.identity.firstName} remembers about you`}>
          {person.theirMemories.length === 0 ? (
            <p className="text-sm text-muted">Nothing that stands out yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">{person.theirMemories.map(memoryLine)}</ul>
          )}
        </Card>
        <Card title={`What you remember about ${person.identity.firstName}`}>
          {person.yourMemories.length === 0 ? (
            <p className="text-sm text-muted">Nothing that stands out yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">{person.yourMemories.map(memoryLine)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
