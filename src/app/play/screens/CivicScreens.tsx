import { useId, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { GameView } from '@engine/view';
import type { CountryCivicView, RouteView } from '@engine/viewCivic';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { formatMoney, formatShortMonth } from '@app/i18n/format';
import { useAppStore } from '@app/stores/appStore';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

/**
 * Milestone 6 screens (spec §3.13-3.15): World and migration, Health, Law, Religion,
 * Military and Politics (with royal and noble duties). Every control sends a validated
 * command; anything unavailable stays visible with the reasons why.
 */

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  return { send, disabled: busy || pending || !alive };
}

function useView(): GameView | null {
  return useGameStore((s) => s.session?.view ?? null);
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Reasons({ reasons, id }: { reasons: string[]; id?: string }) {
  if (reasons.length === 0) return null;
  return (
    <ul id={id} className="mt-1 list-disc pl-5 text-xs text-muted">
      {reasons.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}

function month(view: GameView, tick: number | null): string {
  return tick === null ? '—' : formatShortMonth(tickToMonth(view, tick));
}

function years(months: number): string {
  if (months < 12) return `${String(months)} months`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m === 0 ? `${String(y)} years` : `${String(y)} years ${String(m)} months`;
}

/** A sensitive real-world law, hidden when the player has chosen to hide such topics. */
function SensitiveNote({ text }: { text: string }) {
  const hide = useAppStore((s) => s.settings.hideSensitive);
  if (text === '') return null;
  if (hide)
    return (
      <p className="mt-2 text-xs text-muted">
        Some sensitive laws are hidden (you can show them in Settings).
      </p>
    );
  return <p className="mt-2 text-sm text-muted">{text}</p>;
}

// ------------------------------------------------------------------------------------------
// World and migration
// ------------------------------------------------------------------------------------------

function StatusCard({ view }: { view: GameView }) {
  const { saveId = '' } = useParams();
  const s = view.civic.status;
  return (
    <Card title="Your status">
      <Facts
        items={[
          ['Citizenship', s.citizenships.map((c) => c.name).join(', ')],
          ['Living in', s.countryName],
          ['Status here', t(`residence.${s.residence}`) + (s.routeName ? ` (${s.routeName})` : '')],
          ['Visa ends', s.expiresTick === null ? 'Does not expire' : month(view, s.expiresTick)],
          ['Time lived here', years(s.residedMonths)],
          ['Right to work', t(`workRights.${s.workRights}`)],
          [
            'Permanent residence',
            s.residence !== 'visa'
              ? 'Not needed'
              : s.monthsToPermanent === null
                ? 'No general route here'
                : s.monthsToPermanent === 0
                  ? 'You can apply now'
                  : `Eligible in ${years(s.monthsToPermanent)}`,
          ],
          [
            'Citizenship here',
            s.residence === 'citizen'
              ? 'You are a citizen'
              : s.monthsToCitizenship === null
                ? 'Practically unavailable'
                : s.monthsToCitizenship === 0
                  ? 'Time requirement met'
                  : `Time requirement met in ${years(s.monthsToCitizenship)}`,
          ],
        ]}
      />
      <p className="mt-3 text-sm text-muted">
        Easy Migration is{' '}
        <strong className="text-fg">{view.civic.easyMigration ? 'on' : 'off'}</strong> for this
        life. When on, new applications skip qualification and age limits, need half the time and
        funds, and visas always renew. Turning it off never removes a status you already hold.{' '}
        <Link className="underline" to={`/play/${saveId}/rules`}>
          Change it in Rules
        </Link>
        .
      </p>
    </Card>
  );
}

function ApplicationsCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const apps = view.civic.applications;
  return (
    <Card title="Applications">
      {apps.length === 0 ? (
        <p className="text-sm text-muted">You have not applied for anything yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-fg">
                  {t(`route.${a.route}`)}, {a.countryName}
                </span>{' '}
                <span className="text-muted">
                  · {t(`appStatus.${a.status}`)}
                  {a.status === 'pending' ? `, decision ${month(view, a.decisionTick)}` : ''}
                  {a.status === 'approved' ? `, move by ${month(view, a.useByTick)}` : ''}
                  {a.reason ? ` · ${a.reason}` : ''}
                </span>
              </span>
              {(a.status === 'pending' || a.status === 'approved') && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`Withdraw the application for ${t(`route.${a.route}`).toLowerCase()} in ${a.countryName}`}
                  onClick={() => void send({ type: 'withdrawVisa', applicationId: a.id })}
                >
                  Withdraw
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RouteRow({
  country,
  route,
  view,
}: {
  country: CountryCivicView;
  route: RouteView;
  view: GameView;
}) {
  const { send, disabled } = useAct();
  const [renounce, setRenounce] = useState(false);
  const reasonsId = useId();
  const blocked = !route.eligible || (route.renounceRequired && !renounce);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-fg">{route.name}</p>
          <p className="text-xs text-muted">
            Fee <Money minor={route.feeMinor} currency={view.country.currency} /> · decision in
            about {route.processingMonths} months · {route.approvalPercent}% approved
            {route.durationMonths > 0 && !route.grantsPermanent
              ? ` · lasts ${years(route.durationMonths)}`
              : ''}
            {route.grantsPermanent ? ' · grants permanent residence' : ''}
            {route.route !== 'permanent' && route.route !== 'citizenship'
              ? ` · ${t(`workRights.${route.workRights}`).toLowerCase()}`
              : ''}
          </p>
          {route.note && <p className="mt-1 text-xs text-muted">{route.note}</p>}
          {route.wouldLose.length > 0 && (
            <p className="mt-1 text-xs text-danger">
              You would lose: {route.wouldLose.join(', ')} citizenship.
            </p>
          )}
          {route.renounceRequired && route.eligible && (
            <label className="mt-2 flex items-center gap-2 text-xs text-fg">
              <input
                type="checkbox"
                checked={renounce}
                onChange={(e) => {
                  setRenounce(e.target.checked);
                }}
              />
              I agree to give up my other citizenships
            </label>
          )}
          <Reasons id={reasonsId} reasons={route.reasons} />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || blocked}
          aria-describedby={route.reasons.length > 0 ? reasonsId : undefined}
          aria-label={`Apply: ${route.name}, ${country.name}`}
          onClick={() =>
            void send({
              type: 'applyVisa',
              countryCode: country.code,
              route: route.route,
              renounce,
            })
          }
        >
          Apply
        </Button>
      </div>
    </li>
  );
}

function CountryProfile({ country, view }: { country: CountryCivicView; view: GameView }) {
  const inst = country.institutions;
  const cit = inst.citizenship;
  return (
    <div className="flex flex-col gap-4">
      <Facts
        items={[
          ['Your status', country.yourStatus ? t(`residence.${country.yourStatus}`) : 'None'],
          [
            'Citizenship by birth',
            {
              unconditional: 'Yes, for everyone born here',
              parentResident: 'If a parent is a citizen or settled',
              atMajority: 'At 18, after five years’ residence',
              none: 'No, only by descent',
            }[cit.birthright],
          ],
          [
            'Permanent residence after',
            cit.permanentYears === null
              ? 'No general route'
              : `${String(cit.permanentYears)} years`,
          ],
          [
            'Naturalisation after',
            cit.naturalisationYears === null
              ? 'Practically unavailable'
              : `${String(cit.naturalisationYears)} years (${cit.countsFrom === 'permanent' ? 'as a permanent resident' : 'of residence'})`,
          ],
          [
            'Dual citizenship',
            { allowed: 'Allowed', restricted: 'Restricted', none: 'Not allowed' }[cit.dual],
          ],
          [
            'Health care for newcomers',
            `${String(inst.healthcare.visitorCoveragePercent)}% of public cover`,
          ],
          [
            'Foreign home buyers',
            { allowed: 'Allowed', restricted: 'Restricted', banned: 'Banned' }[
              inst.property.foreignBuyers
            ],
          ],
          [
            'Inheritance tax (top rate)',
            inst.inheritance.taxTopBp === 0
              ? 'None'
              : `${String(inst.inheritance.taxTopBp / 100)}%`,
          ],
        ]}
      />
      <p className="text-sm text-muted">{cit.note}</p>
      <p className="text-sm text-muted">{inst.property.note}</p>
      <div>
        <h3 className="text-sm font-semibold text-fg">Routes</h3>
        <ul className="divide-y divide-border">
          {country.routes.map((r) => (
            <RouteRow key={r.route} country={country} route={r} view={view} />
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted">
        Sources:{' '}
        {inst.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? ' · ' : ''}
            <a className="underline" href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </span>
        ))}
        . Rules as of {view.civic.source.asOf}, simplified for play; later changes are simulated.
      </p>
    </div>
  );
}

function CountriesCard({ view }: { view: GameView }) {
  const [code, setCode] = useState(
    view.civic.countries.find((c) => c.code !== view.civic.status.countryCode)?.code ?? 'GB',
  );
  const selectId = useId();
  const country = view.civic.countries.find((c) => c.code === code);
  return (
    <Card
      title="Countries and visas"
      description="Compare countries and apply for visas, residence or citizenship."
    >
      <label htmlFor={selectId} className="text-sm font-medium text-fg">
        Country
      </label>
      <select
        id={selectId}
        className="mt-1 mb-4 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg sm:w-72"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
        }}
      >
        {view.civic.countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
            {c.yourStatus ? ` (${t(`residence.${c.yourStatus}`).toLowerCase()})` : ''}
          </option>
        ))}
      </select>
      {country && <CountryProfile country={country} view={view} />}
    </Card>
  );
}

function MoveCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const options = view.civic.relocation.filter((l) => l.id !== view.character.location.id);
  const [id, setId] = useState(options.find((o) => o.allowed)?.id ?? options[0]?.id ?? '');
  const [confirm, setConfirm] = useState(false);
  const selectId = useId();
  const reasonsId = useId();
  const chosen = options.find((o) => o.id === id);
  const groups = [...new Set(options.map((o) => o.countryName))];
  return (
    <Card
      title="Move"
      description="Move to another city, or abroad once you have a visa, residence or citizenship there."
    >
      <label htmlFor={selectId} className="text-sm font-medium text-fg">
        Destination
      </label>
      <select
        id={selectId}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg sm:w-80"
        value={id}
        onChange={(e) => {
          setId(e.target.value);
        }}
      >
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options
              .filter((o) => o.countryName === g)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.allowed ? '' : ' (not available)'}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {chosen && (
        <div className="mt-3">
          <p className="text-sm text-fg">
            Moving costs about <Money minor={chosen.costMinor} currency={view.country.currency} />.
            Your job ends, your household comes with you
            {chosen.countryCode !== view.character.countryCode
              ? ', insurance policies end and your money is converted at the current exchange rate'
              : ''}
            .
          </p>
          <Reasons id={reasonsId} reasons={chosen.reasons} />
          <Button
            className="mt-2"
            disabled={disabled || !chosen.allowed}
            aria-describedby={chosen.reasons.length > 0 ? reasonsId : undefined}
            onClick={() => {
              setConfirm(true);
            }}
          >
            Move to {chosen.name}
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Move to ${chosen.name}?`}
            confirmLabel="Move"
            onConfirm={async () => {
              await send({ type: 'relocate', locationId: chosen.id });
            }}
          >
            You will leave your job and local clubs. This cannot be undone except by moving again
            (or rewinding time).
          </ConfirmDialog>
        </div>
      )}
    </Card>
  );
}

export function WorldScreen() {
  const view = useView();
  if (!view) return null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="World and migration"
        description="Your citizenship and residence, country rules, visas and moving."
      />
      <StatusCard view={view} />
      <ApplicationsCard view={view} />
      <CountriesCard view={view} />
      <MoveCard view={view} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Health
// ------------------------------------------------------------------------------------------

export function HealthScreen() {
  const view = useView();
  const { send, disabled } = useAct();
  if (!view) return null;
  const h = view.civic.health;
  const cur = view.country.currency;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Health care"
        description="Conditions, treatment and what your cover pays."
      />
      <Card title="Your cover">
        <Facts
          items={[
            [
              'System',
              {
                universal: 'Universal public system',
                mixed: 'Mixed public and private',
                insurance: 'Insurance-based',
              }[h.system as 'universal' | 'mixed' | 'insurance'],
            ],
            ['Public cover', `${String(h.publicCoverage)}% of treatment costs`],
            ['Your public cover', `${String(h.yourCoveragePercent)}%`],
            ['Typical public wait', h.waitMonths === 0 ? 'None' : `${String(h.waitMonths)} months`],
            ['Health insurance', h.insured ? 'Yes (pays 80% of what is left)' : 'No'],
          ]}
        />
        <p className="mt-2 text-sm text-muted">{h.note}</p>
      </Card>
      <Card title="Conditions">
        {h.conditions.length === 0 ? (
          <p className="text-sm text-muted">You have no health conditions right now.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {h.conditions.map((c) => (
              <li key={c.id} className="py-3">
                <p className="font-medium text-fg">
                  {t(`condition.${c.kind}`)}{' '}
                  <span className="font-normal text-muted">
                    · {t(`conditionStatus.${c.status}`)}
                    {c.chronic ? ' · long-term' : ''}
                    {c.procedure ? ` · ${t(`cure.${c.kind}`)}` : ''}
                    {c.status === 'waiting'
                      ? `, treatment from ${month(view, c.waitUntilTick)}`
                      : ''}
                    {c.status === 'treating' ? `, until ${month(view, c.treatmentEndTick)}` : ''}
                  </span>
                </p>
                <StatBar label="Severity" value={c.severity} />
                {c.status === 'untreated' && c.kind !== 'flu' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() =>
                        void send({ type: 'treatCondition', conditionId: c.id, care: 'public' })
                      }
                    >
                      Public care: <Money minor={c.publicMinor} currency={cur} />
                      {c.waitMonths > 0 ? `, wait ${String(c.waitMonths)} months` : ''}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() =>
                        void send({ type: 'treatCondition', conditionId: c.id, care: 'private' })
                      }
                    >
                      Private care now: <Money minor={c.privateMinor} currency={cur} />
                    </Button>
                  </div>
                )}
                {c.cure && (c.status === 'untreated' || c.status === 'managed') && (
                  <div className="mt-3">
                    <p className="text-xs text-muted">
                      {t(`cure.${c.kind}`)}: {String(c.cure.months)}{' '}
                      {c.cure.months === 1 ? 'month' : 'months'}, {String(c.cure.percent)}% chance
                      of curing it for good.
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() =>
                          void send({
                            type: 'treatCondition',
                            conditionId: c.id,
                            care: 'public',
                            cure: true,
                          })
                        }
                      >
                        Cure with public care: <Money minor={c.cure.public} currency={cur} />
                        {c.waitMonths > 0 ? `, wait ${String(c.waitMonths)} months` : ''}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() =>
                          void send({
                            type: 'treatCondition',
                            conditionId: c.id,
                            care: 'private',
                            cure: true,
                          })
                        }
                      >
                        Cure privately now: <Money minor={c.cure.private} currency={cur} />
                      </Button>
                    </div>
                  </div>
                )}
                {c.kind === 'flu' && c.status === 'untreated' && (
                  <p className="mt-1 text-xs text-muted">
                    This usually clears up by itself within a month.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {h.history.length > 0 && (
        <Card title="Past conditions">
          <ul className="text-sm text-muted">
            {h.history.map((c) => (
              <li key={c.id}>{t(`condition.${c.kind}`)} · cleared up</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Law
// ------------------------------------------------------------------------------------------

export function LegalScreen() {
  const view = useView();
  const { send, disabled } = useAct();
  if (!view) return null;
  const l = view.civic.legal;
  const law = l.institutions;
  const cur = view.country.currency;
  const open = l.cases.filter((k) => k.status === 'open');
  const closed = l.cases.filter((k) => k.status === 'closed');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Law" description="Your legal matters and the law where you live." />
      <Card title={`The law in ${view.civic.status.countryName}`}>
        <Facts
          items={[
            ['Legal system', t(`legalSystem.${law.system}`)],
            ['Age of majority', String(law.majorityAge)],
            ['Driving age', String(law.drivingAge)],
            [
              'Drinking age',
              law.drinkingAge === null ? 'Alcohol is prohibited' : String(law.drinkingAge),
            ],
            ['Minimum marriage age', String(law.marriageAge)],
            ['Juries or lay judges', law.juries ? 'Yes' : 'No'],
            ['Convictions spent after', `${String(law.recordSpentYears)} years`],
            ['Your unspent convictions', String(l.unspentConvictions)],
          ]}
        />
        <p className="mt-2 text-sm text-muted">{law.note}</p>
        <SensitiveNote text={law.sensitiveNote} />
        {view.civic.status.custodyUntilTick !== null && (
          <p className="mt-2 text-sm text-fg" role="status">
            You are in custody until {month(view, view.civic.status.custodyUntilTick)}. Most actions
            are unavailable until then.
          </p>
        )}
      </Card>
      <Card title="Open cases">
        {open.length === 0 ? (
          <p className="text-sm text-muted">You have no open legal matters.</p>
        ) : (
          <ul className="divide-y divide-border">
            {open.map((k) => (
              <li key={k.id} className="flex flex-col gap-3 py-3">
                <p className="text-sm text-fg">
                  <span className="font-medium">{t(`case.${k.kind}`)}</span> · hearing{' '}
                  {month(view, k.hearingTick)} · at stake{' '}
                  <Money minor={k.amountMinor} currency={cur} />
                  {k.role === 'claimant' ? ' · you are the claimant' : ''}
                </p>
                <ChoiceGroup
                  legend="Representation"
                  name={`lawyer-${k.id}`}
                  value={k.lawyer}
                  disabled={disabled}
                  options={[
                    { value: 'none', label: t('lawyer.none'), description: 'Represent yourself.' },
                    {
                      value: 'legalAid',
                      label: t('lawyer.legalAid'),
                      description: l.legalAid
                        ? 'Free for your income.'
                        : 'Not available on your income.',
                    },
                    {
                      value: 'private',
                      label: t('lawyer.private'),
                      description: `About ${formatMoney(l.privateFeeMinor, cur)}, the strongest defence.`,
                    },
                  ]}
                  onChange={(lawyer) => void send({ type: 'hireLawyer', caseId: k.id, lawyer })}
                />
                {k.role === 'defendant' && (
                  <ChoiceGroup
                    legend="Plea"
                    name={`plea-${k.id}`}
                    value={k.plea === 'undecided' ? ('notGuilty' as const) : k.plea}
                    disabled={disabled}
                    description={
                      k.plea === 'undecided'
                        ? 'If you do not choose, you will contest it.'
                        : 'You can change your plea until the hearing.'
                    }
                    options={[
                      {
                        value: 'notGuilty',
                        label: k.criminal ? t('plea.notGuilty') : 'Contest it',
                        description: 'Go to a hearing; losing costs more.',
                      },
                      {
                        value: 'guilty',
                        label: k.criminal ? t('plea.guilty') : 'Accept it',
                        description: 'No hearing and a lighter outcome.',
                      },
                      ...(k.criminal
                        ? []
                        : [
                            {
                              value: 'settle' as const,
                              label: t('plea.settle'),
                              description: 'Pay 70% now.',
                            },
                          ]),
                    ]}
                    onChange={(plea) => void send({ type: 'setPlea', caseId: k.id, plea })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {closed.length > 0 && (
        <Card title="Past cases">
          <ul className="divide-y divide-border text-sm">
            {closed.map((k) => (
              <li key={k.id} className="py-2 text-fg">
                {t(`case.${k.kind}`)} · {t(`outcome.${k.outcome ?? 'dismissed'}`)}
                {k.sentenceMonths > 0 ? ` (${String(k.sentenceMonths)} months)` : ''}
                {k.convicted ? ` · spent ${month(view, k.spentTick)}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Religion
// ------------------------------------------------------------------------------------------

export function ReligionScreen() {
  const view = useView();
  const hideSensitive = useAppStore((s) => s.settings.hideSensitive);
  const { send, disabled } = useAct();
  const selectId = useId();
  if (!view) return null;
  const r = view.civic.religion;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Religion and belief"
        description="Your beliefs and how much you take part."
      />
      <Card title="Your beliefs">
        {!r.canChoose ? (
          <p className="text-sm text-muted">
            You can choose your own beliefs from 16. For now you share your family’s:{' '}
            {t(`religion.${r.current}`)}.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor={selectId} className="text-sm font-medium text-fg">
                Belief
              </label>
              <select
                id={selectId}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg sm:w-72"
                value={r.current}
                disabled={disabled || r.restricted}
                aria-describedby={r.restricted ? `${selectId}-why` : undefined}
                onChange={(e) =>
                  void send({ type: 'setReligion', religion: e.target.value as typeof r.current })
                }
              >
                {r.choices.map((c) => (
                  <option key={c} value={c}>
                    {t(`religion.${c}`)}
                  </option>
                ))}
              </select>
              {r.restricted && (
                <p id={`${selectId}-why`} className="mt-1 text-xs text-muted">
                  {hideSensitive
                    ? 'Changing your stated belief is not available where you live.'
                    : 'Leaving this faith is legally restricted where you live.'}{' '}
                  You can still choose how much you take part.
                </p>
              )}
            </div>
            {r.current !== 'none' && (
              <ChoiceGroup
                legend="Taking part"
                description="More involvement brings community and calm, and takes time each month."
                name="participation"
                value={r.participation}
                disabled={disabled}
                options={[
                  { value: 'none', label: t('participation.none'), description: 'No time' },
                  {
                    value: 'occasional',
                    label: t('participation.occasional'),
                    description: '4 hours a month',
                  },
                  {
                    value: 'regular',
                    label: t('participation.regular'),
                    description: '10 hours a month',
                  },
                  {
                    value: 'devout',
                    label: t('participation.devout'),
                    description: '20 hours a month',
                  },
                ]}
                onChange={(level) => void send({ type: 'setParticipation', level })}
              />
            )}
          </div>
        )}
      </Card>
      <Card title={`Belief in ${view.civic.status.countryName}`}>
        <ul className="flex flex-col gap-2">
          {r.landscape.shares.map(([religion, percent]) => (
            <li key={religion}>
              <StatBar
                label={`${t(`religion.${religion}`)} (${String(percent)}%)`}
                value={percent * 10}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">{r.landscape.note}</p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Military
// ------------------------------------------------------------------------------------------

export function MilitaryScreen() {
  const view = useView();
  const { send, disabled } = useAct();
  const [branch, setBranch] = useState<'army' | 'navy' | 'airForce'>('army');
  const [track, setTrack] = useState<'enlisted' | 'officer'>('enlisted');
  const [specialty, setSpecialty] = useState<
    'logistics' | 'engineering' | 'medical' | 'administration' | null
  >(null);
  const [posting, setPosting] = useState<'home' | 'overseas' | null>(null);
  const reasonsId = useId();
  if (!view) return null;
  const m = view.civic.military;
  const cur = view.country.currency;
  const serving = m.current?.status === 'serving';
  const reasons = track === 'officer' ? m.enlist.officer : m.enlist.enlisted;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Military service"
        description="Conscription rules, your obligations and a career in the forces."
      />
      <Card title={`Service in ${view.civic.status.countryName}`}>
        <Facts
          items={[
            ['Conscription', t(`conscription.${m.rules.conscription}`)],
            ['Length', m.rules.serviceMonths > 0 ? `${String(m.rules.serviceMonths)} months` : '—'],
            [
              'Call-up ages',
              m.rules.conscription === 'none'
                ? '—'
                : `${String(m.rules.callUpAge)} to ${String(m.rules.callUpUntil)}`,
            ],
            ['You are liable', m.liable ? 'Yes' : 'No'],
            ['Volunteers from age', String(m.rules.volunteerAge)],
            ['Veteran', m.veteran ? 'Yes' : 'No'],
          ]}
        />
        <p className="mt-2 text-sm text-muted">{m.rules.note}</p>
      </Card>
      {m.current && (
        <Card title="Your service">
          <Facts
            items={[
              ['Status', t(`serviceStatus.${m.current.status}`)],
              ['Branch', t(`branch.${m.current.branch}`)],
              ['Rank', m.current.rank],
              ['Months served', String(m.current.monthsServed)],
              [
                m.current.status === 'serving' ? 'Ends' : 'Report by',
                m.current.status === 'serving'
                  ? month(view, m.current.endTick)
                  : month(view, m.current.reportTick),
              ],
              ['Monthly pay', <Money key="pay" minor={m.current.payMinor} currency={cur} />],
              ...(serving && m.current.kind === 'volunteer'
                ? ([
                    [
                      'Specialty',
                      m.current.specialty ? t(`specialty.${m.current.specialty}`) : 'Not chosen',
                    ],
                    ['Posting', m.current.posting === 'overseas' ? 'Overseas' : 'Home'],
                    ['Promotion chance', `${String(m.current.promotionChance)}% a month when due`],
                  ] as [string, string][])
                : []),
            ]}
          />
          {serving && m.current.kind === 'volunteer' && (
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <ChoiceGroup
                legend="Specialty"
                name="specialty"
                value={specialty ?? m.current.specialty ?? 'logistics'}
                onChange={setSpecialty}
                options={(['logistics', 'engineering', 'medical', 'administration'] as const).map(
                  (v) => ({
                    value: v,
                    label: t(`specialty.${v}`),
                    description: t(`specialtyHint.${v}`),
                  }),
                )}
              />
              <ChoiceGroup
                legend="Posting"
                name="posting"
                value={posting ?? m.current.posting}
                onChange={setPosting}
                options={[
                  { value: 'home', label: 'Home', description: 'Normal pay; time for family.' },
                  {
                    value: 'overseas',
                    label: 'Overseas',
                    description:
                      '25% more pay and better promotion odds; more stress, less family time.',
                  },
                ]}
              />
              <Button
                size="sm"
                className="self-start"
                disabled={disabled}
                onClick={() =>
                  void send({
                    type: 'setServiceRole',
                    specialty: specialty ?? m.current?.specialty ?? 'logistics',
                    posting: posting ?? m.current?.posting ?? 'home',
                  })
                }
              >
                Confirm role
              </Button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {m.current.status === 'called' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || !m.current.canDefer}
                onClick={() => void send({ type: 'deferService' })}
              >
                Defer while studying
              </Button>
            )}
            {serving && m.current.kind === 'volunteer' && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || !m.current.canReenlist}
                  onClick={() => void send({ type: 'reenlist' })}
                >
                  Sign on for another term
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || !m.current.canLeave}
                  onClick={() => void send({ type: 'leaveService' })}
                >
                  Leave the forces
                </Button>
              </>
            )}
          </div>
          {m.current.status === 'called' && !m.current.canDefer && (
            <p className="mt-1 text-xs text-muted">
              Deferment needs current university study and an age under the limit.
            </p>
          )}
          {serving && m.current.kind === 'volunteer' && (
            <p className="mt-1 text-xs text-muted">
              You can sign on again in the last six months of a term, and leave after 24 months.
            </p>
          )}
        </Card>
      )}
      {!serving && (
        <Card
          title="Enlist"
          description="Volunteer terms are four years. Officer training needs a degree."
        >
          <div className="flex flex-col gap-4">
            <ChoiceGroup
              legend="Branch"
              name="branch"
              value={branch}
              disabled={disabled}
              options={[
                { value: 'army', label: t('branch.army') },
                { value: 'navy', label: t('branch.navy') },
                { value: 'airForce', label: t('branch.airForce') },
              ]}
              onChange={setBranch}
            />
            <ChoiceGroup
              legend="Entry"
              name="track"
              value={track}
              disabled={disabled}
              options={[
                { value: 'enlisted', label: 'Enlisted', description: 'Start as a private.' },
                { value: 'officer', label: 'Officer', description: 'Start as an officer cadet.' },
              ]}
              onChange={setTrack}
            />
            <div>
              <Button
                disabled={disabled || reasons.length > 0}
                aria-describedby={reasons.length > 0 ? reasonsId : undefined}
                onClick={() => void send({ type: 'enlist', branch, track })}
              >
                Enlist
              </Button>
              <Reasons id={reasonsId} reasons={reasons} />
            </div>
          </div>
        </Card>
      )}
      {m.history.length > 0 && (
        <Card title="Service record">
          <ul className="text-sm text-fg">
            {m.history.map((s) => (
              <li key={s.id}>
                {t(`kindName.${s.kind}`)} · {t(`serviceStatus.${s.status}`)}
                {s.monthsServed > 0 ? ` · ${String(s.monthsServed)} months, ${s.rank}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Politics and royal duties
// ------------------------------------------------------------------------------------------

function RoyalCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const r = view.civic.royal;
  if (!r) return null;
  return (
    <Card
      title={r.kind === 'royal' ? 'Royal duties' : 'Public duties'}
      description={`About ${String(r.expected)} engagements a year are expected. Repeating the same engagement in a month counts for less.`}
    >
      <StatBar label="Public approval" value={r.approval} />
      <p className="mt-2 text-sm text-fg">
        {r.engagements} engagements so far this year.
        {r.kind === 'royal' ? ' An allowance is paid while approval stays reasonable.' : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {r.engagementKinds.map((e) => (
          <Button
            key={e.id}
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => void send({ type: 'royalEngagement', kind: e.id as 'charity' })}
          >
            {t(`engagement.${e.id}`)} ({e.hours} h)
          </Button>
        ))}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-fg">
        Patronages ({r.patronages.length} of 5)
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.causes.map((cause) => {
          const held = r.patronages.includes(cause);
          return (
            <Button
              key={cause}
              size="sm"
              variant={held ? 'primary' : 'ghost'}
              aria-pressed={held}
              disabled={disabled || (!held && r.patronages.length >= 5)}
              onClick={() =>
                void send(
                  held
                    ? { type: 'dropPatronage', cause: cause as 'arts' }
                    : { type: 'takePatronage', cause: cause as 'arts' },
                )
              }
            >
              {t(`patron.${cause}`)}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}

export function PoliticsScreen() {
  const view = useView();
  const { send, disabled } = useAct();
  const selectId = useId();
  const [party, setParty] = useState('');
  const [resign, setResign] = useState(false);
  if (!view) return null;
  const p = view.civic.politics;
  const career = p.career;
  const parties = p.rules.parties;
  const chosenParty = party !== '' ? party : (parties[0]?.id ?? '');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Politics and public life"
        description="Parties, elections, office and public duties. Parties are fictional."
      />
      <Card title={`Politics in ${view.civic.status.countryName}`}>
        <Facts
          items={[
            ['System', p.rules.system],
            [
              'Voting age',
              p.rules.voteAge === null ? 'No national elections' : String(p.rules.voteAge),
            ],
            ['Voting', p.rules.compulsoryVoting ? 'Compulsory' : 'Voluntary'],
            ['You can vote', p.voter ? 'Yes' : 'No'],
          ]}
        />
        {p.rules.note && <p className="mt-2 text-sm text-muted">{p.rules.note}</p>}
      </Card>
      <Card title="Community standing">
        <StatBar label="Community standing" value={p.communityStanding} />
        <p className="mt-2 text-sm text-muted">
          Volunteering builds it: a food bank, a community clinic or a neighbourhood clean-up
          (Activities, Social). When you run for office it gives your campaign up to 10 points of
          early support, so a track record helps before you stand.
        </p>
      </Card>
      {parties.length > 0 && (
        <Card title="Party">
          {career?.partyName ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-fg">Member of the {career.partyName}.</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || career.status === 'candidate'}
                onClick={() => void send({ type: 'leaveParty' })}
              >
                Leave the party
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={selectId} className="text-sm font-medium text-fg">
                  Party
                </label>
                <select
                  id={selectId}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-fg sm:w-72"
                  value={chosenParty}
                  onChange={(e) => {
                    setParty(e.target.value);
                  }}
                >
                  {parties.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} ({x.position})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={disabled}
                onClick={() => void send({ type: 'joinParty', partyId: chosenParty })}
              >
                Join
              </Button>
            </div>
          )}
        </Card>
      )}
      {career?.campaign && (
        <Card
          title={
            career.status === 'seeking'
              ? `Seeking appointment: ${career.campaign.title}`
              : `Campaign: ${career.campaign.title}`
          }
        >
          <StatBar label="Support" value={career.campaign.support} />
          <p className="mt-2 text-sm text-fg">
            {career.status === 'seeking' ? 'Decision' : 'Election day'}:{' '}
            {month(view, career.campaign.electionTick)}. Spent so far{' '}
            <Money minor={career.campaign.spentMinor} currency={view.country.currency} />.
          </p>
          {career.status !== 'seeking' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(['canvass', 'advertise', 'debate', 'fundraise'] as const).map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => void send({ type: 'campaign', action })}
                >
                  {t(`campaign.${action}`)}
                </Button>
              ))}
            </div>
          )}
          <Button
            className="mt-3"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void send({ type: 'withdrawCampaign' })}
          >
            Withdraw
          </Button>
        </Card>
      )}
      {career?.status === 'office' && career.officeTitle && (
        <Card title={`In office: ${career.officeTitle}`}>
          <StatBar label="Approval" value={career.approval} />
          <p className="mt-2 text-sm text-fg">
            Term ends {month(view, career.termEndTick)} · term {career.termsInOffice}.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              setResign(true);
            }}
          >
            Resign
          </Button>
          <ConfirmDialog
            open={resign}
            onOpenChange={setResign}
            title="Resign from office?"
            confirmLabel="Resign"
            tone="danger"
            onConfirm={async () => {
              await send({ type: 'resignOffice' });
            }}
          >
            You will leave office straight away.
          </ConfirmDialog>
        </Card>
      )}
      <Card title="Offices">
        {p.offices.length === 0 ? (
          <p className="text-sm text-muted">There are no offices open to you here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {p.offices.map((o) => {
              const id = `office-${o.level}`;
              return (
                <li key={o.level} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-fg">{o.title}</p>
                    <p className="text-xs text-muted">
                      {t(`selection.${o.selection}`)} · from age {o.minAge} · {o.termYears}-year
                      terms
                      {o.termLimit !== null ? ` · at most ${String(o.termLimit)} in a row` : ''} ·
                      salary <Money minor={o.salaryMinor} currency={view.country.currency} /> a
                      month · {o.hours} hours a month
                    </p>
                    <Reasons id={id} reasons={o.reasons} />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled || o.reasons.length > 0}
                    aria-describedby={o.reasons.length > 0 ? id : undefined}
                    onClick={() => void send({ type: 'seekOffice', level: o.level })}
                  >
                    {o.selection === 'election' ? 'Stand for election' : 'Seek appointment'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <RoyalCard view={view} />
      {view.civic.royalReason && (
        <Card title="Public duties">
          <p className="text-sm text-muted">{view.civic.royalReason}</p>
        </Card>
      )}
      {career && career.history.length > 0 && (
        <Card title="Record">
          <ul className="text-sm text-fg">
            {career.history.map((h) => (
              <li key={`${String(h.tick)}-${h.level}-${h.result}`}>
                {month(view, h.tick)} · {t(`level.${h.level}`)} · {h.result}
                {h.sharePercent > 0 ? ` (${String(h.sharePercent)}%)` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
