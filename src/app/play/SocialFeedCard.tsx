import { useState } from 'react';
import { Link } from 'react-router';
import { Heart, MessageCircle, Sparkles } from 'lucide-react';
import { Card } from '@app/components/ui/card';
import { Button } from '@app/components/ui/button';
import { Money } from '@app/components/Money';
import { t } from '@app/i18n/en';
import { useGameStore } from '@app/stores/gameStore';
import type { GameView } from '@engine/view';
import { tickToMonth } from './widgets';
import { formatShortMonth } from '@app/i18n/format';

const short = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

/**
 * Life tab: your social media as a feed (E100). Pick an account and a style to post; see
 * each post's likes, comments and a fan's reply, viral hits and brand deals. Accounts are
 * opened and closed on the Social media screen.
 */
export function SocialFeedCard({ view, base }: { view: GameView; base: string }) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const disabled = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  const m = view.media;
  const [picked, setPicked] = useState<string | null>(null);
  const profile = m.profiles.find((p) => p.id === picked) ?? m.profiles[0];
  if (!m.canJoin) return null;
  const total = m.profiles.reduce((s, p) => s + p.followers, 0);
  return (
    <Card
      title="Your socials"
      description={
        profile
          ? `${short(total)} followers across ${String(m.profiles.length)} account${m.profiles.length === 1 ? '' : 's'}. Post to grow; strong posts on trending topics can go viral.`
          : 'Become an influencer: open an account, pick a topic and start posting.'
      }
      headingLevel={2}
    >
      {!profile ? (
        <Link
          to={`${base}/media`}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Open your first account
        </Link>
      ) : (
        <div className="flex flex-col gap-3">
          {m.profiles.length > 1 && (
            <div role="group" aria-label="Accounts" className="flex flex-wrap gap-2">
              {m.profiles.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={p.id === profile.id ? 'primary' : 'secondary'}
                  aria-pressed={p.id === profile.id}
                  onClick={() => {
                    setPicked(p.id);
                  }}
                >
                  {p.platformName}
                </Button>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-border bg-surface-2/50 p-3">
            <p className="font-semibold text-fg">
              @{profile.handle}{' '}
              <span className="font-normal text-muted">on {profile.platformName}</span>
            </p>
            <p className="text-sm text-muted">
              {short(profile.followers)} followers · {profile.posts} posts · earned{' '}
              <Money minor={profile.earningsMinor} currency={view.finance.currency} />
              {profile.sponsor ? ` · sponsored by ${profile.sponsor.brand}` : ''}
            </p>
            {profile.offer && (
              <p className="mt-1 text-sm text-fg">
                {profile.offer.brand} wants to sponsor you: answer on the{' '}
                <Link
                  to={`${base}/media`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Social media
                </Link>{' '}
                page.
              </p>
            )}
            <p className="mt-2 text-sm font-semibold text-fg">New post</p>
            <div role="group" aria-label="Post style" className="mt-1 flex flex-wrap gap-2">
              {m.styles.map((style) => (
                <Button
                  key={style}
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => void send({ type: 'post', profileId: profile.id, style })}
                >
                  {t(`style.${style}`)}
                </Button>
              ))}
            </div>
          </div>
          {profile.feed.length === 0 ? (
            <p className="text-sm text-muted">No posts yet: pick a style above.</p>
          ) : (
            <ul aria-label={`Posts on ${profile.platformName}`} className="flex flex-col gap-2">
              {profile.feed.slice(0, 5).map((p, i) => (
                <li
                  key={`${String(p.tick)}-${String(i)}`}
                  className="rounded-2xl border border-border p-3 text-sm"
                >
                  <p className="text-fg">{p.caption}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Heart aria-hidden="true" className="size-4" /> {short(p.likes)} likes
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle aria-hidden="true" className="size-4" /> {short(p.comments)}{' '}
                      comments
                    </span>
                    {p.viral && (
                      <span className="inline-flex items-center gap-1 font-semibold text-fg">
                        <Sparkles aria-hidden="true" className="size-4" /> Viral
                      </span>
                    )}
                    <span>
                      {p.gain >= 0 ? '+' : ''}
                      {p.gain} followers · {formatShortMonth(tickToMonth(view, p.tick))}
                    </span>
                  </p>
                  <p className="mt-1 text-muted">“{p.topComment}”</p>
                </li>
              ))}
            </ul>
          )}
          <Link
            to={`${base}/media`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Manage accounts and brand deals
          </Link>
        </div>
      )}
    </Card>
  );
}
