import { clamp, sortedKeys, sortedValues } from '../core/data';
import { amortisedPayment, applyBp, applyPercent, divRound, maxBig, minBig } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { emptyFinance, moveToHousehold } from '../characters/factory';
import { medianWage } from '../economy/economy';
import {
  debtLimitPercent,
  loanPayments,
  monthlyNetIncome,
  currencyFor,
  inHomeCurrency,
  payExpense,
  payerFor,
  payerIn,
  rateFor,
  receiveIncome,
  rentFor,
  sweepAbroad,
} from '../economy/finance';
import { balanceOf, categoryAccount, openAccount, post } from '../economy/ledger';
import { getCountry, getLocation } from '../world/countries';
import { countryMarket } from '../world/markets';
import { baseMedianWage } from '../world/rules';
import { getInstitutions } from '../world/institutions';
import { isSettled } from '../civics/status';
import type { Character, Household, Listing, Property, PropertyKind, World } from '../state/schema';

/**
 * Property (spec §3.10, §4 step 5): buying with a mortgage, living in it, letting it,
 * upkeep and condition, renovation, selling and repossession. Values follow simulated
 * house prices; each owner's ledger carries the property at market value (changes are
 * booked as gains or losses), so net worth always equals assets minus liabilities.
 * All numbers PROPOSED TUNING.
 */

/** Typical value, months of the median wage (scaled by local costs and house prices). */
export const VALUE_MONTHS: Record<PropertyKind, number> = {
  apartment: 70,
  house: 110,
  commercial: 90,
};
/** Gross rental yield, basis points a year. */
export const RENTAL_YIELD_BP = 550;
/** Upkeep, basis points of value a year. */
export const UPKEEP_BP = 100;
/** Agent fees when selling, basis points. */
export const SELLING_FEE_BP = 200;
export const RENOVATION = {
  light: { costBp: 300, months: 2, premiumBp: 300 },
  major: { costBp: 1000, months: 5, premiumBp: 1000 },
} as const;
/** Missed mortgage payments before the lender repossesses. */
export const REPOSSESSION_MISSES = 6;

export type PropertyRejection =
  | 'tooYoung'
  | 'unknownListing'
  | 'unknownProperty'
  | 'noAccount'
  | 'depositTooLow'
  | 'insufficientFunds'
  | 'noIncome'
  | 'creditTooLow'
  | 'tooMuchDebt'
  | 'invalid'
  | 'commercialHome'
  | 'alreadyHome'
  | 'tenanted'
  | 'livingThere'
  | 'renovating'
  | 'noChange'
  | 'notListed'
  | 'foreignBanned'
  | 'foreignKind'
  | 'foreignMinPrice'
  | 'foreignResidence';

export const PROPERTY_MESSAGES: Record<PropertyRejection, string> = {
  tooYoung: 'You must be 18 or older to buy property.',
  unknownListing: 'That property is no longer for sale.',
  unknownProperty: 'Unknown property.',
  noAccount: 'You need a current account first.',
  depositTooLow: 'The deposit is below what lenders require.',
  insufficientFunds: 'You do not have enough money for the deposit and fees.',
  noIncome: 'Lenders need you to have a regular income for a mortgage.',
  creditTooLow: 'Your credit rating is too low for a mortgage.',
  tooMuchDebt: 'The mortgage payments would be too large for your income.',
  invalid: 'That value is not allowed.',
  commercialHome: 'You cannot live in commercial premises.',
  alreadyHome: 'You already live there.',
  tenanted: 'A tenant lives there until their lease ends.',
  livingThere: 'You live there. Move somewhere else first.',
  renovating: 'Renovation work is under way.',
  noChange: 'That is already the setting.',
  notListed: 'The property is not for sale.',
  foreignBanned: 'Buyers without citizenship or permanent residence may not buy homes here.',
  foreignKind:
    'Buyers without citizenship or permanent residence may not buy this kind of property here.',
  foreignMinPrice: 'Foreign buyers here must pay at least the minimum price set by law.',
  foreignResidence: 'Foreign buyers need to have lived here longer first.',
};

