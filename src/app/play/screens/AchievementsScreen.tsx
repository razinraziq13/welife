import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { BiographyView } from '@engine/viewLegacy';
import { PageHeader } from '@app/components/PageHeader';
import { Money } from '@app/components/Money';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { biographyText, formatMonth, formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

/** Achievements and Biography (spec §3.18). */

export function AchievementsScreen() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const a = view.achievements;
  const base = `/play/${session.saveId}`;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Achievements and biography"
        description={`${String(a.unlocked.length)} of ${String(a.total)} achievements on this timeline.`}
      />
      <Card title="Life stories">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {view.legacy.lineage.map((l) => (
            <li key={`${l.characterId}-${String(l.fromTick)}`}>
              <Link className="underline" to={`${base}/biography/${l.characterId}`}>
                {l.name}
              </Link>{' '}
              <span className="text-muted">(generation {l.generation})</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Achievements from every life and timeline on this device are in the{' '}
          <Link className="underline" to="/gallery">
            achievement gallery
          </Link>
          .
        </p>
      </Card>
      {a.categories.map((category) => {
        const got = a.unlocked.filter((x) => x.category === category);
        const locked = a.locked.filter((x) => x.category === category);
        if (got.length + locked.length === 0) return null;
        return (
          <Card
            key={category}
            title={`${t(`achievementCategory.${category}`)} (${String(got.length)}/${String(got.length + locked.length)})`}
          >
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {got.map((x) => (
                <li key={x.id} className="rounded-xl border border-border bg-surface-2 p-2">
                  <p className="font-medium text-fg">✓ {x.title}</p>
                  <p className="text-muted">{x.description}</p>
                  <p className="text-xs text-muted">
                    {x.characterName}, {formatShortMonth(tickToMonth(view, x.tick))}, generation{' '}
                    {x.generation}
                  </p>
                </li>
              ))}
              {locked.map((x) => (
                <li key={x.id} className="rounded-xl border border-dashed border-border p-2">
                  <p className="font-medium text-muted">{x.title}</p>
                  <p className="text-muted">{x.description}</p>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

export function BiographyScreen() {
  const { personId = '' } = useParams();
  const session = useGameStore((s) => s.session);
  const fetchBiography = useGameStore((s) => s.biography);
  const [bio, setBio] = useState<BiographyView | null>(null);
  const view = session?.view;
  useEffect(() => {
    let cancelled = false;
    void fetchBiography(personId).then((result) => {
      if (!cancelled) setBio(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchBiography, personId, view]);
  if (!session || !view) return null;
  if (!bio) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Biography" description="Loading…" />
      </div>
    );
  }
  const s = bio.summary;
  return (
    <div className="flex flex-col gap-4">
      <Link
        to={`/play/${session.saveId}/achievements`}
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        ← Achievements and biography
      </Link>
      <PageHeader
        title={bio.name}
        description={`Born ${formatMonth(bio.born)}${bio.died ? `, died ${formatMonth(bio.died)} aged ${String(bio.ageYears)}` : `, aged ${String(bio.ageYears)}`}${bio.generation ? ` · generation ${String(bio.generation)}` : ''}`}
      />
      <Card title="At a glance">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Jobs</dt>
            <dd className="text-right">
              {s.jobs.length === 0
                ? 'None'
                : s.jobs
                    .map((j) => j.title)
                    .slice(-3)
                    .join(', ')}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Partners</dt>
            <dd className="text-right">{s.partners.join(', ') || 'None'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Children</dt>
            <dd className="text-right">{s.children.join(', ') || 'None'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Countries lived in</dt>
            <dd className="text-right">{s.countries.join(', ') || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Public offices</dt>
            <dd className="text-right">{s.offices.join(', ') || 'None'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Companies</dt>
            <dd className="text-right">{s.companies.join(', ') || 'None'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Achievements</dt>
            <dd>{s.achievements}</dd>
          </div>
          {s.peakNetWorthMinor !== null && s.currency && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Peak wealth while played</dt>
              <dd>
                <Money minor={s.peakNetWorthMinor} currency={s.currency} />
              </dd>
            </div>
          )}
        </dl>
      </Card>
      {bio.chapters.length === 0 ? (
        <Card title="Life story">
          <p className="text-sm text-muted">No recorded moments yet.</p>
        </Card>
      ) : (
        bio.chapters.map((ch) => (
          <Card key={ch.title} title={ch.title}>
            <ol className="flex flex-col gap-1 text-sm">
              {ch.entries.map((e, i) => (
                <li key={`${String(e.tick)}-${String(i)}`} className="flex gap-3">
                  <span className="w-20 shrink-0 text-muted">
                    {formatShortMonth(tickToMonth(view, e.tick))}
                  </span>
                  <span className="text-fg">
                    {biographyText({
                      id: '',
                      tick: e.tick,
                      characterId: bio.personId,
                      category: e.category as 'life',
                      key: e.key,
                      params: e.params,
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ))
      )}
    </div>
  );
}
