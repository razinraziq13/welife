import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Building2 } from 'lucide-react';
import type { CompanyView, EnterpriseView } from '@engine/viewEnterprise';
import type { GameView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { AmountForm, Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { formatBp, formatMoney, formatShortMonth, toMinorString } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  return { send, disabled: busy || pending || !alive };
}

const month = (view: GameView, tick: number) => formatShortMonth(tickToMonth(view, tick));

function StartCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const b = view.enterprise.business;
  const typeId = useId();
  const locationId = useId();
  const nameId = useId();
  const capitalId = useId();
  const [type, setType] = useState(b.types[0]?.id ?? '');
  const [location, setLocation] = useState(view.character.location.id);
  const [name, setName] = useState('');
  const [capital, setCapital] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selected = b.types.find((x) => x.id === type);
  const cur = view.country.currency;
  return (
    <Card
      title="Start a company"
      description="Choose what to run and where, and how much of your own money to put in. Running it yourself takes 40 hours a month."
    >
      {!b.canStart ? (
        <p className="text-sm text-muted">{b.reason}</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const minor = toMinorString(capital, cur);
            if (!minor) {
              setError('Enter how much to invest.');
              return;
            }
            setError(null);
            void send({
              type: 'startBusiness',
              typeId: type,
              locationId: location,
              name: name.trim() || (selected?.name ?? 'My company'),
              capitalMinor: minor,
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={typeId} className="text-sm font-medium text-fg">
                Kind of business
              </label>
              <select
                id={typeId}
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              >
                {b.types.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={locationId} className="text-sm font-medium text-fg">
                Where
              </label>
              <select
                id={locationId}
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              >
                {b.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}, {l.countryName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="text-sm font-medium text-fg">
                Company name
              </label>
              <input
                id={nameId}
                value={name}
                maxLength={60}
                placeholder={selected?.name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={capitalId} className="text-sm font-medium text-fg">
                Your investment ({cur.symbol})
              </label>
              <input
                id={capitalId}
                inputMode="decimal"
                value={capital}
                onChange={(e) => {
                  setCapital(e.target.value);
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              />
            </div>
          </div>
          {selected && location === view.character.location.id && (
            <p className="text-sm text-muted">
              Here, set-up costs about {formatMoney(selected.setupMinor, cur)}; to cover set-up and
              the first months you need at least {formatMoney(selected.minCapitalMinor, cur)}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" disabled={disabled}>
              Start the company
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function BusinessScreen() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  const b = view.enterprise.business;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Business"
        description="Start, run, grow and sell companies. Figures for each country are simulated from approximate starting values."
      />
      <Card title="Your companies">
        {b.companies.length === 0 ? (
          <p className="text-sm text-muted">You do not own a company yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {b.companies.map((c) => (
              <li key={c.id}>
                <Link
                  to={`${base}/business/${c.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl px-1 py-3 hover:bg-surface-2"
                >
                  <Building2 aria-hidden="true" className="size-5 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{c.name}</span>
                    <span className="block text-sm text-muted">
                      {c.typeName} · {c.branches.length} branch{c.branches.length === 1 ? '' : 'es'}{' '}
                      · you own {formatBp(c.yourSharesBp)}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block text-muted">Last month</span>
                    {c.statement ? (
                      <Money minor={c.statement.netProfit} currency={c.currency} signed />
                    ) : (
                      <span className="text-muted">just opened</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {b.past.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Earlier:{' '}
            {b.past
              .map((p) => `${p.name} (${t(`businessStatus.${p.status}`).toLowerCase()})`)
              .join(', ')}
          </p>
        )}
      </Card>
      <StartCard view={view} />
    </div>
  );
}

function StatementCard({ company, view }: { company: CompanyView; view: GameView }) {
  const s = company.statement;
  const cur = company.currency;
  const rows: [string, bigint, boolean][] = s
    ? [
        ['Revenue', s.revenue, false],
        ['Goods and materials', -s.cogs, false],
        ['Wages (with employer costs)', -s.wages, false],
        ['Premises rent', -s.rent, false],
        ['Marketing', -s.marketing, false],
        ['Overheads', -s.other, false],
        ['Operating profit', s.operatingProfit, true],
        ['Interest', -s.interest, false],
        ['Company tax', -s.tax, false],
        ['Net profit', s.netProfit, true],
      ]
    : [];
  return (
    <Card
      title="Operating statement"
      description={
        s
          ? `${month(view, s.tick)} · sold ${String(s.unitsSold)} of ${String(s.unitsDemanded)} ${company.unit} wanted`
          : 'The first statement arrives at the end of this month.'
      }
    >
      {s && (
        <table className="w-full text-sm">
          <caption className="sr-only">Operating statement</caption>
          <tbody>
            {rows.map(([label, amount, strong]) => (
              <tr key={label} className={strong ? 'border-t border-border font-semibold' : ''}>
                <th scope="row" className="py-1 text-left font-normal text-muted">
                  {label}
                </th>
                <td className="py-1 text-right">
                  <Money minor={amount} currency={cur} signed={strong} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {company.history.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-primary">Recent months</summary>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Revenue</th>
                <th scope="col">Net profit</th>
                <th scope="col">Cash</th>
              </tr>
            </thead>
            <tbody>
              {[...company.history].reverse().map((h) => (
                <tr key={h.tick}>
                  <td>{month(view, h.tick)}</td>
                  <td>{formatMoney(h.revenue, cur)}</td>
                  <td>{formatMoney(h.netProfit, cur)}</td>
                  <td>{formatMoney(h.cash, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Card>
  );
}

const PRICE_STEPS = [60, 70, 80, 85, 90, 95, 100, 105, 110, 115, 120, 130, 140, 150, 175, 200];

function BranchCard({
  company,
  branch,
}: {
  company: CompanyView;
  branch: CompanyView['branches'][number];
}) {
  const { send, disabled } = useAct();
  const priceId = useId();
  const stockId = useId();
  const [closing, setClosing] = useState(false);
  const [stock, setStock] = useState(String(branch.stockTarget));
  const local = branch.currency;
  const steps = PRICE_STEPS.includes(branch.pricePercent)
    ? PRICE_STEPS
    : [...PRICE_STEPS, branch.pricePercent].sort((a, b) => a - b);
  return (
    <Card title={`${branch.locationName} branch`} headingLevel={3}>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Last month</dt>
          <dd className="text-fg">
            sold {branch.lastSold} of {branch.lastDemand} wanted
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Capacity</dt>
          <dd className="text-fg">
            {branch.capacity} {company.unit}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Price</dt>
          <dd className="text-fg">
            <Money minor={branch.priceMinor} currency={local} /> ({branch.pricePercent}%)
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Wage per person</dt>
          <dd className="text-fg">
            <Money minor={branch.wageMinor} currency={local} />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Premises rent</dt>
          <dd className="text-fg">
            <Money minor={branch.rentMinor} currency={local} />
          </dd>
        </div>
        {company.goods && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">In stock</dt>
            <dd className="text-fg">{branch.inventory}</dd>
          </div>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg">Staff: {branch.staff}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || branch.staff === 0}
            aria-label={`Let one person go at ${branch.locationName}`}
            onClick={() =>
              void send({
                type: 'setStaff',
                businessId: company.id,
                branchId: branch.id,
                staff: branch.staff - 1,
              })
            }
          >
            −
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            aria-label={`Hire one person at ${branch.locationName}`}
            onClick={() =>
              void send({
                type: 'setStaff',
                businessId: company.id,
                branchId: branch.id,
                staff: branch.staff + 1,
              })
            }
          >
            +
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={priceId} className="text-sm text-fg">
            Price level
          </label>
          <select
            id={priceId}
            value={branch.pricePercent}
            disabled={disabled}
            onChange={(e) =>
              void send({
                type: 'setPrice',
                businessId: company.id,
                branchId: branch.id,
                pricePercent: Number(e.target.value),
              })
            }
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {steps.map((p) => (
              <option key={p} value={p}>
                {p}% of local reference
              </option>
            ))}
          </select>
        </div>
        {company.goods && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const units = Number(stock);
              if (Number.isInteger(units) && units >= 0)
                void send({ type: 'setStock', businessId: company.id, branchId: branch.id, units });
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor={stockId} className="text-sm text-fg">
                Restock to
              </label>
              <input
                id={stockId}
                inputMode="numeric"
                value={stock}
                onChange={(e) => {
                  setStock(e.target.value);
                }}
                className="h-11 w-28 rounded-xl border border-border bg-surface px-3 text-fg"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={disabled}>
              Set
            </Button>
          </form>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Letting staff go costs a month of their wage each.</p>
      {branch.competitors.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-fg">Competitors here</h4>
          <ul className="mt-1 divide-y divide-border text-sm">
            {branch.competitors.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg">{c.name}</span>{' '}
                  <span className="text-muted">
                    · {c.size} outlet{c.size === 1 ? '' : 's'} · quality{' '}
                    {Math.round(c.quality / 10)} · price {c.pricePercent}%
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || c.priceMinor > company.cashMinor}
                  aria-label={`Buy for ${formatMoney(c.priceMinor, company.currency)}: ${c.name}`}
                  onClick={() =>
                    void send({
                      type: 'acquireCompetitor',
                      businessId: company.id,
                      competitorId: c.id,
                    })
                  }
                >
                  Buy for {formatMoney(c.priceMinor, company.currency)}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Buying a competitor is paid from company cash; its outlets join this branch.
          </p>
        </div>
      )}
      {company.branches.length > 1 && (
        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setClosing(true);
          }}
        >
          Close this branch
        </Button>
      )}
      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title="Close this branch?"
        confirmLabel="Close branch"
        tone="danger"
        onConfirm={() => send({ type: 'closeBranch', businessId: company.id, branchId: branch.id })}
      >
        Staff are paid a month&rsquo;s wage each and the premises are given up.
      </ConfirmDialog>
    </Card>
  );
}

function ManageCard({
  company,
  enterprise,
  view,
}: {
  company: CompanyView;
  enterprise: EnterpriseView;
  view: GameView;
}) {
  const { send, disabled } = useAct();
  const branchId = useId();
  const termId = useId();
  const [branchLocation, setBranchLocation] = useState(
    enterprise.business.locations.find((l) => !company.branches.some((b) => b.locationId === l.id))
      ?.id ?? '',
  );
  const [term, setTerm] = useState(36);
  const [confirm, setConfirm] = useState<'sell' | 'close' | null>(null);
  const [percent, setPercent] = useState(20);
  const cur = company.currency;
  const playerCur = { ...view.country.currency };
  return (
    <>
      <Card title="How it is run">
        <div className="flex flex-col gap-4">
          <StatBar label="Quality" value={company.quality} />
          <StatBar label="Reputation" value={company.brand} />
          <ChoiceGroup
            legend="Supplier"
            name={`supplier-${company.id}`}
            value={company.supplier}
            disabled={disabled}
            onChange={(supplier) =>
              void send({ type: 'setSupplier', businessId: company.id, supplier })
            }
            options={(['budget', 'standard', 'premium'] as const).map((s) => ({
              value: s,
              label: t(`supplier.${s}`),
              description: t(`supplier.${s}.desc`),
            }))}
          />
          <ChoiceGroup
            legend="Management"
            name={`manager-${company.id}`}
            value={company.manager}
            disabled={disabled}
            onChange={(manager) =>
              void send({ type: 'setManager', businessId: company.id, manager })
            }
            options={(['owner', 'hired'] as const).map((m) => ({
              value: m,
              label: t(`manager.${m}`),
              description: t(`manager.${m}.desc`),
            }))}
          />
          <div>
            <p className="text-sm text-fg">
              Marketing: <Money minor={company.marketingMinor} currency={cur} /> a month
            </p>
            <AmountForm
              label="New monthly marketing budget"
              currency={cur}
              submitLabel="Set"
              disabled={disabled}
              onSubmit={(minor) =>
                send({ type: 'setMarketing', businessId: company.id, amountMinor: minor })
              }
            />
            {company.marketingMinor > 0n && (
              <Button
                className="mt-2"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  void send({ type: 'setMarketing', businessId: company.id, amountMinor: '0' })
                }
              >
                Stop marketing
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Card title="Grow">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={branchId} className="text-sm font-medium text-fg">
              Open a branch in
            </label>
            <select
              id={branchId}
              value={branchLocation}
              onChange={(e) => {
                setBranchLocation(e.target.value);
              }}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
            >
              {enterprise.business.locations
                .filter((l) => !company.branches.some((b) => b.locationId === l.id))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}, {l.countryName}
                  </option>
                ))}
            </select>
          </div>
          <Button
            variant="secondary"
            disabled={disabled || branchLocation === ''}
            onClick={() =>
              void send({ type: 'openBranch', businessId: company.id, locationId: branchLocation })
            }
          >
            Open branch
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Set-up is paid from company cash. Branches abroad trade in local currency at simulated
          exchange rates.
        </p>
      </Card>
      <Card title="Money and ownership">
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-6 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Cash</dt>
              <dd>
                <Money minor={company.cashMinor} currency={cur} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Debts</dt>
              <dd>
                <Money minor={company.debtMinor} currency={cur} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Book value</dt>
              <dd>
                <Money minor={company.bookEquityMinor} currency={cur} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Estimated sale value</dt>
              <dd>
                <Money minor={company.valuationMinor} currency={cur} />
              </dd>
            </div>
          </dl>
          <div>
            <h3 className="text-sm font-semibold text-fg">Owners</h3>
            <ul className="mt-1 text-sm">
              {company.owners.map((o) => (
                <li key={o.name}>
                  {o.isYou ? 'You' : o.name}: {formatBp(o.sharesBp)}
                </li>
              ))}
            </ul>
          </div>
          <AmountForm
            label="Put in more of your money"
            currency={{ ...playerCur }}
            submitLabel="Invest"
            disabled={disabled}
            onSubmit={(minor) =>
              send({ type: 'investBusiness', businessId: company.id, amountMinor: minor })
            }
          />
          <AmountForm
            label="Pay a dividend to the owners"
            currency={cur}
            submitLabel="Pay"
            disabled={disabled}
            onSubmit={(minor) =>
              send({ type: 'payDividend', businessId: company.id, amountMinor: minor })
            }
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-fg">
              Sell new shares to an investor
              <select
                value={percent}
                onChange={(e) => {
                  setPercent(Number(e.target.value));
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              >
                {[5, 10, 20, 30, 40, 49].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              disabled={disabled || !company.canRaise}
              onClick={() =>
                void send({ type: 'raiseInvestment', businessId: company.id, percent })
              }
            >
              Raise investment
            </Button>
          </div>
          {!company.canRaise && (
            <p className="text-xs text-muted">
              Investors want six months of trading with an overall profit first.
            </p>
          )}
          <div>
            <h3 className="text-sm font-semibold text-fg">Business loans</h3>
            {company.loans.map((l) => (
              <div key={l.id} className="mt-2 text-sm">
                <p className="text-fg">
                  Owed <Money minor={l.balance} currency={cur} /> · {formatBp(l.rateBp)} ·{' '}
                  <Money minor={l.paymentMinor} currency={cur} /> a month
                </p>
                <AmountForm
                  label="Repay early"
                  currency={cur}
                  submitLabel="Repay"
                  disabled={disabled}
                  onSubmit={(minor) =>
                    send({
                      type: 'repayBusinessLoan',
                      businessId: company.id,
                      loanId: l.id,
                      amountMinor: minor,
                    })
                  }
                />
              </div>
            ))}
            <p className="mt-2 text-xs text-muted">
              The bank lends up to {formatMoney(company.loanLimitMinor, cur)} in total, and nothing
              while bills are unpaid.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label htmlFor={termId} className="sr-only">
                Loan term
              </label>
              <select
                id={termId}
                value={term}
                onChange={(e) => {
                  setTerm(Number(e.target.value));
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              >
                {[12, 24, 36, 60].map((m) => (
                  <option key={m} value={m}>
                    over {m} months
                  </option>
                ))}
              </select>
            </div>
            <AmountForm
              label="Borrow"
              currency={cur}
              submitLabel="Take loan"
              disabled={disabled}
              onSubmit={(minor) =>
                send({
                  type: 'businessLoan',
                  businessId: company.id,
                  amountMinor: minor,
                  termMonths: term,
                })
              }
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                setConfirm('sell');
              }}
            >
              Sell the company
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setConfirm('close');
              }}
            >
              Close the company
            </Button>
          </div>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm === 'sell'}
        onOpenChange={(o) => {
          setConfirm(o ? 'sell' : null);
        }}
        title={`Sell ${company.name}?`}
        confirmLabel="Sell"
        onConfirm={() => send({ type: 'sellBusiness', businessId: company.id })}
      >
        A buyer will pay around {formatMoney(company.valuationMinor, cur)} for the whole company
        (the final price depends on the deal). Each owner receives their share.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(o) => {
          setConfirm(o ? 'close' : null);
        }}
        title={`Close ${company.name}?`}
        confirmLabel="Close"
        tone="danger"
        onConfirm={() => send({ type: 'closeBusiness', businessId: company.id })}
      >
        Staff are paid off, debts are settled from the company&rsquo;s cash, and what is left is
        returned to the owners.
      </ConfirmDialog>
    </>
  );
}

export function BusinessDetailScreen() {
  const { businessId = '' } = useParams();
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const base = `/play/${session.saveId}`;
  const company = view.enterprise.business.companies.find((c) => c.id === businessId);
  const back = (
    <Link
      to={`${base}/business`}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4" /> Business
    </Link>
  );
  if (!company) {
    const past = view.enterprise.business.past.find((p) => p.id === businessId);
    return (
      <div className="flex flex-col gap-3">
        {back}
        <PageHeader title={past?.name ?? 'Company'} />
        <p className="text-fg">
          {past
            ? `This company is ${t(`businessStatus.${past.status}`).toLowerCase()}.`
            : 'You do not own this company.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {back}
      <PageHeader
        title={company.name}
        description={`${company.typeName} · founded ${month(view, company.foundedTick)} · you own ${formatBp(company.yourSharesBp)}`}
      />
      {company.distressMonths > 0 && (
        <p
          role="alert"
          className="rounded-2xl border border-border bg-surface-2 p-3 text-sm text-danger"
        >
          The company could not pay all its bills for {company.distressMonths} month
          {company.distressMonths === 1 ? '' : 's'}. After six it will fail. Put in money, cut costs
          or raise prices.
        </p>
      )}
      <StatementCard company={company} view={view} />
      {company.branches.map((b) => (
        <BranchCard key={b.id} company={company} branch={b} />
      ))}
      <ManageCard company={company} enterprise={view.enterprise} view={view} />
    </div>
  );
}