export class PropertyError extends Error {
  readonly code: PropertyRejection;
  constructor(code: PropertyRejection) {
    super(PROPERTY_MESSAGES[code]);
    this.name = 'PropertyError';
    this.code = code;
  }
}

/** Market value of a property of this kind and condition now (local currency). */
export function marketValue(
  world: World,
  kind: PropertyKind,
  locationId: string,
  condition: number,
  premiumBp: number,
): bigint {
  const { country, location } = getLocation(locationId);
  // Start-of-game prices grow with the simulated house-price index (which already includes inflation).
  const base = applyPercent(
    baseMedianWage(country.code) * BigInt(VALUE_MONTHS[kind]),
    location.costIndex,
  );
  const indexed = applyBp(base, world.economy[country.code]?.housePriceBp ?? 10_000);
  const conditioned = applyPercent(indexed, 80 + Math.floor(condition / 50));
  return conditioned + applyBp(conditioned, premiumBp);
}

export function marketRent(value: bigint): bigint {
  return divRound(applyBp(value, RENTAL_YIELD_BP), 12n);
}

export function depositPercent(world: World): number {
  return world.rules.difficulty === 'casual'
    ? 5
    : world.rules.difficulty === 'challenging'
      ? 20
      : 10;
}

function transferCost(code: string, price: bigint): bigint {
  return applyBp(price, countryMarket(code).transferBp);
}

/** Monthly refresh of listings where the player lives. */
export function refreshListings(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (player?.death !== null) return;
  for (const id of sortedKeys(world.propertyListings)) {
    const l = world.propertyListings[id];
    if (l && (l.expiresTick < world.tick || l.locationId !== player.locationId))
      Reflect.deleteProperty(world.propertyListings, id);
  }
  if (ageYears(world, player) < 17) return;
  const current = Object.keys(world.propertyListings).length;
  const add = withRng(world, 'property', (rng) => rng.range(1, 3));
  for (let i = 0; i < add && current + i < 8; i++) {
    const kind = withRng(world, 'property', (rng) =>
      rng.weighted<PropertyKind>([
        { value: 'apartment', weight: 50 },
        { value: 'house', weight: 35 },
        { value: 'commercial', weight: 15 },
      ]),
    );
    const condition = withRng(world, 'property', (rng) => rng.range(350, 950));
    const value = marketValue(world, kind, player.locationId, condition, 0);
    const listing: Listing = {
      id: nextId(world, 'lst'),
      locationId: player.locationId,
      kind,
      askingMinor: applyPercent(
        value,
        withRng(world, 'property', (rng) => rng.range(95, 110)),
      ),
      condition,
      listedTick: world.tick,
      expiresTick: world.tick + withRng(world, 'property', (rng) => rng.range(2, 5)),
    };
    world.propertyListings[listing.id] = listing;
  }
}

export interface MortgageQuote {
  price: bigint;
  fees: bigint;
  deposit: bigint;
  borrow: bigint;
  rateBp: number;
  payment: bigint;
  reason: PropertyRejection | null;
}

export function mortgageQuote(
  world: World,
  c: Character,
  listing: Listing,
  deposit: bigint,
  months: number,
): MortgageQuote {
  const { country } = getLocation(listing.locationId);
  const price = listing.askingMinor;
  const foreign = foreignRules(world, c, listing);
  const fees = transferCost(country.code, price) + foreign.surcharge;
  const borrow = maxBig(0n, price - deposit);
  const rateBp = clamp(rateFor(world, c, 'personal') - 450, 50, 3000);
  const payment = borrow > 0n ? amortisedPayment(borrow, rateBp, months) : 0n;
  let reason: PropertyRejection | null = null;
  const cash =
    balanceOf(world, c.finance?.checkingId ?? null) +
    balanceOf(world, c.finance?.savingsId ?? null);
  const income = monthlyNetIncome(world, c);
  if (ageYears(world, c) < 18) reason = 'tooYoung';
  else if (foreign.reason) reason = foreign.reason;
  else if (!c.finance?.checkingId) reason = 'noAccount';
  else if (deposit < 0n || deposit > price || months < 60 || months > 360) reason = 'invalid';
  else if (deposit * 100n < price * BigInt(depositPercent(world))) reason = 'depositTooLow';
  else if (cash < deposit + fees) reason = 'insufficientFunds';
  else if (borrow > 0n && income <= 0n) reason = 'noIncome';
  else if (borrow > 0n && c.finance.creditScore < 400) reason = 'creditTooLow';
  else if (
    borrow > 0n &&
    (loanPayments(world, c) + payment) * 100n > income * BigInt(debtLimitPercent(world) + 5)
  )
    reason = 'tooMuchDebt';
  return { price, fees, deposit, borrow, rateBp, payment, reason };
}

