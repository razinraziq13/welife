import { useId, useState } from 'react';
import type { GameView } from '@engine/view';
import { AmountForm, Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { t } from '@app/i18n/en';
import { formatShortMonth } from '@app/i18n/format';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from './widgets';

type Investment = GameView['enterprise']['investments']['markets'][number];
const PERIODS = [6, 12, 24] as const;
const indexFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const changeFormat = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

function indexValue(indexBp: number): string {
  return indexFormat.format(indexBp / 100);
}

function changeText(from: number, to: number): string {
  return changeFormat.format((to - from) / from);
}

function changeTone(change: number): string {
  return change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-muted';
}

export function MarketMovement({ market }: { market: Investment }) {
  const [prior, latest] = market.history.slice(-2);
  if (!prior || !latest) return <span className="text-muted">No history yet</span>;
  return (
    <span className={cn('tabular-nums', changeTone(latest.indexBp - prior.indexBp))}>
      {changeText(prior.indexBp, latest.indexBp)}
    </span>
  );
}

function MarketChart({ market, view }: { market: Investment; view: GameView }) {
  const headingId = useId();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(12);
  const latest = market.history.at(-1);
  if (!latest) return null;
  const prior = market.history.at(-2);
  const history = market.history.filter((point) => point.tick >= latest.tick - period);
  const first = history[0] ?? latest;
  const date = (tick: number) => formatShortMonth(tickToMonth(view, tick));
  const width = 440;
  const height = 128;
  const padding = 8;
  const min = Math.min(...history.map((point) => point.indexBp));
  const max = Math.max(...history.map((point) => point.indexBp));
  const spread = Math.max(100, max - min);
  const midpoint = (max + min) / 2;
  const points = history.map((point) => ({
    ...point,
    x:
      padding +
      ((point.tick - first.tick) / Math.max(1, latest.tick - first.tick)) * (width - 2 * padding),
    y: height / 2 - ((point.indexBp - midpoint) / spread) * (height - 2 * padding),
  }));

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-surface-2 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={headingId} className="text-sm font-semibold text-fg">
            {t(`fund.${market.id}`)} price history
          </h3>
          <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
            {indexValue(latest.indexBp)}{' '}
            <span className="text-sm font-normal text-muted">index points</span>
          </p>
          {prior && (
            <p className={cn('text-sm tabular-nums', changeTone(latest.indexBp - prior.indexBp))}>
              {changeText(prior.indexBp, latest.indexBp)} this month
            </p>
          )}
        </div>
        {prior && (
          <div role="group" aria-label="Chart period" className="flex flex-wrap gap-1">
            {PERIODS.map((months) => (
              <Button
                key={months}
                type="button"
                size="sm"
                variant={months === period ? 'secondary' : 'ghost'}
                aria-pressed={months === period}
                onClick={() => {
                  setPeriod(months);
                }}
              >
                {months} months
              </Button>
            ))}
          </div>
        )}
      </div>
      {history.length < 2 ? (
        <p className="mt-3 text-sm text-muted">
          Advance time to see the market move. History starts when the game begins tracking this
          market.
        </p>
      ) : (
        <>
          <figure className="mt-3">
            <div className="flex justify-between gap-2 text-xs text-muted tabular-nums">
              <span>Low {indexValue(min)}</span>
              <span>High {indexValue(max)}</span>
            </div>
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${String(width)} ${String(height)}`}
              className="my-1 h-32 w-full rounded-lg bg-surface"
              preserveAspectRatio="none"
            >
              {[padding, height / 2, height - padding].map((y) => (
                <line
                  key={y}
                  x1={padding}
                  x2={width - padding}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {points.slice(1).map((point, i) => {
                const before = points[i];
                if (!before) return null;
                return (
                  <line
                    key={point.tick}
                    x1={before.x}
                    x2={point.x}
                    y1={before.y}
                    y2={point.y}
                    stroke="currentColor"
                    className={changeTone(point.indexBp - before.indexBp)}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            <figcaption className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
              <span>
                {date(first.tick)} to {date(latest.tick)}
              </span>
              <span className={changeTone(latest.indexBp - first.indexBp)}>
                {changeText(first.indexBp, latest.indexBp)} over this period
              </span>
            </figcaption>
          </figure>
          <details className="mt-3 text-sm text-fg">
            <summary className="cursor-pointer">Monthly prices</summary>
            <table className="mt-2 w-full text-left text-xs tabular-nums">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Index</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((point, i) => {
                  const before = history[history.length - i - 2];
                  return (
                    <tr key={point.tick} className="border-t border-border">
                      <th scope="row" className="py-1 font-normal">
                        {date(point.tick)}
                      </th>
                      <td>{indexValue(point.indexBp)}</td>
                      <td
                        className={before ? changeTone(point.indexBp - before.indexBp) : undefined}
                      >
                        {before ? changeText(before.indexBp, point.indexBp) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

export function InvestmentMarket({
  view,
  market: current,
  disabled,
}: {
  view: GameView;
  market: Investment;
  disabled: boolean;
}) {
  const send = useGameStore((s) => s.send);
  const currency = view.finance.currency;
  const fund = current.id;
  const gain = current.costMinor === null ? null : current.balanceMinor - current.costMinor;
  return (
    <div className="flex flex-col gap-3">
      <MarketChart market={current} view={view} />
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Your holding</dt>
          <dd>
            <Money minor={current.balanceMinor} currency={currency} />
          </dd>
        </div>
        {current.costMinor !== null && (
          <div>
            <dt className="text-muted">Cost basis</dt>
            <dd>
              <Money minor={current.costMinor} currency={currency} />
            </dd>
          </div>
        )}
        {gain !== null && (
          <div>
            <dt className="text-muted">Gain or loss</dt>
            <dd>
              <Money minor={gain} currency={currency} signed />
            </dd>
          </div>
        )}
      </dl>
      <div key={fund} className="grid gap-3 md:grid-cols-2">
        <AmountForm
          label={`Buy ${t(`fund.${fund}`)}`}
          currency={currency}
          submitLabel="Buy"
          disabled={disabled}
          onSubmit={(amountMinor) => send({ type: 'buyFund', fund, amountMinor })}
        />
        <AmountForm
          label={`Sell ${t(`fund.${fund}`)}`}
          currency={currency}
          submitLabel="Sell"
          disabled={disabled || current.balanceMinor === 0n}
          disabledReason={
            !disabled && current.balanceMinor === 0n ? 'You do not hold this investment yet.' : null
          }
          onSubmit={(amountMinor) => send({ type: 'sellFund', fund, amountMinor })}
        />
      </div>
    </div>
  );
}
