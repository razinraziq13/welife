import { useState } from 'react';
import { Link } from 'react-router';
import { CarFront, Helicopter, Plane } from 'lucide-react';
import type { VehicleKind } from '@engine/state/schema';
import type { GameView } from '@engine/view';
import { Money } from '@app/components/Money';
import { PageHeader } from '@app/components/PageHeader';
import { buttonVariants } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup } from '@app/components/ui/choice-group';
import { ConfirmDialog } from '@app/components/ui/confirm-dialog';
import { useGameStore } from '@app/stores/gameStore';
import { ActionButton } from '../ActionButton';
import { PropertyListingsCard } from '../screens/PropertyScreen';

const categories = [
  { value: 'houses', label: 'Houses' },
  { value: 'used', label: 'Used cars' },
  { value: 'new', label: 'New cars' },
  { value: 'aeroplane', label: 'Aeroplanes' },
  { value: 'helicopter', label: 'Helicopters' },
] as const;
type Category = (typeof categories)[number]['value'];
type Offer = GameView['enterprise']['vehicles']['offers'][number];

const icons = { car: CarFront, aeroplane: Plane, helicopter: Helicopter };
const kindLabel: Record<VehicleKind, string> = {
  car: 'Car',
  aeroplane: 'Aeroplane',
  helicopter: 'Helicopter',
};

type Owned = GameView['enterprise']['vehicles']['owned'][number];

function VehicleCollection({ view }: { view: GameView }) {
  const { owned } = view.enterprise.vehicles;
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy || s.advancing);
  const [selling, setSelling] = useState<Owned | null>(null);
  const blocked =
    view.lifeStatus !== 'alive'
      ? 'This life has ended.'
      : view.pendingEvent
        ? 'Make the waiting decision first.'
        : null;
  return (
    <Card
      title="Your vehicles"
      description="Vehicles lose value every month and cost money to run. Sell one to get its current value back."
    >
      {owned.length === 0 ? (
        <p className="text-sm text-muted">Vehicles you buy appear here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {owned.map((vehicle) => {
            const Icon = icons[vehicle.kind];
            return (
              <li key={vehicle.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg">{vehicle.name}</p>
                  <p className="text-xs text-muted">
                    {kindLabel[vehicle.kind]} ·{' '}
                    {vehicle.yearsUsed > 0 ? 'Bought used' : 'Bought new'} for{' '}
                    <Money minor={vehicle.purchaseValueMinor} currency={vehicle.currency} /> · Costs{' '}
                    <Money minor={vehicle.runningMinor} currency={vehicle.currency} /> a month
                  </p>
                </div>
                <span className="text-right">
                  <Money minor={vehicle.valueMinor} currency={vehicle.currency} />
                  <span className="block text-xs text-muted">Worth now</span>
                </span>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  aria-label={`Sell ${vehicle.name}`}
                  reason={blocked}
                  busy={busy}
                  onAct={() => {
                    setSelling(vehicle);
                  }}
                >
                  Sell
                </ActionButton>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={selling !== null}
        title={selling ? `Sell ${selling.name}?` : 'Sell vehicle?'}
        confirmLabel="Sell"
        onOpenChange={(open) => {
          if (!open) setSelling(null);
        }}
        onConfirm={() => selling && send({ type: 'sellVehicle', accountId: selling.id })}
      >
        {selling && (
          <p>
            Get <Money minor={selling.valueMinor} currency={selling.currency} /> into your current
            account.
          </p>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function VehicleListings({
  view,
  category,
}: {
  view: GameView;
  category: Exclude<Category, 'houses'>;
}) {
  const send = useGameStore((s) => s.send);
  const busy = useGameStore((s) => s.busy || s.advancing);
  const [selected, setSelected] = useState<Offer | null>(null);
  const currency = view.finance.currency;
  const offers = view.enterprise.vehicles.offers.filter((offer) => {
    if (category === 'used' || category === 'new')
      return (
        offer.kind === 'car' && (category === 'used' ? offer.yearsUsed > 0 : offer.yearsUsed === 0)
      );
    return offer.kind === category;
  });
  const title = categories.find(({ value }) => value === category)?.label;
  const blocked =
    view.lifeStatus !== 'alive'
      ? 'This life has ended.'
      : view.pendingEvent
        ? 'Make the waiting decision first.'
        : null;
  return (
    <Card
      title={title}
      description="Pay in full from your current account. Offers refresh each game month."
    >
      <p className="mb-2 text-sm text-muted">
        Current account <Money minor={view.finance.personal?.checking ?? 0n} currency={currency} />
      </p>
      {offers.length === 0 ? (
        <p className="text-sm text-muted">This month’s offers are sold out.</p>
      ) : (
        <ul className="divide-y divide-border">
          {offers.map((offer) => {
            const Icon = icons[offer.kind];
            const reason = blocked ?? offer.reason;
            return (
              <li key={offer.offerId} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-32">
                  <p className="font-semibold text-fg">{offer.name}</p>
                  <p className="text-xs text-muted">
                    {offer.detail} ·{' '}
                    {offer.yearsUsed > 0
                      ? `${String(offer.yearsUsed)} years old · Condition ${String(offer.condition)}/100`
                      : 'New'}
                  </p>
                  {reason && <p className="mt-1 text-xs text-muted">{reason}</p>}
                </div>
                <span className="font-medium text-fg">
                  <Money minor={offer.priceMinor} currency={currency} />
                </span>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  aria-label={`Buy ${offer.name}`}
                  reason={reason}
                  busy={busy}
                  onAct={() => {
                    setSelected(offer);
                  }}
                >
                  Buy
                </ActionButton>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={selected !== null}
        title={selected ? `Buy ${selected.name}?` : 'Buy vehicle?'}
        confirmLabel="Confirm purchase"
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onConfirm={() => selected && send({ type: 'buyVehicle', offerId: selected.offerId })}
      >
        {selected && (
          <p>
            Pay <Money minor={selected.priceMinor} currency={currency} /> from your current account.
          </p>
        )}
      </ConfirmDialog>
    </Card>
  );
}

export function ShoppingTab() {
  const session = useGameStore((s) => s.session);
  const [category, setCategory] = useState<Category>('houses');
  if (!session) return null;
  const { view, saveId } = session;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Shopping" />
      <ChoiceGroup
        legend="Shop for"
        name="shopping-category"
        value={category}
        onChange={setCategory}
        options={categories}
      />
      {category === 'houses' ? (
        <>
          <PropertyListingsCard view={view} residentialOnly />
          <Link
            to={`/play/${saveId}/property`}
            className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
          >
            Manage your properties
          </Link>
        </>
      ) : (
        <VehicleListings key={category} view={view} category={category} />
      )}
      <VehicleCollection view={view} />
    </div>
  );
}