/**
 * Rules for buyers who are neither citizens nor permanent residents (Milestone 6, researched
 * per country): bans, permitted kinds, minimum prices, residence periods and surcharges.
 */
export function foreignRules(
  world: World,
  c: Character,
  listing: Listing,
): { foreign: boolean; reason: PropertyRejection | null; surcharge: bigint } {
  const { country } = getLocation(listing.locationId);
  if (isSettled(c, country.code)) return { foreign: false, reason: null, surcharge: 0n };
  const rules = getInstitutions(country.code).property;
  let reason: PropertyRejection | null = null;
  if (!rules.foreignKinds.includes(listing.kind))
    reason = rules.foreignBuyers === 'banned' ? 'foreignBanned' : 'foreignKind';
  else if (listing.askingMinor < medianWage(world, country.code) * BigInt(rules.minPriceMonths))
    reason = 'foreignMinPrice';
  else if ((c.civic.residedMonths[country.code] ?? 0) < rules.minResidenceMonths)
    reason = 'foreignResidence';
  return { foreign: true, reason, surcharge: applyBp(listing.askingMinor, rules.surchargeBp) };
}

/** Takes money from checking first, then savings (the player has already been checked). */
function fromCash(
  world: World,
  c: Character,
  amount: bigint,
): { accountId: string; credit: bigint }[] {
  const checking = c.finance?.checkingId ?? '';
  const savings = c.finance?.savingsId ?? null;
  const fromChecking = minBig(amount, balanceOf(world, checking));
  const parts = [{ accountId: checking, credit: fromChecking }];
  if (amount > fromChecking && savings)
    parts.push({ accountId: savings, credit: amount - fromChecking });
  return parts.filter((p) => p.credit > 0n);
}

export function buyProperty(
  world: World,
  c: Character,
  listingId: string,
  deposit: bigint,
  months: number,
): Property {
  const listing = world.propertyListings[listingId];
  if (!listing) throw new PropertyError('unknownListing');
  const quote = mortgageQuote(world, c, listing, deposit, months);
  if (quote.reason) throw new PropertyError(quote.reason);
  const currency = getCountry(getLocation(listing.locationId).country.code).currency.code;
  const assetId = openAccount(world, c.id, 'property', currency, { category: listing.kind });
  let mortgageId: string | null = null;
  const entries: { accountId: string; debit?: bigint; credit?: bigint }[] = [
    { accountId: assetId, debit: quote.price },
    ...fromCash(world, c, quote.deposit),
  ];
  if (quote.borrow > 0n) {
    mortgageId = openAccount(world, c.id, 'loan', currency, {
      category: 'mortgage',
      loan: {
        product: 'mortgage',
        rateBp: quote.rateBp,
        termMonths: months,
        paymentMinor: quote.payment,
        principalMinor: quote.borrow,
        firstPaymentTick: world.tick + 1,
        missedPayments: 0,
      },
    });
    entries.push({ accountId: mortgageId, credit: quote.borrow });
  }
  post(world, 'tx.propertyBought', entries, { params: { kind: listing.kind } });
  if (quote.fees > 0n) {
    post(world, 'tx.propertyFees', [
      {
        accountId: categoryAccount(world, c.id, 'expense', 'propertyFees', currency),
        debit: quote.fees,
      },
      ...fromCash(world, c, quote.fees),
    ]);
  }
  const property: Property = {
    id: nextId(world, 'prp'),
    locationId: listing.locationId,
    kind: listing.kind,
    valueMinor: quote.price,
    purchasePriceMinor: quote.price,
    purchaseTick: world.tick,
    owners: [{ ownerId: c.id, sharesBp: 10_000, stakeAccountId: assetId }],
    mortgageAccountId: mortgageId,
    condition: listing.condition,
    use: 'vacant',
    rentMinor: marketRent(quote.price),
    tenant: null,
    renovation: null,
    premiumBp: 0,
    listedTick: null,
    status: 'owned',
  };
  world.properties[property.id] = property;
  Reflect.deleteProperty(world.propertyListings, listingId);
  addBiography(world, c.id, 'property', 'bio.propertyBought', {
    kind: listing.kind,
    location: getLocation(listing.locationId).location.name,
  });
  addNotification(
    world,
    'property',
    'ntf.propertyBought',
    { kind: listing.kind },
    'property',
    property.id,
  );
  return property;
}

