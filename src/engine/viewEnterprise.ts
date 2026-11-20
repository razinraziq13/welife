import { sortedValues } from './core/data';
import { applyBp } from './core/money';
import { ageOf } from './core/clock';
import {
  acquisitionPrice,
  bookEquity,
  businessLoanLimit,
  competitorsAt,
  marketValuation,
  minimumCapital,
  ownerShare,
  refPrice,
  setupCost,
  contractBlock,
  staffOnContracts,
  takesContracts,
} from './business/business';
import { BUSINESS_TYPES, getBusinessType } from './business/catalog';
import { displayName } from './characters/names';
import { convert, marketPoint } from './economy/economy';
import {
  BOND_TERMS,
  bondSaleValue,
  bondYieldBp,
  fundAccount,
  playerBonds,
} from './economy/investments';
import { monthlyInterest } from './core/money';
import { balanceOf } from './economy/ledger';
import { rateFor } from './economy/finance';
import { projectVehicleShop } from './economy/vehicles';
import { projectGambling } from './economy/gambling';
import { RENOVATION, depositPercent, marketRent } from './property/property';
import { COUNTRIES, getCountry, getLocation } from './world/countries';
import { MARKETS_SOURCE, countryMarket } from './world/markets';
import {
  FUNDS,
  type Business,
  type Character,
  type Fund,
  type Statement,
  type World,
} from './state/schema';

/** Read-only projection of companies, property and investments (Milestone 5). */

export interface CurrencyInfo {
  code: string;
  exponent: number;
  symbol: string;
}

export interface BranchView {
  id: string;
  locationId: string;
  locationName: string;
  countryCode: string;
  currency: CurrencyInfo;
  staff: number;
  wageMinor: bigint;
  pricePercent: number;
  priceMinor: bigint;
  rentMinor: bigint;
  capacity: number;
  inventory: number;
  stockTarget: number;
  lastDemand: number;
  lastSold: number;
  competitors: {
    id: string;
    name: string;
    quality: number;
    brand: number;
    pricePercent: number;
    size: number;
    priceMinor: bigint;
  }[];
}

export interface CompanyView {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  unit: string;
  goods: boolean;
  /** Extra products and last month's results (goods businesses). */
  products: NonNullable<Business['products']>;
  /** Client contracts for project firms (E91); null for other businesses. */
  contracts:
    | (NonNullable<Business['contracts']> & {
        freeStaff: number;
        offerReasons: Record<string, string | null>;
      })
    | null;
  countryCode: string;
  currency: CurrencyInfo;
  status: Business['status'];
  foundedTick: number;
  closedTick: number | null;
  yourSharesBp: number;
  owners: { name: string; sharesBp: number; isYou: boolean }[];
  cashMinor: bigint;
  debtMinor: bigint;
  bookEquityMinor: bigint;
  valuationMinor: bigint;
  quality: number;
  brand: number;
  marketingMinor: bigint;
  supplier: Business['supplier'];
  manager: Business['manager'];
  managerSkill: number;
  distressMonths: number;
  statement: Statement | null;
  history: Business['history'];
  branches: BranchView[];
  loans: { id: string; balance: bigint; rateBp: number; paymentMinor: bigint }[];
  loanLimitMinor: bigint;
  canRaise: boolean;
  hoursPerMonth: number;
}

export interface EnterpriseView {
  vehicles: ReturnType<typeof projectVehicleShop>;
  gambling: ReturnType<typeof projectGambling>;
  business: {
    canStart: boolean;
    reason: string | null;
    types: {
      id: string;
      name: string;
      unit: string;
      goods: boolean;
      minCapitalMinor: bigint;
      setupMinor: bigint;
    }[];
    locations: { id: string; name: string; countryCode: string; countryName: string }[];
    companies: CompanyView[];
    past: { id: string; name: string; status: Business['status']; closedTick: number | null }[];
    source: typeof MARKETS_SOURCE;
  };
  property: {
    depositPercent: number;
    mortgageRateBp: number;
    transferBp: number;
    listings: {
      id: string;
      kind: string;
      locationName: string;
      askingMinor: bigint;
      condition: number;
      feesMinor: bigint;
      marketRentMinor: bigint;
      expiresTick: number;
    }[];
    owned: {
      id: string;
      kind: string;
      locationName: string;
      currency: CurrencyInfo;
      valueMinor: bigint;
      purchasePriceMinor: bigint;
      mortgageBalance: bigint;
      mortgagePayment: bigint;
      condition: number;
      use: string;
      rentMinor: bigint;
      marketRentMinor: bigint;
      tenant: {
        name: string;
        rentMinor: bigint;
        leaseEndTick: number;
        missedPayments: number;
      } | null;
      renovationEndTick: number | null;
      renovationCosts: { light: bigint; major: bigint };
      listedTick: number | null;
      isHome: boolean;
    }[];
  };
  investments: {
    stocksMinor: bigint;
    bondsMinor: bigint;
    /** Money put into each fund, less the cost of what was sold (null for older holdings). */
    stocksCostMinor: bigint | null;
    bondsCostMinor: bigint | null;
    stockIndexBp: number;
    bondIndexBp: number;
    markets: {
      id: Fund;
      balanceMinor: bigint;
      costMinor: bigint | null;
      history: { tick: number; indexBp: number }[];
    }[];
    /** Government bonds on offer now: term and annual yield. */
    bondOffers: { termMonths: number; yieldBp: number }[];
    /** Bonds held: face value, fixed rate, monthly interest, maturity and today's sale price. */
    bonds: {
      id: string;
      faceMinor: bigint;
      couponBp: number;
      termMonths: number;
      maturityTick: number;
      monthlyInterestMinor: bigint;
      saleValueMinor: bigint;
    }[];
  };
}

