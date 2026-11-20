import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Card } from '@app/components/ui/card';
import { useGameStore } from '@app/stores/gameStore';
import type { GameView } from '@engine/view';
import { ActionButton } from '../ActionButton';
import { tickToMonth } from '../widgets';
import { formatShortMonth } from '@app/i18n/format';

type Casework = NonNullable<GameView['work']['career']['casework']>;
type Action = 'examine' | 'clarify' | 'prepare';

/** Words for each profession's casework (the engine is shared). */
export const CASE_WORDS = {
  law: { section: 'Cases', board: 'Case board', one: 'case', party: 'Client' },
  media: { section: 'Stories', board: 'Story desk', one: 'story', party: 'Source' },
  medicine: { section: 'Patients', board: 'Patient queue', one: 'patient case', party: 'Patient' },
} as const;
const STATUS = {
  unreviewed: 'not yet examined',
  corroborated: 'holds up',
  contested: 'disputed',
} as const;

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  return { send, disabled: busy || pending };
}

/** Career, Cases: qualification and licensing, the case board, active work and the record. */
export function CaseworkSection({ view, work }: { view: GameView; work: Casework }) {
  const { send, disabled } = useAct();
  const words = CASE_WORDS[work.profession];
  const month = (tick: number) => formatShortMonth(tickToMonth(view, tick));
  const offers = work.cases.filter((k) => k.status === 'offer');
  const active = work.cases.filter((k) => k.status === 'active');
  return (
    <>
      <Card title="Practice" description={work.role ? `You work as: ${work.role}.` : undefined}>
        {work.block ? (
          <p className="text-sm text-fg">{work.block}</p>
        ) : (
          <p className="text-sm text-fg">
            {work.supervised
              ? `You may take routine ${words.one}s under supervision.`
              : `You may take on ${words.one}s.`}
          </p>
        )}
        {work.licensed !== null && (
          <p className="mt-1 text-sm text-muted">
            Licence: {work.licensed ? 'admitted to practise' : 'not yet admitted'}
          </p>
        )}
        {work.exam && work.licensed === false && (
          <div className="mt-3 flex flex-col gap-2">
            <StatBar
              label={`Supervised training (${String(work.exam.trainingDone)} of ${String(work.exam.trainingNeeded)} months)`}
              value={Math.min(
                1000,
                work.exam.trainingNeeded === 0
                  ? 1000
                  : Math.floor((work.exam.trainingDone * 1000) / work.exam.trainingNeeded),
              )}
            />
            <ActionButton
              size="sm"
              className="self-start"
              busy={disabled}
              reason={work.exam.reason}
              onAct={() => {
                void send({
                  type: 'takeLicenceExam',
                  profession: work.profession === 'medicine' ? 'medicine' : 'law',
                });
              }}
            >
              Take the licensing exam
            </ActionButton>
            <p className="text-xs text-muted">
              {work.exam.reason ?? 'Fee '}
              {!work.exam.reason && <Money minor={work.exam.feeMinor} currency={work.currency} />}
            </p>
          </div>
        )}
        <StatBar label={`${words.party} trust`} value={work.trust} />
      </Card>

      {active.map((k) => (
        <Card
          key={k.id}
          title={`Now: ${k.title}`}
          description={`${words.party}: ${k.party} · due ${month(k.deadlineTick)}${k.routine ? ' · routine' : ''}`}
        >
          <ul aria-label={`What you have on ${k.title}`} className="flex flex-col gap-1 text-sm">
            {k.items.map((i) => (
              <li key={i.label} className="flex justify-between gap-2">
                <span className="text-fg">{i.label}</span>
                <span
                  className={
                    i.status === 'corroborated'
                      ? 'text-success'
                      : i.status === 'contested'
                        ? 'text-danger'
                        : 'text-muted'
                  }
                >
                  {STATUS[i.status]}
                </span>
              </li>
            ))}
          </ul>
          <StatBar label="Preparation" value={k.prep * 10} />
          <StatBar label={`${words.party}'s trust in you`} value={k.trust * 10} />
          {work.actions && (
            <ul aria-label={`Work on ${k.title}`} className="mt-2 flex flex-col gap-2">
              {(['examine', 'clarify', 'prepare'] as const).map((a: Action) => (
                <li key={a} className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    busy={disabled}
                    reason={k.actionReasons[a]}
                    onAct={() => {
                      void send({ type: 'workOnCase', caseId: k.id, action: a });
                    }}
                  >
                    {work.actions?.[a]}
                  </ActionButton>
                  {k.actionReasons[a] && (
                    <span className="text-xs text-muted">{k.actionReasons[a]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm font-semibold text-fg">Resolve it</p>
          <p className="text-xs text-muted">
            Unexamined or disputed items, thin preparation and low trust all count against you.
            Riskier routes swing further either way.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {work.options.map((o) => (
              <ActionButton
                key={o.id}
                size="sm"
                variant={o.risky ? 'secondary' : 'primary'}
                busy={disabled}
                reason={work.block}
                onAct={() => {
                  void send({ type: 'resolveCase', caseId: k.id, optionId: o.id });
                }}
              >
                {o.label}
              </ActionButton>
            ))}
          </div>
        </Card>
      ))}

      <Card
        title={words.board}
        description="New work arrives each month and must be answered by the date shown."
      >
        {offers.length === 0 ? (
          <p className="text-sm text-muted">Nothing new right now.</p>
        ) : (
          <ul aria-label={words.board} className="divide-y divide-border text-sm">
            {offers.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 py-2">
                <p className="font-semibold text-fg">
                  {k.title}{' '}
                  <span className="font-normal text-muted">
                    ({k.routine ? 'routine' : 'complex'}, {k.items.length} items)
                  </span>
                </p>
                <p className="text-muted">
                  {words.party}: {k.party} · answer by {month(k.expiresTick)} · due{' '}
                  {month(k.deadlineTick)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    size="sm"
                    busy={disabled}
                    reason={k.takeReason}
                    onAct={() => {
                      void send({ type: 'takeCase', caseId: k.id });
                    }}
                  >
                    Take on {k.title}
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    busy={disabled}
                    reason={null}
                    onAct={() => {
                      void send({ type: 'declineCase', caseId: k.id });
                    }}
                  >
                    Decline
                  </ActionButton>
                  {k.takeReason && <span className="text-xs text-muted">{k.takeReason}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Career record">
        {work.record.length === 0 ? (
          <p className="text-sm text-muted">No completed {words.one}s yet.</p>
        ) : (
          <ul aria-label="Career record" className="divide-y divide-border text-sm">
            {work.record.map((r) => (
              <li key={`${r.title}-${String(r.tick)}`} className="py-2">
                <p className="font-semibold text-fg">
                  {r.title} <span className="font-normal text-muted">({month(r.tick)})</span>
                </p>
                <p className="text-muted">
                  {r.party} · {r.outcome} result
                  {r.unverified ? ' · resolved with unchecked or disputed items' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