function owned(world: World, c: Character, propertyId: string): Property {
  const p = world.properties[propertyId];
  if (p?.status !== 'owned' || !p.owners.some((o) => o.ownerId === c.id))
    throw new PropertyError('unknownProperty');
  return p;
}

/** Moves the player (and anyone living with them who runs no other home) into the property. */
export function moveIntoProperty(world: World, c: Character, propertyId: string): void {
  const property = owned(world, c, propertyId);
  if (property.kind === 'commercial') throw new PropertyError('commercialHome');
  if (property.renovation) throw new PropertyError('renovating');
  if (property.tenant) throw new PropertyError('tenanted');
  const home = world.households[c.householdId];
  if (home?.finance?.propertyId === property.id) throw new PropertyError('alreadyHome');
  if (ageYears(world, c) < 18) throw new PropertyError('tooYoung');
  const size = property.kind === 'house' ? 'house' : 'apartment';
  let household: Household;
  if (home?.finance?.headId === c.id) {
    household = home;
    const finance = home.finance;
    if (finance.propertyId) {
      const previous = world.properties[finance.propertyId];
      if (previous) previous.use = 'vacant';
    }
    finance.housing = 'owned';
    finance.rentMinor = 0n;
    finance.homeSize = size;
    finance.propertyId = property.id;
    for (const id of home.memberIds) {
      const member = world.characters[id];
      if (member) member.locationId = property.locationId;
    }
    home.locationId = property.locationId;
  } else {
    const checking = c.finance?.checkingId;
    const savings = c.finance?.savingsId;
    if (!checking || !savings) throw new PropertyError('noAccount');
    household = {
      id: nextId(world, 'hh'),
      locationId: property.locationId,
      memberIds: [],
      wealth: home?.wealth ?? 'middle',
      scenario: home?.scenario ?? 'middle',
      originCountryCode: home?.originCountryCode ?? null,
      flags: home
        ? { ...home.flags }
        : {
            royal: false,
            noble: false,
            political: false,
            businessHeir: false,
            immigrant: false,
            rural: false,
            singleParent: false,
            adopted: false,
          },
      familyTrade: home?.familyTrade ?? null,
      finance: {
        checkingId: checking,
        savingsId: savings,
        lifestyle: 'moderate',
        housing: 'owned',
        homeSize: size,
        rentMinor: 0n,
        propertyId: property.id,
        headId: c.id,
      },
    };
    world.households[household.id] = household;
    moveToHousehold(world, c, household.id);
    const partner =
      c.partnership && c.partnership.status !== 'dating'
        ? world.characters[c.partnership.partnerId]
        : undefined;
    if (partner?.death === null && !world.households[partner.householdId]?.finance) {
      moveToHousehold(world, partner, household.id);
      partner.finance ??= emptyFinance(world.tick);
    }
  }
  property.use = 'home';
  addBiography(world, c.id, 'property', 'bio.movedIntoProperty', {
    location: getLocation(property.locationId).location.name,
  });
}

