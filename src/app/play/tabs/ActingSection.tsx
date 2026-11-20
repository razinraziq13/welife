import { useId, useState } from 'react';
import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { AUDITION_APPROACHES, type AuditionApproach } from '@engine/state/schema';
import type { GameView } from '@engine/view';
import { ActionButton } from '../ActionButton';
import { tickToMonth } from '../widgets';

type Screen = NonNullable<GameView['work']['career']['screen']>;

const STAGE = {
  rehearsal: 'Rehearsals',
  filming: 'Filming',
  post: 'Post-production',
  renewal: 'Waiting on your renewal answer',
} as const;
const ACTION_LABEL = {
  studyScript: 'Study the script',
  rehearse: 'Rehearse',
  workWithCast: 'Work with your co-star',
  meetDirector: 'Meet the director',
  promote: 'Promote the release',
} as const;
const APPROACH_LABEL: Record<AuditionApproach, string> = {
  restrained: 'Restrained',
  energetic: 'Energetic',
  comedic: 'Comedic',
  character: 'Character-focused',
};
const quality = (n: number) => (n >= 75 ? 'strong' : n >= 50 ? 'decent' : 'weak');

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const blocked = useGameStore((s) =>
    s.session?.view.pendingEvent ? 'Make the waiting decision first.' : null,
  );
  return { send, disabled: busy || blocked !== null };
}

/** Career, Acting: overview, current production, casting board and filmography (E89). */
export function ActingSection({ view, screen }: { view: GameView; screen: Screen }) {
  return (
    <>
      <Overview view={view} screen={screen} />
      {screen.production && <ProductionCard screen={screen} />}
      {screen.isActor && <CastingBoard view={view} screen={screen} />}
      <FilmographyCard view={view} credits={screen.filmography} currency={screen.currency} />
    </>
  );
}

