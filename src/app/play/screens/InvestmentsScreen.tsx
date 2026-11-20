import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  BadgeDollarSign,
  Bitcoin,
  ChartNoAxesCombined,
  ChevronRight,
  Layers3,
  Wallet,
} from 'lucide-react';
import { monthlyInterest } from '@engine/core/money';
import { BOND_TERMS, type BondTerm } from '@engine/economy/investments';
import type { Fund } from '@engine/state/schema';
import type { GameView } from '@engine/view';
import { AmountForm, Money } from '@app/components/Money';
import { PageHeader } from '@app/components/PageHeader';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { formatBp, formatShortMonth } from '@app/i18n/format';
import { cn } from '@app/lib/cn';
import { useGameStore } from '@app/stores/gameStore';
import { InvestmentMarket, MarketMovement } from '../InvestmentMarket';
import { portfolioSaleValue } from '../portfolio';
import { tickToMonth } from '../widgets';

const sections = [
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'stocks', label: 'Stocks', icon: ChartNoAxesCombined },
  { id: 'funds', label: 'Funds', icon: Layers3 },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'bonds', label: 'Bonds', icon: BadgeDollarSign },
] as const;

const instruments = {
  stocks: { category: 'funds', description: 'Broad stock market' },
  technology: { category: 'funds', description: 'Technology companies' },
  consumer: { category: 'funds', description: 'Everyday essentials' },
  selara: { category: 'stocks', description: 'Technology company' },
  meranti: { category: 'stocks', description: 'Food company' },
  bonds: { category: 'funds', description: 'Trades at a changing market price' },
  bitcoin: { category: 'crypto', description: 'Cryptocurrency' },
} satisfies Record<Fund, { category: 'stocks' | 'funds' | 'crypto'; description: string }>;

const rowClass =
  'flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-surface-2 focus-visible:outline-offset-[-3px] sm:px-4';

function assetPath(base: string, id: Fund) {
  return `${base}/${instruments[id].category}/${id}`;
}

function date(view: GameView, tick: number) {
  return formatShortMonth(tickToMonth(view, tick));
}