/** Lists a property for rent at the asking rent; tenants apply over the coming months. */
export function letProperty(
  world: World,
  c: Character,
  propertyId: string,
  rentMinor: bigint,
): void {
  const property = owned(world, c, propertyId);
  if (rentMinor <= 0n) throw new PropertyError('invalid');
  if (world.households[c.householdId]?.finance?.propertyId === property.id)
    throw new PropertyError('livingThere');
  if (property.renovation) throw new PropertyError('renovating');
  if (property.use === 'rental' && property.rentMinor === rentMinor)
    throw new PropertyError('noChange');
  property.use = 'rental';
  property.rentMinor = rentMinor;
}

export function stopLetting(world: World, c: Character, propertyId: string): void {
  const property = owned(world, c, propertyId);
  if (property.tenant) throw new PropertyError('tenanted');
  if (property.use !== 'rental') throw new PropertyError('noChange');
  property.use = 'vacant';
}

export function renovate(
  world: World,
  c: Character,
  propertyId: string,
  level: 'light' | 'major',
): void {
  const property = owned(world, c, propertyId);
  if (property.renovation) throw new PropertyError('renovating');
  if (property.tenant) throw new PropertyError('tenanted');
  const plan = RENOVATION[level];
  const cost = applyBp(property.valueMinor, plan.costBp);
  const currency =
    world.ledger.accounts[property.owners.find((o) => o.ownerId === c.id)?.stakeAccountId ?? '']
      ?.currency;
  const payer = currency ? payerIn(world, c, currency, cost) : payerFor(world, c);
  const cash = payer ? balanceOf(world, payer.checkingId) + balanceOf(world, payer.savingsId) : 0n;
  if (!payer || cash < cost) throw new PropertyError('insufficientFunds');
  payExpense(
    world,
    payer,
    'renovation',
    cost,
    'tx.renovation',
    { kind: property.kind },
    property.id,
  );
  property.renovation = { level, endTick: world.tick + plan.months };
}

export function listForSale(world: World, c: Character, propertyId: string, list: boolean): void {
  const property = owned(world, c, propertyId);
  if (list && property.listedTick !== null) throw new PropertyError('noChange');
  if (!list && property.listedTick === null) throw new PropertyError('notListed');
  property.listedTick = list ? world.tick : null;
}

/** Revalues the owners' property accounts to market value. */
function revalue(world: World, property: Property): void {
  property.valueMinor = marketValue(
    world,
    property.kind,
    property.locationId,
    property.condition,
    property.premiumBp,
  );
  for (const owner of property.owners) {
    const account = owner.stakeAccountId ? world.ledger.accounts[owner.stakeAccountId] : undefined;
    if (account?.closedTick !== null) continue;
    const target = applyBp(property.valueMinor, owner.sharesBp);
    const change = target - account.balance;
    if (change > 0n)
      post(world, 'tx.propertyValue', [
        { accountId: account.id, debit: change },
        {
          accountId: categoryAccount(
            world,
            owner.ownerId,
            'income',
            'propertyGains',
            account.currency,
          ),
          credit: change,
        },
      ]);
    else if (change < 0n)
      post(world, 'tx.propertyValue', [
        {
          accountId: categoryAccount(
            world,
            owner.ownerId,
            'expense',
            'propertyLosses',
            account.currency,
          ),
          debit: -change,
        },
        { accountId: account.id, credit: -change },
      ]);
  }
}

