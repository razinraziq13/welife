import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { Switch } from '@app/components/ui/switch';
import { useGameStore } from '@app/stores/gameStore';
import type { GameView } from '@engine/view';
import { ActionButton } from '../ActionButton';

type SportView = GameView['work']['career']['sport'];
const NAME = { football: 'Football', basketball: 'Basketball', tennis: 'Tennis' } as const;
const HOW = {
  football: 'Eight-club league; a win is 3 points, a draw 1. Join a club through a trial.',
  basketball: 'Eight-club league with no draws; the top four play off for the title.',
  tennis: 'No club: a tournament every month, prize money by round, and a world ranking.',
} as const;
const TRAINING = {
  technical: 'Technical session (fitness)',
  tactical: 'Tactical study (form)',
  recovery: 'Rest and recovery (readiness)',
} as const;

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  return { send, disabled: busy || pending };
}

/** Career, Athlete: choose a sport, trial for a club, train, and follow the season (E98). */
export function SportSection({ sport }: { sport: SportView }) {
  const { send, disabled } = useAct();
  const s = sport.state;
  const cur = sport.currency;
  return (
    <>
      <Card
        title={s ? `Athlete: ${NAME[s.sport]}` : 'Become an athlete'}
        description="Pick a sport. Each competes differently; your fitness skill, form and readiness decide how you play and get picked."
      >
        <ul aria-label="Sports" className="flex flex-col gap-2">
          {sport.choose.map((o) => (
            <li key={o.sport} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  size="sm"
                  variant={s?.sport === o.sport ? 'primary' : 'secondary'}
                  busy={disabled}
                  reason={o.reason}
                  onAct={() => {
                    void send({ type: 'chooseSport', sport: o.sport });
                  }}
                >
                  {s?.sport === o.sport ? `Playing ${NAME[o.sport]}` : `Choose ${NAME[o.sport]}`}
                </ActionButton>
                {o.reason && s?.sport !== o.sport && (
                  <span className="text-xs text-muted">{o.reason}</span>
                )}
              </div>
              <p className="text-xs text-muted">{HOW[o.sport]}</p>
            </li>
          ))}
        </ul>
      </Card>

      {s && (
        <Card
          title={s.club ?? (s.sport === 'tennis' ? 'Tennis tour' : 'No club yet')}
          description={
            s.sport === 'tennis'
              ? `World ranking #${String(s.rank)} (${String(s.rankingPoints)} points)`
              : s.club
                ? `Role: ${s.role} · contract: ${String(s.contractMonthsLeft ?? 0)} months left · season month ${String(s.seasonMonth + 1)} of 8`
                : 'Trial with a club to sign a contract.'
          }
        >
          {s.lastResult && <p className="text-sm text-fg">{s.lastResult}</p>}
          {s.salaryMinor > 0n && (
            <p className="mt-1 text-sm text-muted">
              Pay: <Money minor={s.salaryMinor} currency={cur} /> a month
              {s.sport === 'tennis' ? ' (sponsorship), plus prize money' : ''}
            </p>
          )}
          <StatBar label="Form" value={s.form * 10} />
          <StatBar label="Readiness" value={s.readiness * 10} />
          {s.sport !== 'tennis' && !s.club && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ActionButton
                size="sm"
                busy={disabled}
                reason={s.trialReason}
                onAct={() => {
                  void send({ type: 'sportTrial' });
                }}
              >
                Go to a club trial
              </ActionButton>
              {s.trialReason && <span className="text-xs text-muted">{s.trialReason}</span>}
            </div>
          )}
          <ul aria-label="Training" className="mt-3 flex flex-col gap-2">
            {s.training.map((t) => (
              <li key={t.kind} className="flex flex-wrap items-center gap-2">
                <ActionButton
                  size="sm"
                  variant="secondary"
                  busy={disabled}
                  reason={t.reason}
                  onAct={() => {
                    void send({ type: 'sportTrain', kind: t.kind });
                  }}
                >
                  {TRAINING[t.kind]}
                </ActionButton>
                {t.reason && <span className="text-xs text-muted">{t.reason}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <ChoiceGroup
              legend="In key moments"
              name="sport-approach"
              value={s.approach}
              disabled={disabled}
              onChange={(approach) => {
                void send({ type: 'setSportApproach', approach });
              }}
              options={[
                { value: 'safe', label: 'Play it safe' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'bold', label: 'Take risks' },
              ]}
            />
          </div>
          <div className="mt-3">
            <Switch
              label="Choose my training for me"
              description="Each month: technical work, or rest when readiness is low."
              checked={s.autopilot}
              disabled={disabled}
              onChange={(value) => {
                void send({ type: 'setSportAutopilot', value });
              }}
            />
          </div>
        </Card>
      )}

      {s && s.sport !== 'tennis' && s.club && (
        <Card title="League table">
          <table aria-label="League table" className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th>Club</th>
                <th>P</th>
                <th>W</th>
                {s.sport === 'football' && <th>D</th>}
                <th>L</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {s.table.map((t) => (
                <tr
                  key={t.name}
                  className={t.name === s.club ? 'font-semibold text-fg' : 'text-fg'}
                >
                  <td>
                    {t.name}
                    {t.name === s.club ? ' (you)' : ''}
                  </td>
                  <td>{t.played}</td>
                  <td>{t.won}</td>
                  {s.sport === 'football' && <td>{t.drawn}</td>}
                  <td>{t.lost}</td>
                  <td>{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            This season: {s.season.apps} appearances,{' '}
            {s.sport === 'football'
              ? `${String(s.season.scored)} goals`
              : `${String(s.season.scored)} points`}
            , {s.season.wins} wins.
          </p>
        </Card>
      )}

      {s && s.record.length > 0 && (
        <Card title="Career record">
          <ul aria-label="Sport career record" className="divide-y divide-border text-sm">
            {[...s.record].reverse().map((r, i) => (
              <li key={`${String(r.year)}-${String(i)}`} className="py-2">
                <p className="font-semibold text-fg">
                  {r.year} · {r.club} · {r.finish}
                  {r.trophy ? ' · trophy' : ''}
                </p>
                <p className="text-muted">
                  {NAME[r.sport]} · {r.apps} appearances
                  {r.sport === 'tennis'
                    ? ''
                    : ` · ${String(r.scored)} ${r.sport === 'football' ? 'goals' : 'points'}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
