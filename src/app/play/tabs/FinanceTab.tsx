import { useId, useState } from 'react';
import { Link } from 'react-router';
import { amortisedPayment } from '@engine/core/money';
import { HOME_SIZES, LIFESTYLES } from '@engine/state/schema';
import type { GameView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { AmountForm, Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { cn } from '@app/lib/cn';
import {
  countryName,
  formatBp,
  formatMoney,
  formatShortMonth,
  toMinorString,
  transactionText,
} from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';
import { ActionButton } from '../ActionButton';

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  return { send, disabled: busy || pending || !alive };
}

const month = (view: GameView, tick: number) => formatShortMonth(tickToMonth(view, tick));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

function OverviewCard({ view }: { view: GameView }) {
  const f = view.finance;
  const cur = f.currency;
  const household = f.household;
  return (
    <Card title="Overview">
      <dl className="grid gap-x-8 text-sm sm:grid-cols-2">
        {f.personal && (
          <Row label="Your net worth">{<Money minor={f.personal.netWorth} currency={cur} />}</Row>
        )}
        {f.netIncomeMinor > 0n && (
          <Row label="Your take-home pay">{<Money minor={f.netIncomeMinor} currency={cur} />}</Row>
        )}
        {f.personal && view.character.age.years >= 18 && (
          <Row label="Credit rating">{`${String(Math.round(f.personal.creditScore / 10))} / 100`}</Row>
        )}
        {f.arrears > 0n && (
          <Row label="Overdue bills">
            {<Money minor={f.arrears} currency={cur} className="text-danger" />}
          </Row>
        )}
        {f.benefits.months > 0 && (
          <Row label="Unemployment benefit">
            <Money minor={f.benefits.amountMinor} currency={cur} /> a month, {f.benefits.months}{' '}
            more months
          </Row>
        )}
      </dl>
      {household && !household.isHead && (
        <p className="mt-3 text-sm text-muted">
          You live with your family, who pay the household bills. Their savings:{' '}
          <Money minor={household.checking + household.savings} currency={cur} />. This month they
          took in <Money minor={household.monthIncome} currency={cur} /> and spent{' '}
          <Money minor={household.monthExpenses} currency={cur} /> (including tax).
        </p>
      )}
    </Card>
  );
}

function AccountsCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const f = view.finance;
  const p = f.personal;
  const cur = { ...f.currency };
  const [direction, setDirection] = useState<'checking' | 'savings'>('checking');
  if (!p) return null;
  return (
    <Card title="Your accounts">
      <dl className="text-sm">
        {p.checking !== null && (
          <Row label="Current account">{<Money minor={p.checking} currency={cur} />}</Row>
        )}
        {p.savings !== null && (
          <Row label={`Savings (${formatBp(p.savingsRateBp)} a year)`}>
            {<Money minor={p.savings} currency={cur} />}
          </Row>
        )}
        {p.retirement !== null && (
          <Row label="Retirement fund">{<Money minor={p.retirement} currency={cur} />}</Row>
        )}
        {p.liabilities > 0n && (
          <Row label="Debts">
            {<Money minor={p.liabilities} currency={cur} className="text-danger" />}
          </Row>
        )}
      </dl>
      {p.checking === null && (
        <p className="mt-2 text-sm text-muted">
          Your first current account opens at 16. Birthday money goes into your savings.
        </p>
      )}
      {p.checking !== null && p.savings !== null && (
        <div className="mt-4 flex flex-col gap-3">
          <ChoiceGroup
            legend="Move money"
            name="transfer-direction"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'checking', label: 'To savings' },
              { value: 'savings', label: 'To current account' },
            ]}
          />
          <AmountForm
            label="Amount"
            currency={cur}
            submitLabel="Move"
            disabled={disabled}
            onSubmit={(minor) => send({ type: 'transfer', from: direction, amountMinor: minor })}
          />
        </div>
      )}
    </Card>
  );
}