function Portfolio({ view, base, disabled }: { view: GameView; base: string; disabled: boolean }) {
  const send = useGameStore((s) => s.send);
  const [confirmSale, setConfirmSale] = useState(false);
  const currency = view.finance.currency;
  const investments = view.enterprise.investments;
  const saleValue = portfolioSaleValue(investments);
  const { markets, bonds } = investments;
  const positions = markets.filter((market) => market.balanceMinor > 0n);
  const hasPositions = positions.length > 0 || bonds.length > 0;
  const gainUnknown = positions.some((market) => market.costMinor === null);
  const gain =
    positions.reduce(
      (total, market) => total + market.balanceMinor - (market.costMinor ?? 0n),
      0n,
    ) + bonds.reduce((total, bond) => total + bond.saleValueMinor - bond.faceMinor, 0n);
  const interest = bonds.reduce((total, bond) => total + bond.monthlyInterestMinor, 0n);

  return (
    <>
      <Card title="Portfolio">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Value if sold today</dt>
            <dd className="mt-1 text-2xl font-semibold text-fg">
              <Money minor={saleValue} currency={currency} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Unrealized gain or loss</dt>
            <dd className="mt-1 text-sm font-medium text-fg">
              {gainUnknown ? (
                'Cost unavailable for an older holding'
              ) : (
                <Money minor={gain} currency={currency} signed={gain !== 0n} />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Monthly bond interest</dt>
            <dd className="mt-1 text-sm font-medium text-fg">
              <Money minor={interest} currency={currency} />
            </dd>
          </div>
        </dl>
        {hasPositions && (
          <Button
            className="mt-4"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              setConfirmSale(true);
            }}
          >
            Sell all investments
          </Button>
        )}
      </Card>
      <Card title="Your holdings">
        {hasPositions ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {positions.map((market) => (
              <li key={market.id}>
                <Link className={rowClass} to={assetPath(base, market.id)}>
                  <span className="min-w-0 flex-1 font-medium text-fg">
                    {t(`fund.${market.id}`)}
                  </span>
                  <Money minor={market.balanceMinor} currency={currency} className="text-sm" />
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
            {bonds.map((bond) => (
              <li key={bond.id}>
                <Link className={rowClass} to={`${base}/bonds`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">
                      {bond.termMonths / 12}-year government bond
                    </span>
                    <span className="block text-sm text-muted">
                      Matures {date(view, bond.maturityTick)}
                    </span>
                  </span>
                  <Money minor={bond.saleValueMinor} currency={currency} className="text-sm" />
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Choose a market above to make your first investment.</p>
        )}
      </Card>
      <ConfirmDialog
        open={confirmSale && hasPositions}
        onOpenChange={setConfirmSale}
        title="Sell all investments?"
        confirmLabel="Sell all investments"
        tone="danger"
        onConfirm={() =>
          hasPositions && !disabled ? send({ type: 'liquidateInvestments' }) : undefined
        }
      >
        <p>
          Selling every holding at current prices puts{' '}
          <Money minor={saleValue} currency={currency} className="font-semibold" /> in your current
          account.
        </p>
        {bonds.length > 0 && (
          <p className="mt-2">Your government bonds will be sold early and stop paying interest.</p>
        )}
      </ConfirmDialog>
    </>
  );
}

function GovernmentBonds({
  view,
  base,
  disabled,
}: {
  view: GameView;
  base: string;
  disabled: boolean;
}) {
  const send = useGameStore((s) => s.send);
  const { bonds, bondOffers } = view.enterprise.investments;
  const { currency } = view.finance;
  const [term, setTerm] = useState<BondTerm>(60);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const selected = bondOffers.find((offer) => offer.termMonths === term);
  const selling = bonds.find((bond) => bond.id === sellingId);

  return (
    <>
      <Card
        title="Government bonds"
        description="Lock in an annual rate, collect interest each month, and get the original amount back at maturity."
      >
        <div className="flex flex-col gap-3">
          <ChoiceGroup
            legend="Bond term"
            name="bond-term"
            value={String(term)}
            onChange={(value) => {
              const next = BOND_TERMS.find((months) => String(months) === value);
              if (next !== undefined) setTerm(next);
            }}
            options={bondOffers.map((offer) => ({
              value: String(offer.termMonths),
              label: offer.termMonths === 12 ? '1 year' : `${String(offer.termMonths / 12)} years`,
              description: `${formatBp(offer.yieldBp)} fixed per year`,
            }))}
          />
          {selected && (
            <>
              <p className="text-sm text-muted">
                Buying this term today returns your principal in {date(view, view.tick + term)}.
              </p>
              <AmountForm
                label="Buy bonds"
                currency={currency}
                submitLabel="Buy bonds"
                disabled={disabled}
                preview={(amount) => (
                  <>
                    Monthly interest{' '}
                    <Money minor={monthlyInterest(amount, selected.yieldBp)} currency={currency} />
                  </>
                )}
                onSubmit={(minor) =>
                  send({ type: 'buyBond', termMonths: term, amountMinor: minor })
                }
              />
            </>
          )}
        </div>
      </Card>
      <Card
        title="Your bonds"
        description="If you sell early, the price can change with interest rates."
      >
        {bonds.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {bonds.map((bond) => (
              <li key={bond.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-fg">
                    <Money minor={bond.faceMinor} currency={currency} />, {bond.termMonths / 12}
                    -year at {formatBp(bond.couponBp)}
                  </p>
                  <p className="mt-1 text-muted">
                    Pays <Money minor={bond.monthlyInterestMinor} currency={currency} /> a month ·
                    matures {date(view, bond.maturityTick)}
                  </p>
                  <p className="mt-0.5 text-muted">
                    <Money minor={bond.saleValueMinor} currency={currency} /> if sold now
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    setSellingId(bond.id);
                  }}
                >
                  Sell early
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You don’t hold any government bonds yet.</p>
        )}
        <Link
          to={assetPath(base, 'bonds')}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          View the bond fund <ChevronRight aria-hidden="true" className="ml-1 size-4" />
        </Link>
      </Card>
      <ConfirmDialog
        open={selling !== undefined}
        onOpenChange={(open) => {
          if (!open) setSellingId(null);
        }}
        title="Sell this bond early?"
        confirmLabel="Sell"
        onConfirm={() =>
          selling && !disabled ? send({ type: 'sellBond', accountId: selling.id }) : undefined
        }
      >
        {selling && (
          <>
            You’ll receive <Money minor={selling.saleValueMinor} currency={currency} /> now. This
            bond’s monthly interest and scheduled maturity payment will end.
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

export function InvestmentsScreen() {
  const { category, asset } = useParams();
  const session = useGameStore((s) => s.session);
  const busy = useGameStore((s) => s.busy);
  if (!session) return null;
  const { view } = session;
  const finance = `/play/${session.saveId}/finance`;
  const base = `${finance}/investments`;
  const section = sections.find((item) => item.id === category) ?? sections[0];
  const { markets } = view.enterprise.investments;
  const available = markets.filter((market) => instruments[market.id].category === section.id);
  const selected = available.find((market) => market.id === asset);
  const unlocked = view.character.age.years >= 18;
  const disabled = busy || view.pendingEvent !== null || view.lifeStatus !== 'alive';
  const checking = view.finance.personal?.checking;

  return (
    <div className="flex flex-col gap-3">
      <Link
        to={finance}
        className="inline-flex min-h-11 w-fit items-center gap-2 px-1 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to Finance
      </Link>
      <PageHeader title={selected && unlocked ? t(`fund.${selected.id}`) : 'Investments'} />
      {unlocked ? (
        <>
          <nav
            aria-label="Investment markets"
            className="grid grid-cols-5 rounded-xl border border-border bg-surface p-1"
          >
            {sections.map(({ id, label, icon: Icon }) => (
              <Link
                key={id}
                to={id === 'portfolio' ? base : `${base}/${id}`}
                aria-current={section.id === id ? (selected ? 'location' : 'page') : undefined}
                className={cn(
                  'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-xs font-medium sm:flex-row sm:gap-2 sm:px-2 sm:text-sm',
                  section.id === id
                    ? 'bg-primary-soft font-semibold text-fg'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
          {typeof checking === 'bigint' && (
            <p className="text-sm text-muted">
              Available in checking{' '}
              <Money
                minor={checking}
                currency={view.finance.currency}
                className="ml-1 font-semibold text-fg"
              />
            </p>
          )}
          {section.id === 'portfolio' ? (
            <Portfolio view={view} base={base} disabled={disabled} />
          ) : section.id === 'bonds' ? (
            <GovernmentBonds view={view} base={base} disabled={disabled} />
          ) : selected ? (
            <InvestmentMarket key={selected.id} view={view} market={selected} disabled={disabled} />
          ) : (
            <Card title={section.label}>
              <p className="mb-2 text-right text-xs font-medium text-muted">Latest monthly move</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {available.map((market) => (
                  <li key={market.id}>
                    <Link className={rowClass} to={assetPath(base, market.id)}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{t(`fund.${market.id}`)}</span>
                        <span className="block text-sm text-muted">
                          {instruments[market.id].description}
                        </span>
                      </span>
                      <span className="max-w-20 text-right text-sm font-semibold">
                        <MarketMovement market={market} />
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <Card title="Investing unlocks at age 18" />
      )}
    </div>
  );
}
