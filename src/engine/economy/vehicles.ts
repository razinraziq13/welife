import { sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { Rng } from '../core/rng';
import { ageYears } from '../core/world';
import type { Character, Vehicle, VehicleKind, World } from '../state/schema';
import { getCountry } from '../world/countries';
import { medianWage } from './economy';
import { currencyCountry } from './fx';
import { openAccount, post } from './ledger';

interface Model {
  id: string;
  name: string;
  kind: VehicleKind;
  detail: string;
  /** Sticker price as a multiple of the country's median monthly wage. */
  priceMonths: number;
}

const MODELS: readonly Model[] = [
  {
    id: 'meranti-city',
    name: 'Meranti City',
    kind: 'car',
    detail: 'Compact hatchback',
    priceMonths: 18,
  },
  {
    id: 'rimba-touring',
    name: 'Rimba Touring',
    kind: 'car',
    detail: 'Family SUV',
    priceMonths: 36,
  },
  {
    id: 'selat-trainer',
    name: 'Selat Trainer',
    kind: 'aeroplane',
    detail: 'Two-seat propeller plane',
    priceMonths: 115,
  },
  {
    id: 'awan-express',
    name: 'Awan Express',
    kind: 'aeroplane',
    detail: 'Six-seat business jet',
    priceMonths: 1_550,
  },
  {
    id: 'bayu-scout',
    name: 'Bayu Scout',
    kind: 'helicopter',
    detail: 'Two-seat light helicopter',
    priceMonths: 210,
  },
  {
    id: 'helang-executive',
    name: 'Helang Executive',
    kind: 'helicopter',
    detail: 'Six-seat executive helicopter',
    priceMonths: 930,
  },
];

const VEHICLE_MESSAGES = {
  tooYoung: 'You can buy vehicles from age 18.',
  noAccount: 'You need a current account to buy a vehicle.',
  unavailable: 'This offer is no longer available.',
  insufficientFunds: 'You do not have enough cash in your current account.',
} as const;
type VehicleRejection = keyof typeof VEHICLE_MESSAGES;

export class VehicleError extends Error {
  constructor(readonly code: VehicleRejection) {
    super(VEHICLE_MESSAGES[code]);
    this.name = 'VehicleError';
  }
}

function offers(world: World, buyer: Character) {
  const median = medianWage(world, buyer.countryCode);
  const purchased = new Set(
    Object.values(world.ledger.accounts).flatMap((account) =>
      account.vehicle ? [account.vehicle.offerId] : [],
    ),
  );
  return MODELS.flatMap((model) => {
    const base = median * BigInt(model.priceMonths);
    const prefix = `vehicle:${buyer.locationId}:${String(world.tick)}:${model.id}`;
    const makeOffer = (yearsUsed: number, condition: number, priceMinor: bigint) => ({
      offerId: `${prefix}:${yearsUsed === 0 ? 'new' : 'used'}`,
      kind: model.kind,
      name: model.name,
      detail: model.detail,
      yearsUsed,
      condition,
      priceMinor,
    });
    const fresh = makeOffer(0, 100, base);
    if (model.kind !== 'car') return [fresh];
    const rng = Rng.fromSeed(`${world.seed}:${prefix}`);
    const yearsUsed = rng.range(2, 9);
    const condition = 100 - yearsUsed * 3 - rng.range(2, 12);
    return [fresh, makeOffer(yearsUsed, condition, applyPercent(base, 92 - yearsUsed * 6))];
  }).filter((offer) => !purchased.has(offer.offerId));
}

function checkingAccount(world: World, buyer: Character) {
  const account = world.ledger.accounts[buyer.finance?.checkingId ?? ''];
  return account?.ownerId === buyer.id && account.type === 'checking' && account.closedTick === null
    ? account
    : undefined;
}

function purchaseBlock(world: World, buyer: Character, price: bigint): VehicleRejection | null {
  if (ageYears(world, buyer) < 18) return 'tooYoung';
  const checking = checkingAccount(world, buyer);
  if (!checking) return 'noAccount';
  return checking.balance < price ? 'insufficientFunds' : null;
}

export function projectVehicleShop(world: World, buyer: Character) {
  return {
    offers: offers(world, buyer).map((offer) => {
      const block = purchaseBlock(world, buyer, offer.priceMinor);
      return { ...offer, reason: block ? VEHICLE_MESSAGES[block] : null };
    }),
    owned: sortedValues(world.ledger.accounts).flatMap((account) =>
      account.ownerId === buyer.id &&
      account.type === 'vehicle' &&
      account.closedTick === null &&
      account.vehicle
        ? [
            {
              ...account.vehicle,
              id: account.id,
              purchaseValueMinor: account.balance,
              currency: getCountry(currencyCountry(account.currency)).currency,
            },
          ]
        : [],
    ),
  };
}

export function buyVehicle(world: World, buyer: Character, offerId: string): Vehicle {
  const offer = offers(world, buyer).find((item) => item.offerId === offerId);
  if (!offer) throw new VehicleError('unavailable');
  const block = purchaseBlock(world, buyer, offer.priceMinor);
  if (block) throw new VehicleError(block);
  const checking = checkingAccount(world, buyer);
  if (!checking) throw new VehicleError('noAccount');
  const { name, kind, condition, yearsUsed } = offer;
  const vehicle: Vehicle = { offerId, name, kind, condition, yearsUsed, purchasedTick: world.tick };
  const asset = openAccount(world, buyer.id, 'vehicle', checking.currency, {
    category: kind,
    vehicle,
  });
  post(
    world,
    'tx.vehicleBought',
    [
      { accountId: asset, debit: offer.priceMinor },
      { accountId: checking.id, credit: offer.priceMinor },
    ],
    { params: { name }, source: asset },
  );
  return vehicle;
}
