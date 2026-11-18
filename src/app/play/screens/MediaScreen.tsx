import { useId, useState } from 'react';
import type { GameView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { t } from '@app/i18n/en';
import { formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

/** Social Media Studio (spec §3.16): fictional platforms, posts, followers, sponsorships. */

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  return { send, disabled: busy || pending || !alive };
}

function NewAccount({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const m = view.media;
  const free = m.platforms.filter((p) => !m.profiles.some((x) => x.platformId === p.id));
  const [platform, setPlatform] = useState(free[0]?.id ?? '');
  const [niche, setNiche] = useState(m.niches[0]?.id ?? '');
  const [handle, setHandle] = useState(
    view.character.identity.firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'me',
  );
  const id = useId();
  if (free.length === 0) return null;
  const chosen = free.find((p) => p.id === platform) ?? free[0];
  return (
    <Card
      title="Open an account"
      description="Platforms are fictional. Each post takes time; the same post repeated in a month reaches fewer people."
    >
      {!m.canJoin ? (
        <p className="text-sm text-muted">{m.reason}</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (chosen) void send({ type: 'createProfile', platformId: chosen.id, niche, handle });
          }}
        >
          <div>
            <label htmlFor={`${id}-p`} className="text-sm font-medium text-fg">
              Platform
            </label>
            <select
              id={`${id}-p`}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg"
              value={chosen?.id ?? ''}
              onChange={(e) => {
                setPlatform(e.target.value);
              }}
            >
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}: {p.format}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-n`} className="text-sm font-medium text-fg">
              Topic
            </label>
            <select
              id={`${id}-n`}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg"
              value={niche}
              onChange={(e) => {
                setNiche(e.target.value);
              }}
            >
              {m.niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} (
                  {n.trendBp >= 11_000 ? 'trending' : n.trendBp <= 9_000 ? 'quiet' : 'steady'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-h`} className="text-sm font-medium text-fg">
              Handle
            </label>
            <input
              id={`${id}-h`}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg"
              value={handle}
              maxLength={30}
              onChange={(e) => {
                setHandle(e.target.value);
              }}
            />
          </div>
          <Button type="submit" disabled={disabled}>
            Create account
          </Button>
        </form>
      )}
    </Card>
  );
}

export function MediaScreen() {
  const view = useGameStore((s) => s.session?.view ?? null);
  const { send, disabled } = useAct();
  if (!view) return null;
  const m = view.media;
  const cur = view.country.currency;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Social media"
        description="Build an audience, earn from it, and keep its trust."
      />
      {m.profiles.map((p) => {
        const platform = m.platforms.find((x) => x.id === p.platformId);
        const niche = m.niches.find((n) => n.id === p.niche);
        return (
          <Card
            key={p.id}
            title={`@${p.handle} on ${p.platformName}`}
            description={`${niche?.name ?? p.niche} · ${String(p.posts)} posts`}
          >
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Followers</dt>
                <dd>{p.followers.toLocaleString('en-GB')}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Engagement</dt>
                <dd>{(p.engagementBp / 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Earned so far</dt>
                <dd>
                  <Money minor={p.earningsMinor} currency={cur} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Last post</dt>
                <dd>
                  {p.lastPostTick === null
                    ? 'Never'
                    : formatShortMonth(tickToMonth(view, p.lastPostTick))}
                </dd>
              </div>
            </dl>
            <div className="mt-2">
              <StatBar label="Audience trust" value={p.trust} />
            </div>
            <p className="mt-2 text-xs text-muted">
              Ad income starts at {platform?.monetiseAt.toLocaleString('en-GB')} followers. Posting
              takes {platform?.hours} hours.
            </p>
            {p.sponsor && (
              <p className="mt-2 text-sm text-fg">
                Sponsored by {p.sponsor.brand}:{' '}
                <Money minor={p.sponsor.monthlyMinor} currency={cur} /> a month until{' '}
                {formatShortMonth(tickToMonth(view, p.sponsor.untilTick))}.
              </p>
            )}
            {p.offer && (
              <div className="mt-2 rounded-xl border border-border p-3 text-sm text-fg">
                <p>
                  {p.offer.brand} offers <Money minor={p.offer.monthlyMinor} currency={cur} /> a
                  month for {p.offer.months} months.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'answerSponsor', profileId: p.id, accept: true })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'answerSponsor', profileId: p.id, accept: false })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </div>
            )}
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-fg">Post something</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.styles.map((style) => (
                  <Button
                    key={style}
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() =>
                      void send({ type: 'post', profileId: p.id, style: style as 'casual' })
                    }
                  >
                    {t(`style.${style}`)}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Controversial posts reach further but can backfire.
              </p>
            </fieldset>
            <Button
              className="mt-3"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => void send({ type: 'closeProfile', profileId: p.id })}
            >
              Close this account
            </Button>
          </Card>
        );
      })}
      <NewAccount view={view} />
      <Card title="Trends" description="What audiences want this month (simulated).">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {m.niches.map((n) => (
            <li key={n.id} className="flex justify-between gap-2 text-fg">
              <span>{n.name}</span>
              <span className="text-muted">
                {n.trendBp >= 11_000 ? 'Trending' : n.trendBp <= 9_000 ? 'Quiet' : 'Steady'} (
                {Math.round(n.trendBp / 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
