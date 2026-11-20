import { useId, useState } from 'react';
import { amortisedPayment } from '@engine/core/money';
import type { EnterpriseView } from '@engine/viewEnterprise';
import type { GameView } from '@engine/view';
import { PageHeader } from '@app/components/PageHeader';
import { StatBar } from '@app/components/StatBar';
import { AmountForm, Money } from '@app/components/Money';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { t } from '@app/i18n/en';
import { formatBp, formatMoney, formatShortMonth } from '@app/i18n/format';
import { useGameStore } from '@app/stores/gameStore';
import { tickToMonth } from '../widgets';

function useAct() {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy);
  const pending = useGameStore((s) => s.session?.view.pendingEvent !== null);
  const alive = useGameStore((s) => s.session?.view.lifeStatus === 'alive');
  return { send, disabled: busy || pending || !alive };
}

type Owned = EnterpriseView['property']['owned'][number];

function OwnedCard({ p, view }: { p: Owned; view: GameView }) {
  const { send, disabled } = useAct();
  const [confirm, setConfirm] = useState<'light' | 'major' | 'sell' | 'move' | null>(null);
  const cur = p.currency;
  const busyRenovating = p.renovationEndTick !== null;
  return (
    <Card title={`${t(`kind.${p.kind}`)} in ${p.locationName}`} headingLevel={3}>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Value</dt>
          <dd>
            <Money minor={p.valueMinor} currency={cur} />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Bought for</dt>
          <dd>
            <Money minor={p.purchasePriceMinor} currency={cur} />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Mortgage left</dt>
          <dd>
            <Money minor={p.mortgageBalance} currency={cur} />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Use</dt>
          <dd>{t(`use.${p.use}`)}</dd>
        </div>
        {p.mortgagePayment > 0n && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Mortgage payment</dt>
            <dd>
              <Money minor={p.mortgagePayment} currency={cur} /> a month
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Typical rent</dt>
          <dd>
            <Money minor={p.marketRentMinor} currency={cur} /> a month
          </dd>
        </div>
      </dl>
      <div className="mt-2">
        <StatBar label="Condition" value={p.condition} />
      </div>
      {p.tenant && (
        <p className="mt-2 text-sm text-fg">
          Tenant: {p.tenant.name}, paying <Money minor={p.tenant.rentMinor} currency={cur} /> until{' '}
          {formatShortMonth(tickToMonth(view, p.tenant.leaseEndTick))}
          {p.tenant.missedPayments > 0 ? ` (${String(p.tenant.missedPayments)} missed)` : ''}.
        </p>
      )}
      {p.use === 'rental' && !p.tenant && !busyRenovating && (
        <p className="mt-2 text-sm text-muted">
          Looking for a tenant at <Money minor={p.rentMinor} currency={cur} /> a month.
        </p>
      )}
      {busyRenovating && p.renovationEndTick !== null && (
        <p className="mt-2 text-sm text-muted">
          Renovation finishes in {formatShortMonth(tickToMonth(view, p.renovationEndTick))}.
        </p>
      )}
      {p.listedTick !== null && (
        <p className="mt-2 text-sm text-muted">
          For sale since {formatShortMonth(tickToMonth(view, p.listedTick))}.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {!p.isHome && p.kind !== 'commercial' && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busyRenovating || p.tenant !== null}
              onClick={() => {
                setConfirm('move');
              }}
            >
              Move in
            </Button>
            {p.tenant && (
              <p className="mt-1 text-xs text-muted">
                A tenant lives there until their lease ends.
              </p>
            )}
          </div>
        )}
        {!p.isHome && (
          <AmountForm
            label={p.use === 'rental' ? 'Change the asking rent' : 'Let it out for'}
            currency={cur}
            submitLabel={p.use === 'rental' ? 'Update' : 'Let it'}
            disabled={disabled || busyRenovating}
            onSubmit={(minor) => send({ type: 'letProperty', propertyId: p.id, rentMinor: minor })}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {p.use === 'rental' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || p.tenant !== null}
              onClick={() => void send({ type: 'stopLetting', propertyId: p.id })}
            >
              Stop letting
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || busyRenovating || p.tenant !== null}
            onClick={() => {
              setConfirm('light');
            }}
          >
            Light renovation ({formatMoney(p.renovationCosts.light, cur)})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || busyRenovating || p.tenant !== null}
            onClick={() => {
              setConfirm('major');
            }}
          >
            Major renovation ({formatMoney(p.renovationCosts.major, cur)})
          </Button>
          {p.listedTick === null ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setConfirm('sell');
              }}
            >
              Put up for sale
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => void send({ type: 'listProperty', propertyId: p.id, list: false })}
            >
              Take off the market
            </Button>
          )}
        </div>
        {p.tenant && (
          <p className="text-xs text-muted">Renovations wait until the property is empty.</p>
        )}
      </div>
      <ConfirmDialog
        open={confirm === 'move'}
        onOpenChange={(o) => {
          setConfirm(o ? 'move' : null);
        }}
        title="Move in?"
        confirmLabel="Move in"
        onConfirm={() => send({ type: 'moveIntoProperty', propertyId: p.id })}
      >
        It becomes your home: no more rent, and you pay its upkeep.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'light' || confirm === 'major'}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title="Renovate?"
        confirmLabel="Start work"
        onConfirm={() =>
          confirm === 'light' || confirm === 'major'
            ? send({ type: 'renovate', propertyId: p.id, level: confirm })
            : undefined
        }
      >
        Work takes {confirm === 'major' ? 'five' : 'two'} months, during which it cannot be let. It
        restores the condition and adds to the value.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'sell'}
        onOpenChange={(o) => {
          setConfirm(o ? 'sell' : null);
        }}
        title="Sell this property?"
        confirmLabel="Put up for sale"
        onConfirm={() => send({ type: 'listProperty', propertyId: p.id, list: true })}
      >
        It usually sells within a few months, near its value. Agent fees of 2% apply and the
        mortgage is paid off from the proceeds.
      </ConfirmDialog>
    </Card>
  );
}

