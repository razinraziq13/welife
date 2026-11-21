import { useId, useState } from 'react';
import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Card } from '@app/components/ui/card';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { Switch } from '@app/components/ui/switch';
import { formatMoney } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import type { PROMO_LEVELS, STUDIOS } from '@engine/state/schema';
import { MUSIC_GENRES, RELEASE_TYPES, SONG_MOODS } from '@engine/state/schema';
import type { GameView } from '@engine/view';
import { ActionButton } from '../ActionButton';

type Music = NonNullable<GameView['work']['career']['music']>;
type Studio = (typeof STUDIOS)[number];
type Kind = (typeof RELEASE_TYPES)[number];
type Promo = (typeof PROMO_LEVELS)[number];

const GENRE: Record<(typeof MUSIC_GENRES)[number], string> = {
  pop: 'Pop',
  rock: 'Rock',
  hiphop: 'Hip-hop',
  jazz: 'Jazz',
  electronic: 'Electronic',
  folk: 'Folk',
  classical: 'Classical',
  country: 'Country',
  rnb: 'R&B',
};
const KIND: Record<Kind, string> = { single: 'Single', ep: 'EP', album: 'Album' };
const STUDIO_LABEL: Record<Studio, string> = {
  home: 'Home recording',
  independent: 'Independent studio',
  professional: 'Professional studio',
};
const SELECT = 'h-11 rounded-xl border border-border bg-surface px-3 text-fg';
const quality = (n: number) => (n >= 75 ? 'strong' : n >= 50 ? 'decent' : 'rough');

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  return { send, disabled: busy || pending };
}

/** Career, Music: songwriting, studio, releases, label, live shows and the chart (E90). */
export function MusicSection({ music }: { music: Music }) {
  return (
    <>
      <Overview music={music} />
      {music.isMusician && <Songwriting music={music} />}
      {music.isMusician && <Releases music={music} />}
      {music.isMusician && <Live music={music} />}
      {music.chart.length > 0 && <Chart music={music} />}
    </>
  );
}

function Overview({ music }: { music: Music }) {
  const { send, disabled } = useAct();
  const cur = music.currency;
  const offer = music.labelOffer;
  return (
    <Card
      title="Music career"
      description="Fans follow your releases; recognition is how widely known you are; critics rate your catalog."
    >
      <p className="text-sm text-fg">
        <span className="font-semibold">{music.fans.toLocaleString()}</span> fans ·{' '}
        {GENRE[music.trend]} is in fashion this year
      </p>
      <StatBar label="Recognition" value={music.recognition} />
      <StatBar label="Critical reputation" value={music.critics} />
      {!music.isMusician && (
        <p className="mt-2 text-sm text-muted">
          To write and release music, start the musician path in Career, Paths.
        </p>
      )}
      {music.label ? (
        <p className="mt-2 text-sm text-fg">
          Signed to {music.label.name}: you keep {music.label.artistPct}% of royalties, owe{' '}
          {music.label.releasesOwed} more release{music.label.releasesOwed === 1 ? '' : 's'}, and{' '}
          <Money minor={music.label.unrecoupedMinor} currency={cur} /> is still to be recouped
          before royalties reach you.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Independent: you keep all your royalties but pay for studio time and promotion yourself.
        </p>
      )}
      {offer && (
        <div className="mt-3 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold text-fg">{offer.name} wants to sign you</p>
          <p className="text-fg">
            Advance <Money minor={offer.advanceMinor} currency={cur} /> now · you keep{' '}
            {offer.artistPct}% of royalties · {offer.releasesOwed} releases · exclusive for up to 3
            years. The label pays studio and promotion, but the advance and those costs are recouped
            from your share before you are paid again.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton
              size="sm"
              busy={disabled}
              reason={null}
              onAct={() => {
                void send({ type: 'answerLabel', response: 'accept' });
              }}
            >
              Sign with {offer.name}
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              busy={disabled}
              reason={offer.negotiated ? 'You have already negotiated this offer.' : null}
              onAct={() => {
                void send({ type: 'answerLabel', response: 'negotiate' });
              }}
            >
              Negotiate
            </ActionButton>
            <ActionButton
              size="sm"
              variant="ghost"
              busy={disabled}
              reason={null}
              onAct={() => {
                void send({ type: 'answerLabel', response: 'decline' });
              }}
            >
              Decline
            </ActionButton>
          </div>
        </div>
      )}
      {music.isMusician && (
        <div className="mt-3">
          <Switch
            label="Run routine music work for me"
            description="Each month: a writing session, home recordings, independent (or label) singles and the best show you can book."
            checked={music.autopilot}
            disabled={disabled}
            onChange={(value) => {
              void send({ type: 'setMusicAutopilot', value });
            }}
          />
        </div>
      )}
    </Card>
  );
}