/** Sells at `price`: fees, the mortgage, and the rest to the owners (gains/losses booked). */
function completeSale(
  world: World,
  property: Property,
  price: bigint,
  reason: 'sold' | 'repossessed',
): void {
  revalue(world, property);
  const fees = applyBp(price, SELLING_FEE_BP);
  for (const owner of property.owners) {
    const person = world.characters[owner.ownerId];
    const asset = owner.stakeAccountId ? world.ledger.accounts[owner.stakeAccountId] : undefined;
    const checking =
      person && asset ? payerIn(world, person, asset.currency)?.checkingId : undefined;
    if (!person || !asset || !checking) continue;
    const share = applyBp(price, owner.sharesBp);
    const ownerFees = applyBp(fees, owner.sharesBp);
    const book = asset.balance;
    const entries: { accountId: string; debit?: bigint; credit?: bigint }[] = [
      { accountId: checking, debit: share },
      { accountId: asset.id, credit: book },
    ];
    if (share > book)
      entries.push({
        accountId: categoryAccount(world, person.id, 'income', 'propertyGains', asset.currency),
        credit: share - book,
      });
    if (share < book)
      entries.push({
        accountId: categoryAccount(world, person.id, 'expense', 'propertyLosses', asset.currency),
        debit: book - share,
      });
    post(world, reason === 'sold' ? 'tx.propertySold' : 'tx.repossession', entries, {
      params: { kind: property.kind },
    });
    asset.closedTick = world.tick;
    const payer = payerIn(world, person, asset.currency, ownerFees);
    if (payer && ownerFees > 0n)
      payExpense(world, payer, 'propertyFees', ownerFees, 'tx.propertyFees');
    // The mortgage is repaid from the proceeds as far as possible.
    const mortgage = property.mortgageAccountId
      ? world.ledger.accounts[property.mortgageAccountId]
      : undefined;
    if (mortgage && mortgage.balance > 0n) {
      const pay = minBig(mortgage.balance, balanceOf(world, checking));
      if (pay > 0n)
        post(
          world,
          'tx.loanRepaid',
          [
            { accountId: mortgage.id, debit: pay },
            { accountId: checking, credit: pay },
          ],
          { params: { product: 'mortgage' } },
        );
      if (mortgage.balance === 0n) mortgage.closedTick = world.tick;
      else if (mortgage.loan) {
        // Any shortfall remains a personal debt, repaid over five years.
        mortgage.loan.paymentMinor = amortisedPayment(mortgage.balance, mortgage.loan.rateBp, 60);
        mortgage.loan.missedPayments = 0;
      }
    }
    const home = world.households[person.householdId];
    if (home?.finance?.propertyId === property.id) {
      home.finance.propertyId = null;
      home.finance.housing = 'rented';
      home.finance.rentMinor = rentFor(world, home.locationId, home.finance.homeSize);
    }
    if (person.id === world.activeCharacterId) {
      addBiography(
        world,
        person.id,
        'property',
        reason === 'sold' ? 'bio.propertySold' : 'bio.repossessed',
        { kind: property.kind },
      );
      addNotification(
        world,
        'property',
        reason === 'sold' ? 'ntf.propertySold' : 'ntf.repossessed',
        { kind: property.kind, amount: share.toString() },
        'property',
        property.id,
      );
    }
  }
  property.status = reason;
  property.tenant = null;
  property.use = 'vacant';
  property.listedTick = null;
}

const TENANT_FIRST = [
  'Alex',
  'Sam',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Jamie',
  'Riley',
  'Avery',
  'Quinn',
];
const TENANT_LAST = [
  'Lee',
  'Tan',
  'Smith',
  'Khan',
  'Garcia',
  'Silva',
  'Müller',
  'Rossi',
  'Kim',
  'Patel',
];