function currencyOf(code: string): CurrencyInfo {
  return getCountry(code).currency;
}

function companyView(world: World, player: Character, b: Business): CompanyView {
  const type = getBusinessType(b.typeId);
  let debt = 0n;
  const loans: CompanyView['loans'] = [];
  for (const a of sortedValues(world.ledger.accounts)) {
    if (a.ownerId !== b.id || a.closedTick !== null) continue;
    if (a.type === 'loan' || a.type === 'arrears') debt += a.balance;
    if (a.type === 'loan' && a.loan)
      loans.push({
        id: a.id,
        balance: a.balance,
        rateBp: a.loan.rateBp,
        paymentMinor: a.loan.paymentMinor,
      });
  }
  const recent = b.history.slice(-6);
  return {
    id: b.id,
    name: b.name,
    typeId: b.typeId,
    typeName: type.name,
    unit: type.unit,
    goods: type.goods,
    products: b.products ?? [],
    contracts: takesContracts(b)
      ? {
          ...(b.contracts ?? { offers: [], active: [], delivered: 0, late: 0, cancelled: 0 }),
          freeStaff: Math.max(0, (b.branches[0]?.staff ?? 0) - staffOnContracts(b)),
          offerReasons: Object.fromEntries(
            (b.contracts?.offers ?? []).map((o) => [o.id, contractBlock(b, o)]),
          ),
        }
      : null,
    countryCode: b.countryCode,
    currency: currencyOf(b.countryCode),
    status: b.status,
    foundedTick: b.foundedTick,
    closedTick: b.closedTick,
    yourSharesBp: ownerShare(b, player.id)?.sharesBp ?? 0,
    owners: b.owners.map((o) => {
      const c = world.characters[o.ownerId];
      return {
        name: c ? displayName(c.identity, false) : o.ownerId,
        sharesBp: o.sharesBp,
        isYou: o.ownerId === player.id,
      };
    }),
    cashMinor: balanceOf(world, b.cashAccountId),
    debtMinor: debt,
    bookEquityMinor: bookEquity(world, b),
    valuationMinor: b.status === 'active' ? marketValuation(world, b) : 0n,
    quality: b.quality,
    brand: b.brand,
    marketingMinor: b.marketingMinor,
    supplier: b.supplier,
    manager: b.manager,
    managerSkill: b.managerSkill,
    distressMonths: b.distressMonths,
    statement: b.statement,
    history: b.history.slice(-12),
    branches: b.branches.map((br) => {
      const { country, location } = getLocation(br.locationId);
      return {
        id: br.id,
        locationId: br.locationId,
        locationName: location.name,
        countryCode: country.code,
        currency: country.currency,
        staff: br.staff,
        wageMinor: br.wageMinor,
        pricePercent: br.pricePercent,
        priceMinor: applyBp(refPrice(world, type, br.locationId), br.pricePercent * 100),
        rentMinor: br.rentMinor,
        capacity: br.staff * type.capacityPerStaff,
        inventory: br.inventory,
        stockTarget: br.stockTarget,
        lastDemand: br.lastDemand,
        lastSold: br.lastSold,
        competitors: competitorsAt(world, b.typeId, br.locationId).map((c) => ({
          id: c.id,
          name: c.name,
          quality: c.quality,
          brand: c.brand,
          pricePercent: c.pricePercent,
          size: c.size,
          priceMinor: convert(world, acquisitionPrice(world, c), country.code, b.countryCode),
        })),
      };
    }),
    loans,
    loanLimitMinor: b.status === 'active' ? businessLoanLimit(world, b) : 0n,
    canRaise: recent.length >= 6 && recent.reduce((s, h) => s + h.netProfit, 0n) > 0n,
    hoursPerMonth: b.manager === 'owner' ? 40 : 0,
  };
}