function Songwriting({ music }: { music: Music }) {
  const { send, disabled } = useAct();
  const id = useId();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState<(typeof MUSIC_GENRES)[number]>('pop');
  const [mood, setMood] = useState<(typeof SONG_MOODS)[number]>('upbeat');
  const [coWrite, setCoWrite] = useState(false);
  const [studio, setStudio] = useState<Record<string, Studio>>({});
  const [dropping, setDropping] = useState<string | null>(null);
  const cur = music.currency;
  return (
    <Card
      title="Songwriting and studio"
      description={`Songs take several sessions to write. Writing sessions left this month: ${String(music.writesLeft)}.`}
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void send({ type: 'startSong', title: title.trim(), genre, mood, coWrite }).then(() => {
            setTitle('');
          });
        }}
      >
        <label htmlFor={`${id}-title`} className="text-sm font-semibold text-fg">
          New song title
        </label>
        <input
          id={`${id}-title`}
          value={title}
          maxLength={60}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          className={SELECT}
        />
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-genre`} className="text-xs text-muted">
              Genre
            </label>
            <select
              id={`${id}-genre`}
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value as typeof genre);
              }}
              className={SELECT}
            >
              {MUSIC_GENRES.map((g) => (
                <option key={g} value={g}>
                  {GENRE[g]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-mood`} className="text-xs text-muted">
              Mood
            </label>
            <select
              id={`${id}-mood`}
              value={mood}
              onChange={(e) => {
                setMood(e.target.value as typeof mood);
              }}
              className={SELECT}
            >
              {SONG_MOODS.map((m) => (
                <option key={m} value={m}>
                  {m[0]?.toUpperCase()}
                  {m.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Switch
          label="Co-write with another musician"
          description="Faster and often better, but they get half the songwriting credit."
          checked={coWrite}
          onChange={setCoWrite}
        />
        <ActionButton
          type="submit"
          size="sm"
          className="self-start"
          busy={disabled}
          reason={music.newSongReason ?? (title.trim() ? null : 'Give the song a title first.')}
          onAct={() => undefined}
        >
          Start writing
        </ActionButton>
      </form>
      {music.songs.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No songs yet: begin by writing one.</p>
      ) : (
        <ul aria-label="Your songs" className="mt-3 divide-y divide-border">
          {music.songs.map((s) => {
            const chosen = studio[s.id] ?? 'home';
            const option = s.record.find((r) => r.studio === chosen);
            return (
              <li key={s.id} className="flex flex-col gap-2 py-3 text-sm">
                <p className="font-semibold text-fg">
                  {s.title}{' '}
                  <span className="font-normal text-muted">
                    ({GENRE[s.genre]}, {s.mood}
                    {s.coWriter ? `, with ${s.coWriter}` : ''})
                  </span>
                </p>
                {s.status === 'draft' && s.progress < 100 && (
                  <>
                    <StatBar label="Written" value={s.progress * 10} compact />
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        busy={disabled}
                        reason={s.writeReason}
                        onAct={() => {
                          void send({ type: 'writeSong', songId: s.id });
                        }}
                      >
                        Write: {s.title}
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        busy={disabled}
                        reason={null}
                        onAct={() => {
                          setDropping(s.id);
                        }}
                      >
                        Abandon
                      </ActionButton>
                      {s.writeReason && <span className="text-xs text-muted">{s.writeReason}</span>}
                    </div>
                  </>
                )}
                {s.status === 'draft' && s.progress >= 100 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="w-full text-muted">Written · {quality(s.quality)} song</span>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${id}-${s.id}`} className="text-xs text-muted">
                        Studio
                      </label>
                      <select
                        id={`${id}-${s.id}`}
                        value={chosen}
                        onChange={(e) => {
                          setStudio({ ...studio, [s.id]: e.target.value as Studio });
                        }}
                        className={SELECT}
                      >
                        {s.record.map((r) => (
                          <option key={r.studio} value={r.studio}>
                            {STUDIO_LABEL[r.studio]} ({formatMoney(r.costMinor, cur)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <ActionButton
                      size="sm"
                      busy={disabled}
                      reason={option?.reason ?? null}
                      onAct={() => {
                        void send({ type: 'recordSong', songId: s.id, studio: chosen });
                      }}
                    >
                      Record {s.title}
                    </ActionButton>
                    {option?.reason && <span className="text-xs text-muted">{option.reason}</span>}
                  </div>
                )}
                {s.status === 'recording' && (
                  <p className="text-muted">In the studio: ready next month.</p>
                )}
                {s.status === 'recorded' && (
                  <p className="text-muted">
                    Recorded · {quality(s.quality)} song, {quality(s.production)} production
                  </p>
                )}
                {s.status === 'released' && (
                  <p className="text-muted">
                    Released{' '}
                    {music.releases.find((r) => r.songIds.includes(s.id))?.title
                      ? `on ${music.releases.find((r) => r.songIds.includes(s.id))?.title ?? ''}`
                      : ''}{' '}
                    · {quality(s.quality)} song, {quality(s.production)} production
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={dropping !== null}
        onOpenChange={(open) => {
          if (!open) setDropping(null);
        }}
        title="Abandon this song?"
        confirmLabel="Abandon"
        tone="danger"
        onConfirm={() => send({ type: 'abandonSong', songId: dropping ?? '' })}
      >
        The draft and the work you put in are gone for good.
      </ConfirmDialog>
    </Card>
  );
}

function Releases({ music }: { music: Music }) {
  const { send, disabled } = useAct();
  const id = useId();
  const [kind, setKind] = useState<Kind>('single');
  const [title, setTitle] = useState('');
  const [promo, setPromo] = useState<Promo>('none');
  const viaLabel = music.label !== null;
  const cur = music.currency;
  const option = music.releaseOptions.find((o) => o.type === kind);
  const reasons = music.releaseReasons.find((r) => r.type === kind);
  const reason = viaLabel ? (reasons?.label ?? null) : (reasons?.independent ?? null);
  return (
    <Card
      title="Releases"
      description="Singles are quick and cheap; EPs need 3 songs; albums need 6 but last longer and can win awards. Results are never guaranteed."
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-kind`} className="text-xs text-muted">
            Release type
          </label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
            }}
            className={SELECT}
          >
            {RELEASE_TYPES.map((k) => (
              <option key={k} value={k}>
                {KIND[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-title`} className="text-xs text-muted">
            Release title (optional)
          </label>
          <input
            id={`${id}-title`}
            value={title}
            maxLength={60}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            className={SELECT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-promo`} className="text-xs text-muted">
            Promotion
          </label>
          <select
            id={`${id}-promo`}
            value={promo}
            onChange={(e) => {
              setPromo(e.target.value as Promo);
            }}
            className={SELECT}
          >
            <option value="none">None</option>
            <option value="small">Small ({formatMoney(music.promoCosts.small, cur)})</option>
            <option value="big">Big ({formatMoney(music.promoCosts.big, cur)})</option>
          </select>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        Tracklist:{' '}
        {option?.tracklist.length ? option.tracklist.join(', ') : 'no recorded songs yet'} (
        {option?.tracklist.length ?? 0} of {option?.songs ?? 1} needed) ·{' '}
        {viaLabel ? `through ${music.label?.name ?? ''}` : 'independent'}
      </p>
      <ActionButton
        size="sm"
        className="mt-2"
        busy={disabled}
        reason={reason}
        onAct={() => {
          void send({ type: 'releaseMusic', title: title.trim(), kind, viaLabel, promo }).then(
            () => {
              setTitle('');
            },
          );
        }}
      >
        Release the {KIND[kind].toLowerCase()}
      </ActionButton>
      {reason && <p className="mt-1 text-xs text-muted">{reason}</p>}
      {music.releases.length > 0 && (
        <ul aria-label="Your releases" className="mt-3 divide-y divide-border text-sm">
          {music.releases.map((r) => (
            <li key={r.id} className="py-2">
              <p className="font-semibold text-fg">
                {r.title}{' '}
                <span className="font-normal text-muted">
                  ({KIND[r.type]}, {r.label ?? 'independent'})
                </span>
                {r.award && (
                  <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs">
                    Golden Note {r.award === 'won' ? 'winner' : 'nominee'}
                  </span>
                )}
              </p>
              <p className="text-muted">
                {r.peakRank > 0 ? `Chart peak #${String(r.peakRank)}` : 'Not charted'} · critics{' '}
                {r.critics} ·{' '}
                {r.momentum > 0 ? `still selling (${String(r.momentum)})` : 'run over'} · earned{' '}
                <Money minor={r.grossMinor} currency={cur} />, you took home{' '}
                <Money minor={r.paidMinor} currency={cur} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Live({ music }: { music: Music }) {
  const { send, disabled } = useAct();
  const cur = music.currency;
  return (
    <Card
      title="Live shows"
      description={`Bigger venues need a bigger following and a longer setlist (you have ${String(music.setlist)} recorded song${music.setlist === 1 ? '' : 's'}). One show a month.`}
    >
      <StatBar label="Show readiness" value={music.prep * 10} />
      <ActionButton
        size="sm"
        variant="secondary"
        className="mt-2"
        busy={disabled}
        reason={music.rehearseReason}
        onAct={() => {
          void send({ type: 'rehearseLive' });
        }}
      >
        Rehearse the set
      </ActionButton>
      {music.venues.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No bookings this month. New ones arrive monthly.</p>
      ) : (
        <ul aria-label="Bookings" className="mt-3 divide-y divide-border text-sm">
          {music.venues.map((v) => (
            <li key={v.id} className="flex flex-col gap-1 py-2">
              <p className="font-semibold text-fg">
                {v.venue} <span className="font-normal text-muted">({v.kind})</span>
              </p>
              <p className="text-muted">
                Up to {v.capacity.toLocaleString()} people at{' '}
                <Money minor={v.ticketMinor} currency={cur} /> a ticket · costs{' '}
                <Money minor={v.costMinor} currency={cur} /> · needs {v.minSongs} song
                {v.minSongs === 1 ? '' : 's'}
                {v.minFans > 0 ? ` and ${v.minFans.toLocaleString()} fans` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  size="sm"
                  busy={disabled}
                  reason={v.reason}
                  onAct={() => {
                    void send({ type: 'playShow', venueId: v.id });
                  }}
                >
                  Play {v.venue}
                </ActionButton>
                {v.reason && <span className="text-xs text-muted">{v.reason}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Chart({ music }: { music: Music }) {
  return (
    <Card title="This month's chart" description="Fictional artists compete with your releases.">
      <ol aria-label="Chart" className="flex flex-col gap-1 text-sm">
        {music.chart.map((e, i) => (
          <li
            key={`${e.artist}-${e.title}`}
            className={
              e.player ? 'rounded-lg bg-primary-soft px-2 font-semibold text-fg' : 'px-2 text-fg'
            }
          >
            {i + 1}. {e.title} <span className="text-muted">· {e.artist}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