export function PropertyListingsCard({
  view,
  residentialOnly = false,
}: {
  view: GameView;
  residentialOnly?: boolean;
}) {
  const { send, disabled } = useAct();
  const property = view.enterprise.property;
  const depositId = useId();
  const termId = useId();
  const [deposit, setDeposit] = useState(Math.max(property.depositPercent, 20));
  const [term, setTerm] = useState(300);
  const cur = view.country.currency;
  const market = residentialOnly ? 'Homes for sale' : 'Property for sale';
  const listings = residentialOnly
    ? property.listings.filter((listing) => listing.kind !== 'commercial')
    : property.listings;
  if (view.character.age.years < 18)
    return (
      <Card title={market}>
        <p className="text-sm text-muted">You can buy property from 18.</p>
      </Card>
    );
  return (
    <Card
      title={`${market} in ${view.character.location.name}`}
      description={`Lenders need a deposit of at least ${String(property.depositPercent)}%. Mortgage rate about ${formatBp(property.mortgageRateBp)} a year; transfer costs about ${formatBp(property.transferBp)}.`}
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={depositId} className="text-sm text-fg">
            Deposit
          </label>
          <select
            id={depositId}
            value={deposit}
            onChange={(e) => {
              setDeposit(Number(e.target.value));
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100]
              .filter((d) => d >= property.depositPercent)
              .map((d) => (
                <option key={d} value={d}>
                  {d}% {d === 100 ? '(no mortgage)' : ''}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={termId} className="text-sm text-fg">
            Mortgage term
          </label>
          <select
            id={termId}
            value={term}
            onChange={(e) => {
              setTerm(Number(e.target.value));
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-fg"
          >
            {[120, 180, 240, 300, 360].map((m) => (
              <option key={m} value={m}>
                {m / 12} years
              </option>
            ))}
          </select>
        </div>
      </div>
      {listings.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing for sale right now. New listings appear each month.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {listings.map((l) => {
            const depositMinor = (l.askingMinor * BigInt(deposit)) / 100n;
            const borrow = l.askingMinor - depositMinor;
            const payment =
              borrow > 0n ? amortisedPayment(borrow, property.mortgageRateBp, term) : 0n;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg">
                    {t(`kind.${l.kind}`)} · <Money minor={l.askingMinor} currency={cur} />
                  </p>
                  <p className="text-muted">
                    Condition {Math.round(l.condition / 10)} · rent about{' '}
                    <Money minor={l.marketRentMinor} currency={cur} /> a month · fees{' '}
                    <Money minor={l.feesMinor} currency={cur} />
                  </p>
                  <p className="text-muted">
                    You pay <Money minor={depositMinor + l.feesMinor} currency={cur} /> now
                    {payment > 0n && (
                      <>
                        {' '}
                        and <Money minor={payment} currency={cur} /> a month
                      </>
                    )}
                    .
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  aria-label={`Buy the ${t(`kind.${l.kind}`).toLowerCase()} for ${formatMoney(l.askingMinor, cur)}`}
                  onClick={() =>
                    void send({
                      type: 'buyProperty',
                      listingId: l.id,
                      depositMinor: depositMinor.toString(),
                      termMonths: term,
                    })
                  }
                >
                  Buy
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function PropertyScreen() {
  const session = useGameStore((s) => s.session);
  if (!session) return null;
  const view = session.view;
  const owned = view.enterprise.property.owned;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Property"
        description="Buy, live in, let, renovate and sell. Values follow simulated house prices."
      />
      {owned.length === 0 ? (
        <Card title="Your property">
          <p className="text-sm text-muted">You do not own any property yet.</p>
        </Card>
      ) : (
        owned.map((p) => <OwnedCard key={p.id} p={p} view={view} />)
      )}
      <PropertyListingsCard view={view} />
    </div>
  );
}