export function projectEnterprise(world: World, player: Character): EnterpriseView {
  const adult = ageOf(player.birth, world.clock).years >= 18;
  const hasAccount = Boolean(player.finance?.checkingId);
  const companies = sortedValues(world.businesses).filter((b) => ownerShare(b, player.id));
  const playerHome = world.households[player.householdId]?.finance?.propertyId ?? null;
  const policyRate = rateFor(world, player, 'personal') - 450;
  return {
    business: {
      canStart: adult && hasAccount,
      reason: !adult
        ? 'You can start a company from 18.'
        : !hasAccount
          ? 'You need a current account first.'
          : null,
      types: BUSINESS_TYPES.map((t) => ({
        id: t.id,
        name: t.name,
        unit: t.unit,
        goods: t.goods,
        minCapitalMinor: convert(
          world,
          minimumCapital(world, t, player.locationId),
          player.countryCode,
          player.countryCode,
        ),
        setupMinor: setupCost(world, t, player.locationId),
      })),
      locations: COUNTRIES.flatMap((c) =>
        c.locations.map((l) => ({
          id: l.id,
          name: l.name,
          countryCode: c.code,
          countryName: c.name,
        })),
      ),
      companies: companies
        .filter((b) => b.status === 'active')
        .map((b) => companyView(world, player, b)),
      past: companies
        .filter((b) => b.status !== 'active')
        .map((b) => ({ id: b.id, name: b.name, status: b.status, closedTick: b.closedTick })),
      source: MARKETS_SOURCE,
    },
    property: {
      depositPercent: depositPercent(world),
      mortgageRateBp: Math.max(50, policyRate),
      transferBp: countryMarket(player.countryCode).transferBp,
      listings: sortedValues(world.propertyListings).map((l) => ({
        id: l.id,
        kind: l.kind,
        locationName: getLocation(l.locationId).location.name,
        askingMinor: l.askingMinor,
        condition: l.condition,
        feesMinor: applyBp(
          l.askingMinor,
          countryMarket(getLocation(l.locationId).country.code).transferBp,
        ),
        marketRentMinor: marketRent(l.askingMinor),
        expiresTick: l.expiresTick,
      })),
      owned: sortedValues(world.properties)
        .filter((p) => p.status === 'owned' && p.owners.some((o) => o.ownerId === player.id))
        .map((p) => {
          const { country, location } = getLocation(p.locationId);
          const mortgage = p.mortgageAccountId
            ? world.ledger.accounts[p.mortgageAccountId]
            : undefined;
          const open = mortgage?.closedTick === null;
          return {
            id: p.id,
            kind: p.kind,
            locationName: location.name,
            currency: country.currency,
            valueMinor: p.valueMinor,
            purchasePriceMinor: p.purchasePriceMinor,
            mortgageBalance: open ? mortgage.balance : 0n,
            mortgagePayment: open ? (mortgage.loan?.paymentMinor ?? 0n) : 0n,
            condition: p.condition,
            use: p.use,
            rentMinor: p.rentMinor,
            marketRentMinor: marketRent(p.valueMinor),
            tenant: p.tenant
              ? {
                  name: p.tenant.name,
                  rentMinor: p.tenant.rentMinor,
                  leaseEndTick: p.tenant.leaseEndTick,
                  missedPayments: p.tenant.missedPayments,
                }
              : null,
            renovationEndTick: p.renovation?.endTick ?? null,
            renovationCosts: {
              light: applyBp(p.valueMinor, RENOVATION.light.costBp),
              major: applyBp(p.valueMinor, RENOVATION.major.costBp),
            },
            listedTick: p.listedTick,
            isHome: playerHome === p.id,
          };
        }),
    },
    vehicles: projectVehicleShop(world, player),
    gambling: projectGambling(world, player),
    investments: {
      stocksMinor: fundAccount(world, player.id, 'stocks')?.balance ?? 0n,
      bondsMinor: fundAccount(world, player.id, 'bonds')?.balance ?? 0n,
      stocksCostMinor: fundAccount(world, player.id, 'stocks')?.costMinor ?? null,
      bondsCostMinor: fundAccount(world, player.id, 'bonds')?.costMinor ?? null,
      markets: FUNDS.map((id) => {
        const economy = world.economy[player.countryCode];
        const history = economy?.marketHistory ?? [marketPoint(economy, world.tick)];
        const position = fundAccount(world, player.id, id);
        return {
          id,
          balanceMinor: position?.balance ?? 0n,
          costMinor: position?.costMinor ?? null,
          history: history.map((point) => ({ tick: point.tick, indexBp: point.indices[id] })),
        };
      }),
      bondOffers: BOND_TERMS.map((termMonths) => ({
        termMonths,
        yieldBp: bondYieldBp(world, player.countryCode, termMonths),
      })),
      bonds: playerBonds(world, player.id).map((a) => ({
        id: a.id,
        faceMinor: a.balance,
        couponBp: a.bond?.couponBp ?? 0,
        termMonths: a.bond?.termMonths ?? 0,
        maturityTick: a.bond?.maturityTick ?? 0,
        monthlyInterestMinor: monthlyInterest(a.balance, a.bond?.couponBp ?? 0),
        saleValueMinor: bondSaleValue(world, a, player.countryCode),
      })),
      stockIndexBp: world.economy[player.countryCode]?.marketIndexBp ?? 10_000,
      bondIndexBp: world.economy[player.countryCode]?.bondIndexBp ?? 10_000,
    },
  };
}