function CashFlowCard({ view }: { view: GameView }) {
  const f = view.finance;
  const cur = f.currency;
  const history = f.history.slice(-12);
  const max = history.reduce(
    (m, h) => (h.income > m ? h.income : h.expenses > m ? h.expenses : m),
    1n,
  );
  const scale = (v: bigint) => Number((v * 100n) / max);
  return (
    <Card title="Money this month" description={`Booked in ${month(view, f.month.tick)}.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-fg">Income</h3>
          {f.month.income.length === 0 ? (
            <p className="text-sm text-muted">None this month.</p>
          ) : (
            <dl className="text-sm">
              {f.month.income.map((i) => (
                <Row key={i.category} label={t(`category.${i.category}`)}>
                  <Money minor={i.amount} currency={cur} />
                </Row>
              ))}
            </dl>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-fg">Spending</h3>
          {f.month.expenses.length === 0 ? (
            <p className="text-sm text-muted">None this month.</p>
          ) : (
            <dl className="text-sm">
              {f.month.expenses.map((i) => (
                <Row key={i.category} label={t(`category.${i.category}`)}>
                  <Money minor={i.amount} currency={cur} />
                </Row>
              ))}
            </dl>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-fg">
        Net this month:{' '}
        <Money minor={f.month.totalIncome - f.month.totalExpenses} currency={cur} signed />
      </p>
      {history.length > 1 && (
        <figure className="mt-4">
          <figcaption className="text-sm font-semibold text-fg">
            The last {history.length} months
          </figcaption>
          <div aria-hidden="true" className="mt-2 flex h-28 items-end gap-1">
            {history.map((h) => (
              <div
                key={h.tick}
                className="flex h-full flex-1 items-end gap-0.5"
                title={month(view, h.tick)}
              >
                <div
                  className="w-1/2 rounded-t bg-success/70"
                  style={{ height: `${String(scale(h.income))}%` }}
                />
                <div
                  className="w-1/2 rounded-t bg-danger/60"
                  style={{ height: `${String(scale(h.expenses))}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Green: income. Red: spending.</p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-primary">Show as a table</summary>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Income</th>
                  <th scope="col">Spending</th>
                  <th scope="col">Net worth</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.tick}>
                    <td>{month(view, h.tick)}</td>
                    <td>{formatMoney(h.income, cur)}</td>
                    <td>{formatMoney(h.expenses, cur)}</td>
                    <td>{formatMoney(h.netWorth, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      )}
    </Card>
  );
}

function TaxCard({ view }: { view: GameView }) {
  const f = view.finance;
  if (!f.taxYear || f.taxYear.gross === 0n) return null;
  const cur = f.currency;
  return (
    <Card
      title="Tax this year"
      description={`Tax is taken from your pay each month and checked at the end of the tax year (it starts in month ${String(f.taxYear.yearStartMonth)}).`}
    >
      <dl className="text-sm">
        <Row label="Earned">{<Money minor={f.taxYear.gross} currency={cur} />}</Row>
        <Row label="Income tax paid">{<Money minor={f.taxYear.withheld} currency={cur} />}</Row>
        <Row label="Social contributions">{<Money minor={f.taxYear.social} currency={cur} />}</Row>
      </dl>
    </Card>
  );
}

function LoansCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const f = view.finance;
  const cur = f.currency;
  const amountId = useId();
  const termId = useId();
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState(36);
  const adult = view.character.age.years >= 18;
  const minor = toMinorString(amount, cur);
  const payment = minor ? amortisedPayment(BigInt(minor), f.personalLoanRateBp, term) : null;
  const tooMuch =
    payment !== null &&
    (f.loanPaymentsMinor + payment) * 100n > f.netIncomeMinor * BigInt(f.debtLimitPercent);
  if (!adult && f.loans.length === 0) return null;
  return (
    <Card title="Loans">
      {f.loans.length === 0 ? (
        <p className="text-sm text-muted">You have no loans.</p>
      ) : (
        <ul className="divide-y divide-border">
          {f.loans.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 py-3 text-sm">
              <p className="font-semibold text-fg">{t(`loan.${l.product}`)}</p>
              <p className="text-muted">
                {l.product === 'student' && l.balance === 0n ? (
                  'Open for tuition'
                ) : (
                  <>
                    Owed <Money minor={l.balance} currency={l.currency} />
                  </>
                )}{' '}
                · {formatBp(l.rateBp)} a year
                {l.paymentMinor > 0n && (
                  <>
                    {' · '}
                    <Money minor={l.paymentMinor} currency={l.currency} /> a month
                  </>
                )}
                {l.firstPaymentTick > view.tick &&
                  ` · repayments start ${month(view, l.firstPaymentTick)}`}
                {l.missedPayments > 0 && ` · ${String(l.missedPayments)} missed`}
              </p>
              <AmountForm
                label="Pay off"
                currency={l.currency}
                submitLabel="Repay"
                disabled={disabled || f.personal?.checking === null || l.balance === 0n}
                onSubmit={(m) => send({ type: 'repayLoan', loanId: l.id, amountMinor: m })}
              />
            </li>
          ))}
        </ul>
      )}
      {adult && (
        <form
          className="mt-4 flex flex-col gap-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (minor) void send({ type: 'takeLoan', amountMinor: minor, termMonths: term });
          }}
        >
          <h3 className="text-sm font-semibold text-fg">Borrow</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={amountId} className="text-sm text-fg">
                Amount ({cur.symbol})
              </label>
              <input
                id={amountId}
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
                className="h-11 w-40 rounded-xl border border-border bg-surface px-3 text-fg"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={termId} className="text-sm text-fg">
                Over
              </label>
              <select
                id={termId}
                value={term}
                onChange={(e) => {
                  setTerm(Number(e.target.value));
                }}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
              >
                {[12, 24, 36, 60, 84, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={disabled || !minor || f.netIncomeMinor <= 0n}
            >
              Take the loan
            </Button>
          </div>
          <p className="text-xs text-muted">
            Rate offered: {formatBp(f.personalLoanRateBp)} a year.
            {payment !== null && (
              <>
                {' '}
                Repayments: <Money minor={payment} currency={cur} /> a month.
              </>
            )}
            {f.netIncomeMinor <= 0n && ' Lenders need you to have a regular income.'}
            {tooMuch &&
              ` Repayments would be over ${String(f.debtLimitPercent)}% of your take-home pay, so a lender would refuse.`}
          </p>
        </form>
      )}
    </Card>
  );
}

function InsuranceCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const f = view.finance;
  const cur = f.currency;
  if (view.character.age.years < 18) return null;
  const active = f.policies.filter((p) => p.status === 'active');
  const hasHealth = active.some((p) => p.type === 'health');
  const hasLife = active.some((p) => p.type === 'life');
  return (
    <Card
      title="Insurance"
      description="Health insurance pays most of what public healthcare does not. Life insurance pays your household if you die."
    >
      {f.policies.length > 0 && (
        <ul className="mb-3 divide-y divide-border text-sm">
          {f.policies.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="flex-1">
                <span className="font-medium text-fg">{t(`policy.${p.type}`)}</span>{' '}
                <span className="text-muted">
                  · <Money minor={p.premiumMinor} currency={cur} /> a month
                  {p.coverageMinor > 0n && (
                    <>
                      {' · cover '}
                      <Money minor={p.coverageMinor} currency={cur} />
                    </>
                  )}{' '}
                  · {t(`policyStatus.${p.status}`)}
                </span>
              </span>
              {p.status === 'active' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void send({ type: 'cancelInsurance', policyId: p.id })}
                  aria-label={`Cancel ${t(`policy.${p.type}`)}`}
                >
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || hasHealth || f.personal?.checking === null}
          onClick={() =>
            void send({ type: 'buyInsurance', policyType: 'health', coverageMinor: '0' })
          }
        >
          Health insurance ({formatMoney(f.quotes.healthPremiumMinor, cur)} a month)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || hasLife || f.personal?.checking === null}
          onClick={() =>
            void send({
              type: 'buyInsurance',
              policyType: 'life',
              coverageMinor: f.quotes.lifeCoverageMinor.toString(),
            })
          }
        >
          Life cover of {formatMoney(f.quotes.lifeCoverageMinor, cur)} (
          {formatMoney(f.quotes.lifePremiumMinor, cur)} a month)
        </Button>
      </div>
      {f.personal?.checking === null && (
        <p className="mt-2 text-xs text-muted">You need a current account first.</p>
      )}
    </Card>
  );
}

function RetirementCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const f = view.finance;
  const cur = f.currency;
  const selectId = useId();
  const [confirmLump, setConfirmLump] = useState(false);
  const p = f.retirementPayout;
  if (!f.personal || view.character.age.years < 16) return null;
  return (
    <Card title="Retirement">
      <dl className="text-sm">
        <Row label="Retirement fund">
          {<Money minor={f.personal.retirement ?? 0n} currency={cur} />}
        </Row>
        <Row label="State pension from">{`age ${String(f.statePensionAge)}`}</Row>
        <Row label="State pension so far (estimate)">
          {
            <>
              <Money minor={f.statePensionEstimateMinor} currency={cur} /> a month
            </>
          }
        </Row>
      </dl>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-sm font-medium text-fg">
            Extra saving from your salary
          </label>
          <select
            id={selectId}
            value={f.personal.pensionBp}
            disabled={disabled}
            onChange={(e) => void send({ type: 'setPension', bp: Number(e.target.value) })}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {[0, 300, 500, 800, 1000, 1500, 2000].map((bp) => (
              <option key={bp} value={bp}>
                {formatBp(bp)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        Pension contributions are taken before you are paid and grow with the market.
      </p>

      <div className="mt-4 border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-fg">Taking money out</h3>
        <p className="mt-1 text-sm text-muted">
          {p.retired ? (
            <>
              You are retired: the fund pays you about{' '}
              <Money minor={p.monthlyMinor} currency={cur} /> a month into your current account,
              spread so it lasts until you are 90. What is left keeps growing with the market.
            </>
          ) : (
            <>
              The fund pays you a monthly income once you retire (Career tab, from age 55): about{' '}
              <Money minor={p.monthlyMinor} currency={cur} /> a month if you retired now, spread so
              it lasts until you are 90.
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-muted">
          From age {p.lumpSumAge} you can also take {p.lumpSumPercent}% of the fund as cash, once in
          your life, tax-free, whether or not you have retired.
        </p>
        <div className="mt-2 flex flex-col gap-1">
          <ActionButton
            size="sm"
            variant="secondary"
            className="self-start"
            busy={disabled}
            reason={p.lumpSumBlock}
            onAct={() => {
              setConfirmLump(true);
            }}
          >
            {`Take ${String(p.lumpSumPercent)}% as cash${
              p.lumpSumBlock === null ? ` (${formatMoney(p.lumpSumMinor, cur)})` : ''
            }`}
          </ActionButton>
          {p.lumpSumBlock && <p className="text-xs text-muted">{p.lumpSumBlock}</p>}
        </div>
      </div>
      <ConfirmDialog
        open={confirmLump}
        onOpenChange={setConfirmLump}
        title="Take a lump sum?"
        confirmLabel="Take the cash"
        onConfirm={() => send({ type: 'takePensionLumpSum' })}
      >
        {formatMoney(p.lumpSumMinor, cur)} moves from your retirement fund to your current account.
        You can only do this once, and your monthly retirement income will be smaller.
      </ConfirmDialog>
    </Card>
  );
}

function HomeCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const f = view.finance;
  const cur = f.currency;
  const h = f.household;
  const [moving, setMoving] = useState<(typeof HOME_SIZES)[number] | null>(null);
  const [goingHome, setGoingHome] = useState(false);
  return (
    <Card title="Home and lifestyle">
      {h && (
        <dl className="text-sm">
          <Row label="Home">{`${t(`homeSize.${h.homeSize}`)} · ${t(`housing.${h.housing}`)}`}</Row>
          {h.housing === 'rented' && (
            <Row label="Rent">
              {
                <>
                  <Money minor={h.rentMinor} currency={cur} /> a month
                </>
              }
            </Row>
          )}
          <Row label="Living costs">
            {
              <>
                <Money minor={h.livingCostsMinor} currency={cur} /> a month
              </>
            }
          </Row>
        </dl>
      )}
      {h?.isHead ? (
        <div className="mt-3">
          <ChoiceGroup
            legend="Lifestyle"
            description="How much your household spends on everyday life."
            name="lifestyle"
            value={h.lifestyle as (typeof LIFESTYLES)[number]}
            disabled={disabled}
            options={LIFESTYLES.map((l) => ({
              value: l,
              label: t(`lifestyle.${l}`),
              description: t(`lifestyle.${l}.desc`),
            }))}
            onChange={(value) => void send({ type: 'setLifestyle', value })}
          />
          {f.canMoveHome && (
            <Button
              className="mt-3"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setGoingHome(true);
              }}
            >
              Move back in with family
            </Button>
          )}
        </div>
      ) : h ? (
        <p className="mt-2 text-sm text-muted">
          Your family chooses how the household lives ({t(`lifestyle.${h.lifestyle}`).toLowerCase()}
          ).
        </p>
      ) : null}
      {f.canMoveOut && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-fg">Move out</h3>
          <p className="text-sm text-muted">
            Rent a place of your own. You need two months of rent saved.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {HOME_SIZES.map((size) => (
              <li key={size}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    setMoving(size);
                  }}
                >
                  {t(`homeSize.${size}`)} · {formatMoney(f.moveOutRents[size], cur)} a month
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.character.age.years < 18 && (
        <p className="mt-2 text-sm text-muted">You can move out from 18.</p>
      )}
      <ConfirmDialog
        open={moving !== null}
        onOpenChange={(o) => {
          if (!o) setMoving(null);
        }}
        title="Move out?"
        confirmLabel="Move out"
        onConfirm={() => (moving ? send({ type: 'moveOut', size: moving }) : undefined)}
      >
        You will pay {moving ? formatMoney(f.moveOutRents[moving], cur) : ''} rent a month plus your
        own living costs. A partner you are engaged or married to moves with you.
      </ConfirmDialog>
      <ConfirmDialog
        open={goingHome}
        onOpenChange={setGoingHome}
        title="Move back home?"
        confirmLabel="Move back"
        onConfirm={() => send({ type: 'moveHome' })}
      >
        You will stop paying rent and live with your family again.
      </ConfirmDialog>
    </Card>
  );
}

function TransactionsCard({ view }: { view: GameView }) {
  const f = view.finance;
  if (f.transactions.length === 0) return null;
  return (
    <Card title="Recent transactions">
      <ul className="divide-y divide-border text-sm">
        {f.transactions.slice(0, 25).map((tx) => (
          <li key={tx.id} className="flex justify-between gap-3 py-1.5">
            <span className="text-fg">
              {transactionText(tx.kind, tx.params)}{' '}
              <span className="text-xs text-muted">{month(view, tx.tick)}</span>
            </span>
            <Money minor={tx.amount} currency={f.currency} signed />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EconomyCard({ view }: { view: GameView }) {
  const e = view.finance.economy;
  return (
    <Card
      title={`The economy in ${countryName(view.character.countryCode)}`}
      description="Simulated from approximate figures for 2024-2025; later values are the game's own."
    >
      <dl className="grid gap-x-8 text-sm sm:grid-cols-2">
        <Row label="Inflation (last year)">{formatBp(e.inflationBp)}</Row>
        <Row label="Unemployment">{formatBp(e.unemploymentBp)}</Row>
        <Row label="Central bank rate">{formatBp(e.policyRateBp)}</Row>
        <Row label="Typical monthly wage">
          {<Money minor={e.medianWageMinor} currency={view.finance.currency} />}
        </Row>
      </dl>
      <div className="mt-2">
        <StatBar label="Economic outlook" value={Math.round((e.cycle + 100) * 5)} />
      </div>
    </Card>
  );
}

function InvestmentsCard({ view }: { view: GameView }) {
  const { send, disabled } = useAct();
  const inv = view.enterprise.investments;
  const cur = { ...view.finance.currency };
  const [fund, setFund] = useState<'stocks' | 'bonds'>('stocks');
  const [term, setTerm] = useState<12 | 60 | 120>(60);
  const [selling, setSelling] = useState<(typeof inv.bonds)[number] | null>(null);
  if (view.character.age.years < 18) return null;
  return (
    <Card
      title="Investments"
      description="Index funds whose prices are simulated each month. Values can fall as well as rise."
    >
      <dl className="text-sm">
        <Row label={t('fund.stocks')}>{<Money minor={inv.stocksMinor} currency={cur} />}</Row>
        <GainLine value={inv.stocksMinor} cost={inv.stocksCostMinor} cur={cur} />
        <Row label={t('fund.bonds')}>{<Money minor={inv.bondsMinor} currency={cur} />}</Row>
        <GainLine value={inv.bondsMinor} cost={inv.bondsCostMinor} cur={cur} />
      </dl>
      <div className="mt-3 flex flex-col gap-3">
        <ChoiceGroup
          legend="Fund"
          name="fund"
          value={fund}
          onChange={setFund}
          options={[
            {
              value: 'stocks',
              label: t('fund.stocks'),
              description: 'Higher growth, bigger swings.',
            },
            {
              value: 'bonds',
              label: t('fund.bonds'),
              description: 'Steadier, follows interest rates.',
            },
          ]}
        />
        <AmountForm
          label="Invest"
          currency={cur}
          submitLabel="Buy"
          disabled={disabled}
          onSubmit={(minor) => send({ type: 'buyFund', fund, amountMinor: minor })}
        />
        <AmountForm
          label="Sell"
          currency={cur}
          submitLabel="Sell"
          disabled={disabled}
          onSubmit={(minor) => send({ type: 'sellFund', fund, amountMinor: minor })}
        />
      </div>

      <div className="mt-5 border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-fg">Government bonds</h3>
        <p className="mt-1 text-sm text-muted">
          Lend money to the government for a fixed time at a fixed rate. You get interest every
          month and your money back at the end. Selling early pays today&apos;s price: less if
          interest rates have risen since you bought, more if they have fallen.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <ChoiceGroup
            legend="Term"
            name="bond-term"
            value={String(term)}
            onChange={(v) => {
              setTerm(Number(v) as 12 | 60 | 120);
            }}
            options={inv.bondOffers.map((o) => ({
              value: String(o.termMonths),
              label: `${String(o.termMonths / 12)} year${o.termMonths === 12 ? '' : 's'}`,
              description: `${formatBp(o.yieldBp)} a year, fixed`,
            }))}
          />
          <AmountForm
            label="Buy bonds"
            currency={cur}
            submitLabel="Buy bonds"
            disabled={disabled}
            onSubmit={(minor) => send({ type: 'buyBond', termMonths: term, amountMinor: minor })}
          />
        </div>
        {inv.bonds.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {inv.bonds.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    <Money minor={b.faceMinor} currency={cur} />, {String(b.termMonths / 12)}-year
                    at {formatBp(b.couponBp)}
                  </p>
                  <p className="text-xs text-muted">
                    Pays <Money minor={b.monthlyInterestMinor} currency={cur} /> a month · repaid{' '}
                    {month(view, b.maturityTick)} · worth{' '}
                    <Money minor={b.saleValueMinor} currency={cur} /> if sold now
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    setSelling(b);
                  }}
                >
                  Sell
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={selling !== null}
        onOpenChange={(o) => {
          if (!o) setSelling(null);
        }}
        title="Sell this bond early?"
        confirmLabel="Sell"
        onConfirm={() => (selling ? send({ type: 'sellBond', accountId: selling.id }) : undefined)}
      >
        You get {selling ? formatMoney(selling.saleValueMinor, cur) : ''} now instead of{' '}
        {selling ? formatMoney(selling.faceMinor, cur) : ''} at the end, and the monthly interest
        stops.
      </ConfirmDialog>
    </Card>
  );
}

/** "Put in £X · up £Y (+Z%)" under a fund; nothing for holdings bought before this was tracked. */
function GainLine({
  value,
  cost,
  cur,
}: {
  value: bigint;
  cost: bigint | null;
  cur: GameView['finance']['currency'];
}) {
  if (cost === null || cost === 0n) return null;
  const gain = value - cost;
  const percent = Number((gain * 1000n) / cost) / 10;
  return (
    <p className={cn('-mt-1 mb-1 text-right text-xs', gain < 0n ? 'text-danger' : 'text-muted')}>
      Put in <Money minor={cost} currency={cur} /> · {gain < 0n ? 'down' : 'up'}{' '}
      <Money minor={gain < 0n ? -gain : gain} currency={cur} /> ({gain < 0n ? '' : '+'}
      {percent.toFixed(1)}%)
    </p>
  );
}

function AssetsLinksCard({ view, base }: { view: GameView; base: string }) {
  const e = view.enterprise;
  const cur = view.finance.currency;
  return (
    <Card title="Property and companies">
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <Link
            to={`${base}/property`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Property
          </Link>{' '}
          <span className="text-muted">
            ·{' '}
            {e.property.owned.length === 0
              ? 'none owned'
              : `${String(e.property.owned.length)} owned, worth ${formatMoney(
                  e.property.owned.reduce((s, p) => s + p.valueMinor, 0n),
                  cur,
                )}`}
          </span>
        </li>
        <li>
          <Link
            to={`${base}/business`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Business
          </Link>{' '}
          <span className="text-muted">
            ·{' '}
            {e.business.companies.length === 0
              ? 'no companies'
              : `${String(e.business.companies.length)} compan${e.business.companies.length === 1 ? 'y' : 'ies'}`}
          </span>
        </li>
      </ul>
    </Card>
  );
}

export function FinanceTab() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Finance"
        description="Every amount here comes from a balanced ledger of real transactions in your life."
      />
      <OverviewCard view={view} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountsCard view={view} />
        <HomeCard view={view} />
      </div>
      <CashFlowCard view={view} />
      <TaxCard view={view} />
      <div className="grid gap-4 lg:grid-cols-2">
        <LoansCard view={view} />
        <InsuranceCard view={view} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <InvestmentsCard view={view} />
        <AssetsLinksCard view={view} base={`/play/${session.saveId}`} />
      </div>
      <RetirementCard view={view} />
      <TransactionsCard view={view} />
      <EconomyCard view={view} />
    </div>
  );
}