/** Step 5 (property part): renovations, value, condition, upkeep, tenants and sales. */
export function processProperties(world: World): void {
  for (const id of sortedKeys(world.properties)) {
    const property = world.properties[id];
    if (property?.status !== 'owned') continue;
    const owner = world.characters[property.owners[0]?.ownerId ?? ''];
    if (owner?.death !== null) continue;
    const { country } = getLocation(property.locationId);
    const cur = currencyFor(country.code);
    if (property.renovation && property.renovation.endTick <= world.tick) {
      property.premiumBp = Math.min(
        2500,
        property.premiumBp + RENOVATION[property.renovation.level].premiumBp,
      );
      property.condition = Math.max(property.condition, 950);
      property.renovation = null;
      addNotification(
        world,
        'property',
        'ntf.renovationDone',
        { kind: property.kind },
        'property',
        property.id,
      );
    }
    property.condition = clamp(property.condition - (property.tenant ? 4 : 2), 0, 1000);
    revalue(world, property);
    const upkeep = divRound(applyBp(property.valueMinor, UPKEEP_BP), 12n);
    const payer = payerIn(world, owner, cur, upkeep);
    if (payer)
      payExpense(
        world,
        payer,
        'propertyUpkeep',
        upkeep,
        'tx.propertyUpkeep',
        { kind: property.kind },
        property.id,
      );

    // Tenants.
    const unemployment = world.economy[country.code]?.unemploymentBp ?? 500;
    if (property.use === 'rental' && property.tenant) {
      const tenant = property.tenant;
      const misses = withRng(world, 'property', (rng) =>
        rng.chancePpm(Math.floor((15_000 * unemployment) / 500)),
      );
      if (misses) {
        tenant.missedPayments += 1;
        if (owner.id === world.activeCharacterId)
          addNotification(
            world,
            'property',
            'ntf.rentMissed',
            { tenant: tenant.name },
            'property',
            property.id,
          );
      } else if (owner.finance && payer) {
        receiveIncome(
          world,
          owner.id,
          payer.checkingId,
          'rent',
          tenant.rentMinor,
          'tx.rentReceived',
          { tenant: tenant.name },
        );
        owner.finance.taxYear.gross += inHomeCurrency(world, owner, tenant.rentMinor, cur);
      }
      if (world.tick >= tenant.leaseEndTick || tenant.missedPayments >= 3) {
        const renews =
          tenant.missedPayments < 2 && withRng(world, 'property', (rng) => rng.int(100) < 65);
        if (renews) {
          tenant.leaseEndTick = world.tick + 12;
          tenant.rentMinor = maxBig(tenant.rentMinor, property.rentMinor);
        } else {
          property.tenant = null;
          if (owner.id === world.activeCharacterId)
            addNotification(
              world,
              'property',
              'ntf.tenantLeft',
              { tenant: tenant.name },
              'property',
              property.id,
            );
        }
      }
    } else if (property.use === 'rental' && !property.renovation) {
      const market = marketRent(property.valueMinor);
      const pricePercent = market > 0n ? Number((property.rentMinor * 100n) / market) : 100;
      const chance = clamp(
        75 - (pricePercent - 100) * 2 - (property.condition < 400 ? 30 : 0),
        3,
        95,
      );
      if (withRng(world, 'property', (rng) => rng.int(100) < chance)) {
        const name = withRng(
          world,
          'property',
          (rng) => `${rng.pick(TENANT_FIRST)} ${rng.pick(TENANT_LAST)}`,
        );
        property.tenant = {
          name,
          sinceTick: world.tick,
          leaseEndTick: world.tick + 12,
          rentMinor: property.rentMinor,
          missedPayments: 0,
        };
        if (owner.id === world.activeCharacterId)
          addNotification(
            world,
            'property',
            'ntf.newTenant',
            { tenant: name },
            'property',
            property.id,
          );
      }
    }

    // Repossession after repeated missed mortgage payments.
    const mortgage = property.mortgageAccountId
      ? world.ledger.accounts[property.mortgageAccountId]
      : undefined;
    if (
      mortgage?.loan &&
      mortgage.closedTick === null &&
      mortgage.loan.missedPayments >= REPOSSESSION_MISSES
    ) {
      completeSale(world, property, applyPercent(property.valueMinor, 85), 'repossessed');
      continue;
    }
    // Sales of listed properties.
    if (property.listedTick !== null && world.tick > property.listedTick) {
      const cycle = world.economy[country.code]?.cycle ?? 0;
      if (
        withRng(
          world,
          'property',
          (rng) => rng.int(100) < clamp(35 + Math.trunc(cycle / 4), 10, 70),
        )
      ) {
        const price = applyPercent(
          property.valueMinor,
          withRng(world, 'property', (rng) => rng.range(95, 105)),
        );
        completeSale(world, property, price, 'sold');
      }
    }
  }
  const player = world.characters[world.activeCharacterId];
  if (player) sweepAbroad(world, player);
  refreshListings(world);
}

export function playerProperties(world: World): Property[] {
  return sortedValues(world.properties).filter(
    (p) => p.status === 'owned' && p.owners.some((o) => o.ownerId === world.activeCharacterId),
  );
}

export { medianWage };