function Overview({ view, screen }: { view: GameView; screen: Screen }) {
  const { send, disabled } = useAct();
  const [leaving, setLeaving] = useState(false);
  return (
    <Card
      title="Acting career"
      description="Reputation is how the industry rates you as a professional; recognition is how widely known you are; critical standing is how critics rate your work."
    >
      <StatBar label="Industry reputation" value={view.work.career.reputation} />
      <StatBar label="Recognition" value={screen.recognition} />
      <StatBar label="Critical standing" value={screen.critics} />
      {screen.knownFor && (
        <p className="mt-2 text-sm text-fg">
          Casting knows you for {screen.knownFor}: those parts are easier to win, other genres
          harder (typecast).
        </p>
      )}
      {!screen.isActor && (
        <p className="mt-2 text-sm text-muted">
          To get casting calls, start the actor path in Career, Paths.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {screen.agent ? (
          <>
            <span className="text-fg">
              Agent: {screen.agent.name} ({screen.agent.commissionPct}% commission)
            </span>
            <ActionButton
              size="sm"
              variant="secondary"
              busy={disabled}
              reason={null}
              onAct={() => {
                setLeaving(true);
              }}
            >
              Leave your agent
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton
              size="sm"
              variant="secondary"
              busy={disabled}
              reason={screen.agentReason}
              onAct={() => {
                void send({ type: 'actingAgent', sign: true });
              }}
            >
              Approach an agent
            </ActionButton>
            <span className="text-xs text-muted">
              {screen.agentReason ??
                'An agent finds more castings and negotiates for a commission.'}
            </span>
          </>
        )}
      </div>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave your agent?"
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => send({ type: 'actingAgent', sign: false })}
      >
        You will see fewer castings and negotiate on your own.
      </ConfirmDialog>
    </Card>
  );
}

function ProductionCard({ screen }: { screen: Screen }) {
  const { send, disabled } = useAct();
  const [leaving, setLeaving] = useState(false);
  const p = screen.production;
  if (!p) return null;
  const cur = screen.currency;
  return (
    <Card
      title={`Now: ${p.title}`}
      description={`${p.format === 'tv' ? `TV, season ${String(p.season)}` : 'Film'} · ${p.genre} · ${p.studio}, directed by ${p.director}`}
    >
      <p className="text-sm text-fg">
        You play {p.character} ({p.prominence} role) opposite {p.castName || 'your co-star'}.
      </p>
      <p className="mt-1 text-sm text-muted">
        {STAGE[p.stage]}
        {p.monthsLeft > 0
          ? ` · ${String(p.monthsLeft)} month${p.monthsLeft === 1 ? '' : 's'} left`
          : ''}{' '}
        · paid so far <Money minor={p.earnedMinor} currency={cur} />
      </p>
      <div className="mt-2">
        <StatBar label="Preparation" value={p.prep * 10} />
        <StatBar label="Chemistry with your co-star" value={p.chemistry * 10} />
        <StatBar label="Rapport with the director" value={p.directorRapport * 10} />
      </div>
      {p.stage === 'renewal' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            size="sm"
            busy={disabled}
            reason={null}
            onAct={() => {
              void send({ type: 'answerRenewal', accept: true });
            }}
          >
            Sign for season {p.season + 1} (+10% pay)
          </ActionButton>
          <ActionButton
            size="sm"
            variant="secondary"
            busy={disabled}
            reason={null}
            onAct={() => {
              void send({ type: 'answerRenewal', accept: false });
            }}
          >
            Leave the show
          </ActionButton>
        </div>
      ) : (
        <ul aria-label="Production work" className="mt-3 flex flex-col gap-2">
          {p.actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <ActionButton
                size="sm"
                variant="secondary"
                busy={disabled}
                reason={a.reason}
                onAct={() => {
                  void send({ type: 'productionAction', action: a.id });
                }}
              >
                {ACTION_LABEL[a.id]}
              </ActionButton>
              {a.reason && <span className="text-xs text-muted">{a.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      {(p.stage === 'rehearsal' || p.stage === 'filming') && (
        <ActionButton
          size="sm"
          variant="ghost"
          className="mt-3"
          busy={disabled}
          reason={null}
          onAct={() => {
            setLeaving(true);
          }}
        >
          Leave the production
        </ActionButton>
      )}
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${p.title}?`}
        confirmLabel="Leave the production"
        tone="danger"
        onConfirm={() => send({ type: 'leaveProduction' })}
      >
        You give up the rest of the pay, your industry reputation drops, and the director will
        remember.
      </ConfirmDialog>
    </Card>
  );
}

function CastingBoard({ view, screen }: { view: GameView; screen: Screen }) {
  const { send, disabled } = useAct();
  const [format, setFormat] = useState<'all' | 'film' | 'tv'>('all');
  const [approach, setApproach] = useState<Record<string, AuditionApproach>>({});
  const id = useId();
  const cur = screen.currency;
  const listings = screen.board.filter((l) => format === 'all' || l.format === format);
  return (
    <Card
      title="Casting board"
      description={`New castings arrive each month. Auditions left this month: ${String(screen.auditionsLeft)}.`}
    >
      <ChoiceGroup
        legend="Show"
        name="casting-format"
        value={format}
        onChange={setFormat}
        options={[
          { value: 'all', label: 'All' },
          { value: 'film', label: 'Film' },
          { value: 'tv', label: 'TV' },
        ]}
      />
      {listings.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No castings right now. New ones arrive next month.
        </p>
      ) : (
        <ul aria-label="Castings" className="mt-3 divide-y divide-border">
          {listings.map((l) => {
            const chosen = approach[l.id] ?? 'character';
            return (
              <li key={l.id} className="flex flex-col gap-2 py-3">
                <div>
                  <h3 className="font-semibold text-fg">
                    {l.title}{' '}
                    <span className="text-sm font-normal text-muted">
                      ({l.format === 'tv' ? 'TV series' : 'film'}, {l.genre})
                    </span>
                  </h3>
                  <p className="text-sm text-fg">
                    {l.character} · {l.prominence} role
                    {l.directorId ? ' · the director asked for you' : ''}
                  </p>
                  <p className="text-sm text-muted">
                    {l.studio} ({l.budget === 'studio' ? 'studio budget' : 'independent'}), directed
                    by {l.director} · {quality(l.script)} script · {l.months} month
                    {l.months === 1 ? '' : 's'} of filming ·{' '}
                    <Money minor={l.payMinor} currency={cur} />
                    {l.format === 'tv' ? ' a month' : ''} · closes{' '}
                    {formatShortMonth(tickToMonth(view, l.deadlineTick))}
                  </p>
                  {l.feedback && <p className="text-sm text-fg">{t(`out.acting.${l.feedback}`)}</p>}
                </div>
                {l.status === 'open' && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${id}-${l.id}`} className="text-xs text-muted">
                        Audition approach
                      </label>
                      <select
                        id={`${id}-${l.id}`}
                        value={chosen}
                        onChange={(e) => {
                          setApproach({ ...approach, [l.id]: e.target.value as AuditionApproach });
                        }}
                        className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
                      >
                        {AUDITION_APPROACHES.map((a) => (
                          <option key={a} value={a}>
                            {APPROACH_LABEL[a]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ActionButton
                      size="sm"
                      busy={disabled}
                      reason={l.auditionReason}
                      onAct={() => {
                        void send({ type: 'audition', listingId: l.id, approach: chosen });
                      }}
                    >
                      Audition for {l.title}
                    </ActionButton>
                    {l.auditionReason && (
                      <span className="text-xs text-muted">{l.auditionReason}</span>
                    )}
                  </div>
                )}
                {l.status === 'offered' && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      size="sm"
                      busy={disabled}
                      reason={l.acceptReason}
                      onAct={() => {
                        void send({ type: 'answerCasting', listingId: l.id, response: 'accept' });
                      }}
                    >
                      Accept {l.title}
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      busy={disabled}
                      reason={l.negotiated ? 'You have already negotiated this offer.' : null}
                      onAct={() => {
                        void send({
                          type: 'answerCasting',
                          listingId: l.id,
                          response: 'negotiate',
                        });
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
                        void send({ type: 'answerCasting', listingId: l.id, response: 'decline' });
                      }}
                    >
                      Decline
                    </ActionButton>
                    {l.acceptReason && <span className="text-xs text-muted">{l.acceptReason}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Every finished credit: shown in Acting and on a person's profile, even after death. */
export function FilmographyCard({
  view,
  credits,
  currency: cur,
  title = 'Filmography and awards',
}: {
  view: GameView;
  credits: Screen['filmography'];
  currency: Screen['currency'];
  title?: string;
}) {
  return (
    <Card title={title}>
      {credits.length === 0 ? (
        <p className="text-sm text-muted">No screen credits yet.</p>
      ) : (
        <ul aria-label="Filmography" className="divide-y divide-border text-sm">
          {credits.map((f) => (
            <li key={`${f.title}-${String(f.startTick)}`} className="py-2">
              <p className="font-semibold text-fg">
                {f.title} ({tickToMonth(view, f.endTick).year})
                {f.award && (
                  <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs">
                    Silver Reel {f.award === 'won' ? 'winner' : 'nominee'}
                  </span>
                )}
              </p>
              <p className="text-muted">
                {f.format === 'tv'
                  ? `TV, ${String(f.seasons)} season${f.seasons === 1 ? '' : 's'}`
                  : 'Film'}{' '}
                · {f.genre} · {f.character} ({f.prominence}) · critics {f.critics}, audiences{' '}
                {f.audience} · earned <Money minor={f.earnedMinor} currency={cur} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
