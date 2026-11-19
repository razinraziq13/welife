import { clamp, sortedKeys, sortedValues } from '../core/data';
import {
  amortisedPayment,
  applyBp,
  applyPercent,
  divRound,
  maxBig,
  minBig,
  monthlyInterest,
} from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { convertCurrency } from '../economy/fx';
import { convert, medianWage } from '../economy/economy';
import { payExpense, receiveIncome } from '../economy/finance';
import { balanceOf, categoryAccount, openAccount, post } from '../economy/ledger';
import { createNpc, newNpcHousehold } from '../social/npcs';
import { linkPair } from '../social/relationships';
import { getCountry, getLocation } from '../world/countries';
import { countryMarket } from '../world/markets';
import type {
  Branch,
  Business,
  Character,
  Competitor,
  OwnerShare,
  Statement,
  World,
} from '../state/schema';
import {
  EMPLOYER_ONCOST_PERCENT,
  FAILURE_MONTHS,
  MANAGER_WAGES,
  OTHER_COSTS_PERCENT,
  OUTLET_FIXED_PERCENT,
  SEVERANCE_MONTHS,
  SUPPLIERS,
  findBusinessType,
  getBusinessType,
  type BusinessType,
} from './catalog';

/**
 * Companies (spec §4 Business): ownership, cash, inventory and capacity, pricing, staff,
 * wages, marketing, branches (also abroad), demand, competitors, taxes, liabilities and a
 * monthly statement:
 *   operatingProfit = revenue - operating expenses
 *   netProfit = operatingProfit - interest - taxes
 * Revenue and payroll happen once per month per company, whoever is playing. Every amount
 * is posted to the balanced ledger; owners' stakes follow the company's book equity.
 */

export const MAX_BUSINESSES = 6;

export type BusinessRejection =
  | 'tooYoung'
  | 'unknownType'
  | 'unknownLocation'
  | 'unknownBusiness'
  | 'notOwner'
  | 'tooMany'
  | 'noAccount'
  | 'capitalTooLow'
  | 'insufficientFunds'
  | 'businessCash'
  | 'unknownBranch'
  | 'lastBranch'
  | 'branchExists'
  | 'tooManyBranches'
  | 'invalid'
  | 'noChange'
  | 'unknownCompetitor'
  | 'wrongType'
  | 'notInterested'
  | 'loanRefused'
  | 'unknownLoan';

export const BUSINESS_MESSAGES: Record<BusinessRejection, string> = {
  tooYoung: 'You must be 18 or older to run a company.',
  unknownType: 'Unknown kind of business.',
  unknownLocation: 'Unknown place.',
  unknownBusiness: 'Unknown company.',
  notOwner: 'Only the company’s owners can do this.',
  tooMany: `You can own at most ${String(MAX_BUSINESSES)} companies.`,
  noAccount: 'You need a current account first.',
  capitalTooLow: 'That is not enough to set up and run the business for its first months.',
  insufficientFunds: 'You do not have that much money available.',
  businessCash: 'The company does not have enough cash for this.',
  unknownBranch: 'Unknown branch.',
  lastBranch: 'A company needs at least one branch. Close or sell the company instead.',
  branchExists: 'The company already has a branch there.',
  tooManyBranches: 'A company can have at most 20 branches.',
  invalid: 'That value is not allowed.',
  noChange: 'That is already the setting.',
  unknownCompetitor: 'Unknown competitor.',
  wrongType: 'You can only buy a competitor in the same line of business.',
  notInterested: 'Investors want to see a profitable track record first (at least six months).',
  loanRefused: 'The bank will not lend that much to this company.',
  unknownLoan: 'Unknown loan.',
};

export class BusinessError extends Error {
  readonly code: BusinessRejection;
  constructor(code: BusinessRejection) {
    super(BUSINESS_MESSAGES[code]);
    this.name = 'BusinessError';
    this.code = code;
  }
}

// ----------------------------------------------------------------------------------------
// Local economics
// ----------------------------------------------------------------------------------------

function local(world: World, locationId: string) {
  const { country, location } = getLocation(locationId);
  return { code: country.code, location, median: medianWage(world, country.code) };
}

/** Reference price per unit at a location (local currency). */
export function refPrice(world: World, type: BusinessType, locationId: string): bigint {
  const l = local(world, locationId);
  return applyPercent(applyBp(l.median, type.refPriceBp), l.location.costIndex);
}

export function staffWage(world: World, type: BusinessType, locationId: string): bigint {
  const l = local(world, locationId);
  return applyPercent(
    applyPercent(l.median, type.wagePercent),
    Math.floor((l.location.costIndex + 100) / 2),
  );
}

export function outletRent(world: World, type: BusinessType, locationId: string): bigint {
  const l = local(world, locationId);
  return applyPercent(applyPercent(l.median, type.rentPercent), l.location.costIndex);
}

export function setupCost(world: World, type: BusinessType, locationId: string): bigint {
  const l = local(world, locationId);
  return applyPercent(l.median * BigInt(type.setupMonths), l.location.costIndex);
}

/** Smallest sensible starting capital: set-up plus three months of running costs (local). */
export function minimumCapital(world: World, type: BusinessType, locationId: string): bigint {
  const running =
    staffWage(world, type, locationId) * BigInt(type.startStaff) +
    outletRent(world, type, locationId) +
    (type.goods
      ? applyPercent(refPrice(world, type, locationId), type.unitCostPercent) *
        BigInt(type.capacityPerStaff * type.startStaff)
      : 0n);
  return setupCost(world, type, locationId) + running * 3n;
}

/** Attractiveness of an offer: quality, brand and price against the reference. */
export function offerScore(
  quality: number,
  brand: number,
  pricePercent: number,
  elasticity: number,
): number {
  const qualityMult = 50 + Math.floor(quality / 10);
  const brandMult = 70 + Math.floor(brand / 20);
  const priceMult = clamp(100 - Math.floor(((pricePercent - 100) * elasticity) / 100), 15, 250);
  return Math.max(1, Math.floor((qualityMult * brandMult * priceMult) / 100));
}

/** Demand in a local market: per-outlet demand times the outlets there, scaled by the economy. */
function marketUnits(
  world: World,
  type: BusinessType,
  locationId: string,
  outlets: number,
): number {
  const l = local(world, locationId);
  const cycle = world.economy[l.code]?.cycle ?? 0;
  const ruralFactor = l.location.kind === 'rural' ? 60 : 100;
  return Math.floor(
    (type.marketDemand * outlets * ruralFactor * (100 + Math.trunc(cycle / 4))) / 10_000,
  );
}

export function competitorsAt(world: World, typeId: string, locationId: string): Competitor[] {
  return sortedValues(world.competitors).filter(
    (c) => c.status === 'active' && c.typeId === typeId && c.locationId === locationId,
  );
}

const COMPETITOR_PREFIX = [
  'Harbour',
  'Corner',
  'Golden',
  'Urban',
  'Royal',
  'Green',
  'Sunrise',
  'Blue Door',
  'Maple',
  'Northside',
  'Riverside',
  'Star',
];

function newCompetitor(world: World, typeId: string, locationId: string): Competitor {
  const type = getBusinessType(typeId);
  const competitor: Competitor = withRng(world, 'business', (rng) => ({
    id: nextId(world, 'cmp'),
    name: `${rng.pick(COMPETITOR_PREFIX)} ${type.name}`,
    typeId,
    locationId,
    quality: rng.range(300, 700),
    brand: rng.range(250, 650),
    pricePercent: rng.range(85, 120),
    size: rng.range(1, 3),
    status: 'active',
    sinceTick: world.tick,
  }));
  world.competitors[competitor.id] = competitor;
  return competitor;
}

/** Every market the player enters already has local competitors. */
export function ensureCompetitors(world: World, typeId: string, locationId: string): void {
  if (competitorsAt(world, typeId, locationId).length > 0) return;
  const { location } = getLocation(locationId);
  const count = withRng(world, 'business', (rng) =>
    location.kind === 'rural' ? rng.range(1, 2) : rng.range(2, 4),
  );
  for (let i = 0; i < count; i++) newCompetitor(world, typeId, locationId);
}

// ----------------------------------------------------------------------------------------
// Ownership and valuation
// ----------------------------------------------------------------------------------------

export function ownerShare(business: Business, ownerId: string): OwnerShare | undefined {
  return business.owners.find((o) => o.ownerId === ownerId);
}

/** Book equity: cash less the company's debts (business currency). */
export function bookEquity(world: World, business: Business): bigint {
  let equity = balanceOf(world, business.cashAccountId);
  for (const a of sortedValues(world.ledger.accounts)) {
    if (
      a.ownerId === business.id &&
      (a.type === 'loan' || a.type === 'arrears') &&
      a.closedTick === null
    )
      equity -= a.balance;
  }
  return equity;
}

/** Market value: book equity plus a multiple of recent yearly profit (never below zero). */
export function marketValuation(world: World, business: Business): bigint {
  const type = getBusinessType(business.typeId);
  const recent = business.history.slice(-12);
  const months = BigInt(Math.max(1, recent.length));
  const profit = recent.reduce((s, h) => s + h.netProfit, 0n);
  const yearly = (profit * 12n) / months;
  const value = bookEquity(world, business) + maxBig(0n, yearly) * BigInt(type.profitMultiple);
  return maxBig(0n, value);
}

/** Keeps every tracked owner's stake account equal to their share of book equity. */
export function revalueStakes(world: World, business: Business): void {
  const equity = maxBig(0n, bookEquity(world, business));
  for (const owner of business.owners) {
    if (!owner.stakeAccountId) continue;
    const account = world.ledger.accounts[owner.stakeAccountId];
    const person = world.characters[owner.ownerId];
    if (!account || !person || account.closedTick !== null) continue;
    // Valued in the stake account's own currency (owners may live abroad or have inherited).
    const target = convertCurrency(
      world,
      applyBp(equity, owner.sharesBp),
      business.currency,
      account.currency,
    );
    const change = target - account.balance;
    if (change > 0n) {
      post(
        world,
        'tx.businessValue',
        [
          { accountId: account.id, debit: change },
          {
            accountId: categoryAccount(
              world,
              person.id,
              'income',
              'businessGains',
              account.currency,
            ),
            credit: change,
          },
        ],
        { params: { business: business.name } },
      );
    } else if (change < 0n) {
      post(
        world,
        'tx.businessValue',
        [
          {
            accountId: categoryAccount(
              world,
              person.id,
              'expense',
              'businessLosses',
              account.currency,
            ),
            debit: -change,
          },
          { accountId: account.id, credit: -change },
        ],
        { params: { business: business.name } },
      );
    }
  }
}

/** Ownership changes keep the shares adding up to exactly 100%. */
function normaliseShares(owners: OwnerShare[]): void {
  const total = owners.reduce((s, o) => s + o.sharesBp, 0);
  const diff = 10_000 - total;
  if (diff !== 0 && owners.length > 0) {
    const largest = owners.reduce((a, b) => (b.sharesBp > a.sharesBp ? b : a));
    largest.sharesBp += diff;
  }
}

function requireOwned(world: World, player: Character, businessId: string): Business {
  const business = world.businesses[businessId];
  if (business?.status !== 'active') throw new BusinessError('unknownBusiness');
  if (!ownerShare(business, player.id)) throw new BusinessError('notOwner');
  return business;
}

function playerChecking(player: Character): string {
  const id = player.finance?.checkingId;
  if (!id) throw new BusinessError('noAccount');
  return id;
}

/** Moves money from the player into the company (player's stake grows by the same value). */
function inject(
  world: World,
  player: Character,
  business: Business,
  amountPlayer: bigint,
  kind: string,
): void {
  const checking = playerChecking(player);
  if (balanceOf(world, checking) < amountPlayer) throw new BusinessError('insufficientFunds');
  const owner = ownerShare(business, player.id);
  if (!owner) throw new BusinessError('notOwner');
  const playerCurrency = world.ledger.accounts[checking]?.currency ?? 'USD';
  owner.stakeAccountId ??= openAccount(world, player.id, 'stake', playerCurrency, {
    category: business.id,
  });
  const amountBusiness = convert(world, amountPlayer, player.countryCode, business.countryCode);
  post(
    world,
    kind,
    [
      { accountId: owner.stakeAccountId, debit: amountPlayer },
      { accountId: checking, credit: amountPlayer },
    ],
    { params: { business: business.name } },
  );
  post(
    world,
    kind,
    [
      { accountId: business.cashAccountId, debit: amountBusiness },
      {
        accountId: categoryAccount(world, business.id, 'equity', 'capital', business.currency),
        credit: amountBusiness,
      },
    ],
    { params: { business: business.name } },
  );
}

// ----------------------------------------------------------------------------------------
// Player actions
// ----------------------------------------------------------------------------------------

function newBranch(world: World, type: BusinessType, locationId: string): Branch {
  return {
    id: nextId(world, 'brn'),
    locationId,
    staff: type.startStaff,
    wageMinor: staffWage(world, type, locationId),
    pricePercent: 100,
    rentMinor: outletRent(world, type, locationId),
    inventory: 0,
    stockTarget: type.goods ? type.capacityPerStaff * type.startStaff : 0,
    openedTick: world.tick,
    lastDemand: 0,
    lastSold: 0,
  };
}

/** Pays a one-off cost from company cash (refused if the cash is not there). */
function spend(
  world: World,
  business: Business,
  category: string,
  amount: bigint,
  kind: string,
): void {
  if (balanceOf(world, business.cashAccountId) < amount) throw new BusinessError('businessCash');
  post(
    world,
    kind,
    [
      {
        accountId: categoryAccount(world, business.id, 'expense', category, business.currency),
        debit: amount,
      },
      { accountId: business.cashAccountId, credit: amount },
    ],
    { params: { business: business.name } },
  );
}

export function startBusiness(
  world: World,
  player: Character,
  input: { typeId: string; locationId: string; name: string; capitalMinor: bigint },
): Business {
  if (ageYears(world, player) < 18) throw new BusinessError('tooYoung');
  const type = findBusinessType(input.typeId);
  if (!type) throw new BusinessError('unknownType');
  let where;
  try {
    where = getLocation(input.locationId);
  } catch {
    throw new BusinessError('unknownLocation');
  }
  const owned = sortedValues(world.businesses).filter(
    (b) => b.status === 'active' && ownerShare(b, player.id),
  );
  if (owned.length >= MAX_BUSINESSES) throw new BusinessError('tooMany');
  playerChecking(player);
  const code = where.country.code;
  const capitalLocal = convert(world, input.capitalMinor, player.countryCode, code);
  if (capitalLocal < minimumCapital(world, type, input.locationId))
    throw new BusinessError('capitalTooLow');
  const currency = getCountry(code).currency.code;
  const id = nextId(world, 'biz');
  const business: Business = {
    id,
    name: input.name.trim().slice(0, 60) || type.name,
    typeId: type.id,
    countryCode: code,
    currency,
    foundedTick: world.tick,
    status: 'active',
    owners: [{ ownerId: player.id, sharesBp: 10_000, stakeAccountId: null }],
    cashAccountId: '',
    quality: 500,
    brand: 300,
    marketingMinor: applyPercent(medianWage(world, code), 20),
    supplier: 'standard',
    manager: 'owner',
    managerSkill: 0,
    branches: [],
    statement: null,
    history: [],
    distressMonths: 0,
    closedTick: null,
  };
  world.businesses[id] = business;
  business.cashAccountId = openAccount(world, id, 'checking', currency);
  inject(world, player, business, input.capitalMinor, 'tx.businessCapital');
  spend(world, business, 'setup', setupCost(world, type, input.locationId), 'tx.businessSetup');
  business.branches.push(newBranch(world, type, input.locationId));
  ensureCompetitors(world, type.id, input.locationId);
  revalueStakes(world, business);
  addBiography(world, player.id, 'business', 'bio.businessStarted', {
    business: business.name,
    typeId: type.id,
  });
  addNotification(
    world,
    'business',
    'ntf.businessStarted',
    { business: business.name },
    'business',
    business.id,
  );
  return business;
}

export function openBranch(
  world: World,
  player: Character,
  businessId: string,
  locationId: string,
): Branch {
  const business = requireOwned(world, player, businessId);
  const type = getBusinessType(business.typeId);
  try {
    getLocation(locationId);
  } catch {
    throw new BusinessError('unknownLocation');
  }
  if (business.branches.some((b) => b.locationId === locationId))
    throw new BusinessError('branchExists');
  if (business.branches.length >= 20) throw new BusinessError('tooManyBranches');
  const { country } = getLocation(locationId);
  const cost = convert(
    world,
    setupCost(world, type, locationId),
    country.code,
    business.countryCode,
  );
  spend(world, business, 'setup', cost, 'tx.branchSetup');
  const branch = newBranch(world, type, locationId);
  business.branches.push(branch);
  ensureCompetitors(world, type.id, locationId);
  revalueStakes(world, business);
  addNotification(
    world,
    'business',
    'ntf.branchOpened',
    { business: business.name, location: getLocation(locationId).location.name },
    'business',
    business.id,
  );
  return branch;
}

function findBranch(business: Business, branchId: string): Branch {
  const branch = business.branches.find((b) => b.id === branchId);
  if (!branch) throw new BusinessError('unknownBranch');
  return branch;
}

function severance(world: World, business: Business, branch: Branch, people: number): bigint {
  const local = branch.wageMinor * BigInt(people * SEVERANCE_MONTHS);
  return convert(world, local, getLocation(branch.locationId).country.code, business.countryCode);
}

export function closeBranch(
  world: World,
  player: Character,
  businessId: string,
  branchId: string,
): void {
  const business = requireOwned(world, player, businessId);
  const branch = findBranch(business, branchId);
  if (business.branches.length <= 1) throw new BusinessError('lastBranch');
  const pay = severance(world, business, branch, branch.staff);
  if (pay > 0n) spend(world, business, 'severance', pay, 'tx.severance');
  business.branches = business.branches.filter((b) => b.id !== branchId);
  revalueStakes(world, business);
}

export function setStaff(
  world: World,
  player: Character,
  businessId: string,
  branchId: string,
  staff: number,
): void {
  const business = requireOwned(world, player, businessId);
  const branch = findBranch(business, branchId);
  if (!Number.isInteger(staff) || staff < 0 || staff > 500) throw new BusinessError('invalid');
  if (staff === branch.staff) throw new BusinessError('noChange');
  if (staff < branch.staff) {
    const pay = severance(world, business, branch, branch.staff - staff);
    if (pay > 0n) spend(world, business, 'severance', pay, 'tx.severance');
  }
  branch.staff = staff;
  revalueStakes(world, business);
}

export function setPrice(
  world: World,
  player: Character,
  businessId: string,
  branchId: string,
  pricePercent: number,
): void {
  const branch = findBranch(requireOwned(world, player, businessId), branchId);
  if (!Number.isInteger(pricePercent) || pricePercent < 50 || pricePercent > 250)
    throw new BusinessError('invalid');
  if (branch.pricePercent === pricePercent) throw new BusinessError('noChange');
  branch.pricePercent = pricePercent;
}

export function setStockTarget(
  world: World,
  player: Character,
  businessId: string,
  branchId: string,
  units: number,
): void {
  const business = requireOwned(world, player, businessId);
  if (!getBusinessType(business.typeId).goods) throw new BusinessError('invalid');
  const branch = findBranch(business, branchId);
  if (!Number.isInteger(units) || units < 0 || units > 1_000_000)
    throw new BusinessError('invalid');
  if (branch.stockTarget === units) throw new BusinessError('noChange');
  branch.stockTarget = units;
}

export function setMarketing(
  world: World,
  player: Character,
  businessId: string,
  amount: bigint,
): void {
  const business = requireOwned(world, player, businessId);
  if (amount < 0n) throw new BusinessError('invalid');
  if (business.marketingMinor === amount) throw new BusinessError('noChange');
  business.marketingMinor = amount;
}

export function setSupplier(
  world: World,
  player: Character,
  businessId: string,
  supplier: Business['supplier'],
): void {
  const business = requireOwned(world, player, businessId);
  if (business.supplier === supplier) throw new BusinessError('noChange');
  business.supplier = supplier;
}

export function setManager(
  world: World,
  player: Character,
  businessId: string,
  manager: Business['manager'],
): void {
  const business = requireOwned(world, player, businessId);
  if (business.manager === manager) throw new BusinessError('noChange');
  business.manager = manager;
  if (manager === 'hired')
    business.managerSkill = withRng(world, 'business', (rng) => rng.range(400, 750));
}

export function investInBusiness(
  world: World,
  player: Character,
  businessId: string,
  amount: bigint,
): void {
  const business = requireOwned(world, player, businessId);
  if (amount <= 0n) throw new BusinessError('invalid');
  inject(world, player, business, amount, 'tx.businessCapital');
  revalueStakes(world, business);
}

/** Pays a dividend to every owner by share (the player's part arrives in their account). */
export function payDividend(
  world: World,
  player: Character,
  businessId: string,
  amount: bigint,
): void {
  const business = requireOwned(world, player, businessId);
  if (amount <= 0n) throw new BusinessError('invalid');
  if (balanceOf(world, business.cashAccountId) < amount) throw new BusinessError('businessCash');
  post(
    world,
    'tx.dividendPaid',
    [
      {
        accountId: categoryAccount(world, business.id, 'equity', 'dividends', business.currency),
        debit: amount,
      },
      { accountId: business.cashAccountId, credit: amount },
    ],
    { params: { business: business.name } },
  );
  for (const owner of business.owners) {
    const person = world.characters[owner.ownerId];
    const checking = person?.finance?.checkingId;
    if (!person || !checking || !owner.stakeAccountId) continue;
    const part = convert(
      world,
      applyBp(amount, owner.sharesBp),
      business.countryCode,
      person.countryCode,
    );
    receiveIncome(world, person.id, checking, 'dividends', part, 'tx.dividend', {
      business: business.name,
    });
  }
  revalueStakes(world, business);
}

/** An investor buys newly issued shares; everyone else is diluted (shares still total 100%). */
export function raiseInvestment(
  world: World,
  player: Character,
  businessId: string,
  percent: number,
): Character {
  const business = requireOwned(world, player, businessId);
  if (!Number.isInteger(percent) || percent < 5 || percent > 49) throw new BusinessError('invalid');
  const recent = business.history.slice(-6);
  if (recent.length < 6 || recent.reduce((s, h) => s + h.netProfit, 0n) <= 0n)
    throw new BusinessError('notInterested');
  const pre = marketValuation(world, business);
  const investment = divRound(pre * BigInt(percent), BigInt(100 - percent));
  const household = newNpcHousehold(
    world,
    business.branches[0]?.locationId ?? player.locationId,
    'wealthy',
  );
  const investor = createNpc(world, {
    countryCode: business.countryCode,
    householdId: household.id,
    ageYears: withRng(world, 'business', (rng) => rng.range(35, 65)),
    tier: 'relevant',
    wealth: 'wealthy',
  });
  investor.flags['role.investor'] = true;
  linkPair(world, player, investor, 'acquaintance', 'acquaintance', { closeness: 30, respect: 60 });
  const newBp = percent * 100;
  for (const o of business.owners)
    o.sharesBp = Math.floor((o.sharesBp * (10_000 - newBp)) / 10_000);
  business.owners.push({ ownerId: investor.id, sharesBp: newBp, stakeAccountId: null });
  normaliseShares(business.owners);
  post(
    world,
    'tx.investmentRaised',
    [
      { accountId: business.cashAccountId, debit: investment },
      {
        accountId: categoryAccount(world, business.id, 'equity', 'capital', business.currency),
        credit: investment,
      },
    ],
    { params: { business: business.name } },
  );
  revalueStakes(world, business);
  addBiography(world, player.id, 'business', 'bio.investmentRaised', {
    business: business.name,
    percent,
  });
  return investor;
}

/** Ends the player's involvement: proceeds are paid out and the stake account closes. */
function settleStake(
  world: World,
  business: Business,
  owner: OwnerShare,
  proceedsBusiness: bigint,
  kind: string,
): void {
  const person = world.characters[owner.ownerId];
  if (!person || !owner.stakeAccountId) return;
  const account = world.ledger.accounts[owner.stakeAccountId];
  const checking = person.finance?.checkingId;
  if (!account || !checking) return;
  const proceeds = maxBig(
    0n,
    convert(world, proceedsBusiness, business.countryCode, person.countryCode),
  );
  const book = account.balance;
  const entries = [
    { accountId: checking, debit: proceeds },
    { accountId: account.id, credit: book },
  ];
  if (proceeds > book)
    entries.push({
      accountId: categoryAccount(world, person.id, 'income', 'capitalGains', account.currency),
      credit: proceeds - book,
    });
  if (proceeds < book)
    entries.push({
      accountId: categoryAccount(world, person.id, 'expense', 'capitalLosses', account.currency),
      debit: book - proceeds,
    });
  post(world, kind, entries, { params: { business: business.name } });
  account.closedTick = world.tick;
}

export function sellBusiness(world: World, player: Character, businessId: string): bigint {
  const business = requireOwned(world, player, businessId);
  const price = applyPercent(
    marketValuation(world, business),
    withRng(world, 'business', (rng) => rng.range(85, 110)),
  );
  revalueStakes(world, business);
  for (const owner of business.owners)
    settleStake(world, business, owner, applyBp(price, owner.sharesBp), 'tx.businessSold');
  business.status = 'sold';
  business.closedTick = world.tick;
  addBiography(world, player.id, 'business', 'bio.businessSold', {
    business: business.name,
    amount: price.toString(),
  });
  addNotification(
    world,
    'business',
    'ntf.businessSold',
    { business: business.name },
    'business',
    business.id,
  );
  return price;
}

/** Winds a company up: staff are paid off, debts settled as far as cash allows, the rest returned. */
export function closeBusiness(world: World, business: Business, reason: 'closed' | 'failed'): void {
  for (const branch of business.branches) {
    const pay = minBig(
      severance(world, business, branch, branch.staff),
      maxBig(0n, balanceOf(world, business.cashAccountId)),
    );
    if (pay > 0n) spend(world, business, 'severance', pay, 'tx.severance');
  }
  for (const a of sortedValues(world.ledger.accounts)) {
    if (
      a.ownerId !== business.id ||
      (a.type !== 'loan' && a.type !== 'arrears') ||
      a.balance === 0n
    )
      continue;
    const pay = minBig(a.balance, maxBig(0n, balanceOf(world, business.cashAccountId)));
    if (pay > 0n)
      post(world, 'tx.debtSettled', [
        { accountId: a.id, debit: pay },
        { accountId: business.cashAccountId, credit: pay },
      ]);
    // Limited liability: anything still owed is written off against the company's equity.
    if (a.balance > 0n)
      post(world, 'tx.debtWrittenOff', [
        { accountId: a.id, debit: a.balance },
        {
          accountId: categoryAccount(world, business.id, 'equity', 'writtenOff', business.currency),
          credit: a.balance,
        },
      ]);
    a.closedTick = world.tick;
  }
  const remaining = maxBig(0n, balanceOf(world, business.cashAccountId));
  if (remaining > 0n) {
    post(world, 'tx.capitalReturned', [
      {
        accountId: categoryAccount(world, business.id, 'equity', 'returned', business.currency),
        debit: remaining,
      },
      { accountId: business.cashAccountId, credit: remaining },
    ]);
  }
  for (const owner of business.owners)
    settleStake(world, business, owner, applyBp(remaining, owner.sharesBp), 'tx.businessClosed');
  business.status = 'closed';
  business.closedTick = world.tick;
  business.branches = [];
  const player = world.characters[world.activeCharacterId];
  if (player && ownerShare(business, player.id)) {
    addBiography(
      world,
      player.id,
      'business',
      reason === 'failed' ? 'bio.businessFailed' : 'bio.businessClosed',
      { business: business.name },
    );
    addNotification(
      world,
      'business',
      reason === 'failed' ? 'ntf.businessFailed' : 'ntf.businessClosed',
      { business: business.name },
      'business',
      business.id,
    );
  }
}

export function closeOwnBusiness(world: World, player: Character, businessId: string): void {
  closeBusiness(world, requireOwned(world, player, businessId), 'closed');
}

export function acquisitionPrice(world: World, competitor: Competitor): bigint {
  const type = getBusinessType(competitor.typeId);
  const base = setupCost(world, type, competitor.locationId) * BigInt(competitor.size);
  const premium = 100 + Math.floor(competitor.quality / 10) + Math.floor(competitor.brand / 20);
  return applyPercent(base, premium);
}

/** Buys a competitor: its outlets become a branch of one of your companies of the same type. */
export function acquireCompetitor(
  world: World,
  player: Character,
  businessId: string,
  competitorId: string,
): void {
  const business = requireOwned(world, player, businessId);
  const competitor = world.competitors[competitorId];
  if (competitor?.status !== 'active') throw new BusinessError('unknownCompetitor');
  if (competitor.typeId !== business.typeId) throw new BusinessError('wrongType');
  const type = getBusinessType(business.typeId);
  const { country } = getLocation(competitor.locationId);
  const price = convert(
    world,
    acquisitionPrice(world, competitor),
    country.code,
    business.countryCode,
  );
  spend(world, business, 'acquisitions', price, 'tx.acquisition');
  const existing = business.branches.find((b) => b.locationId === competitor.locationId);
  const extraStaff = type.startStaff * competitor.size;
  if (existing) {
    existing.staff += extraStaff;
    existing.stockTarget += type.goods ? type.capacityPerStaff * extraStaff : 0;
  } else {
    if (business.branches.length >= 20) throw new BusinessError('tooManyBranches');
    const branch = newBranch(world, type, competitor.locationId);
    branch.staff = extraStaff;
    branch.stockTarget = type.goods ? type.capacityPerStaff * extraStaff : 0;
    business.branches.push(branch);
  }
  business.brand = clamp(business.brand + Math.floor(competitor.brand / 10), 0, 1000);
  competitor.status = 'acquired';
  revalueStakes(world, business);
  addBiography(world, player.id, 'business', 'bio.acquired', {
    business: business.name,
    competitor: competitor.name,
  });
}

export function businessLoanLimit(world: World, business: Business): bigint {
  const revenue = business.history.slice(-3).reduce((s, h) => s + h.revenue, 0n);
  const equity = maxBig(0n, bookEquity(world, business));
  return maxBig(equity, (revenue / 3n) * 6n);
}

export function takeBusinessLoan(
  world: World,
  player: Character,
  businessId: string,
  amount: bigint,
  months: number,
): void {
  const business = requireOwned(world, player, businessId);
  if (amount <= 0n || months < 6 || months > 120) throw new BusinessError('invalid');
  let owed = 0n;
  for (const a of sortedValues(world.ledger.accounts))
    if (a.ownerId === business.id && a.type === 'loan' && a.closedTick === null) owed += a.balance;
  if (owed + amount > businessLoanLimit(world, business) || business.distressMonths > 0)
    throw new BusinessError('loanRefused');
  const policy = world.economy[business.countryCode]?.policyRateBp ?? 300;
  const rateBp = clamp(policy + 400, 0, 4000);
  const loanId = openAccount(world, business.id, 'loan', business.currency, {
    category: 'business',
    loan: {
      product: 'business',
      rateBp,
      termMonths: months,
      paymentMinor: amortisedPayment(amount, rateBp, months),
      principalMinor: amount,
      firstPaymentTick: world.tick + 1,
      missedPayments: 0,
    },
  });
  post(
    world,
    'tx.loanDrawn',
    [
      { accountId: business.cashAccountId, debit: amount },
      { accountId: loanId, credit: amount },
    ],
    { params: { product: 'business' } },
  );
  revalueStakes(world, business);
}

export function repayBusinessLoan(
  world: World,
  player: Character,
  businessId: string,
  loanId: string,
  amount: bigint,
): void {
  const business = requireOwned(world, player, businessId);
  const loan = world.ledger.accounts[loanId];
  if (loan?.ownerId !== business.id || loan.type !== 'loan' || loan.closedTick !== null)
    throw new BusinessError('unknownLoan');
  const pay = minBig(amount, loan.balance);
  if (pay <= 0n) throw new BusinessError('invalid');
  if (balanceOf(world, business.cashAccountId) < pay) throw new BusinessError('businessCash');
  post(world, 'tx.loanRepaid', [
    { accountId: loanId, debit: pay },
    { accountId: business.cashAccountId, credit: pay },
  ]);
  if (loan.balance === 0n) loan.closedTick = world.tick;
  revalueStakes(world, business);
}

// ----------------------------------------------------------------------------------------
// The month (spec §4 step 5)
// ----------------------------------------------------------------------------------------

function ownerSkill(world: World, business: Business, type: BusinessType): number {
  if (business.manager === 'hired') return business.managerSkill;
  const owner =
    business.owners
      .map((o) => world.characters[o.ownerId])
      .find((c) => c?.id === world.activeCharacterId) ??
    world.characters[business.owners[0]?.ownerId ?? ''];
  if (owner?.death !== null) return 350;
  const keys = [...type.skills, 'business' as const];
  return Math.floor(keys.reduce((s, k) => s + owner.skills[k], 0) / keys.length);
}

interface BranchResult {
  demanded: number;
  sold: number;
  revenue: bigint;
  cogs: bigint;
  wages: bigint;
  rent: bigint;
  other: bigint;
  overloaded: boolean;
}

function runBranch(
  world: World,
  business: Business,
  type: BusinessType,
  branch: Branch,
): BranchResult {
  const { country } = getLocation(branch.locationId);
  const toBusiness = (amount: bigint) => convert(world, amount, country.code, business.countryCode);
  const price = applyPercent(refPrice(world, type, branch.locationId), branch.pricePercent);
  const unitCost = applyPercent(
    applyPercent(refPrice(world, type, branch.locationId), type.unitCostPercent),
    SUPPLIERS[business.supplier].costPercent,
  );
  const mine = offerScore(business.quality, business.brand, branch.pricePercent, type.elasticity);
  let others = 0;
  let outlets = 1;
  for (const c of competitorsAt(world, type.id, branch.locationId)) {
    others += offerScore(c.quality, c.brand, c.pricePercent, type.elasticity) * c.size;
    outlets += c.size;
  }
  // Difficulty (spec §4): Challenging raises competition, Casual eases it (PROPOSED TUNING).
  const rivalry =
    world.rules.difficulty === 'challenging' ? 120 : world.rules.difficulty === 'casual' ? 85 : 100;
  others = Math.floor((others * rivalry) / 100);
  const market = marketUnits(world, type, branch.locationId, outlets);
  const demanded = Math.floor((market * mine) / (mine + others));
  const capacity = branch.staff * type.capacityPerStaff;
  let purchased = 0;
  if (type.goods) {
    purchased = Math.max(0, branch.stockTarget - branch.inventory);
    branch.inventory += purchased;
  }
  const available = type.goods ? Math.min(capacity, branch.inventory) : capacity;
  const sold = Math.min(demanded, available);
  if (type.goods) {
    branch.inventory -= sold;
    branch.inventory -= Math.floor((branch.inventory * type.spoilagePercent) / 100);
  }
  branch.lastDemand = demanded;
  branch.lastSold = sold;
  const revenueLocal = price * BigInt(sold);
  const cogsLocal = unitCost * BigInt(type.goods ? purchased : sold);
  const wagesLocal = applyPercent(
    branch.wageMinor * BigInt(branch.staff),
    100 + EMPLOYER_ONCOST_PERCENT,
  );
  const median = medianWage(world, country.code);
  const otherLocal =
    applyPercent(revenueLocal, OTHER_COSTS_PERCENT) + applyPercent(median, OUTLET_FIXED_PERCENT);
  return {
    demanded,
    sold,
    revenue: toBusiness(revenueLocal),
    cogs: toBusiness(cogsLocal),
    wages: toBusiness(wagesLocal),
    rent: toBusiness(branch.rentMinor),
    other: toBusiness(otherLocal),
    overloaded: demanded > Math.floor((capacity * 110) / 100),
  };
}

function businessLoans(world: World, business: Business): { interest: bigint } {
  let interest = 0n;
  const payer = { ownerId: business.id, checkingId: business.cashAccountId, savingsId: null };
  for (const loan of sortedValues(world.ledger.accounts)) {
    if (
      loan.ownerId !== business.id ||
      loan.type !== 'loan' ||
      loan.closedTick !== null ||
      !loan.loan
    )
      continue;
    if (loan.balance <= 0n) {
      loan.closedTick = world.tick;
      continue;
    }
    const due = monthlyInterest(loan.balance, loan.loan.rateBp);
    if (due > 0n) {
      post(world, 'tx.loanInterest', [
        {
          accountId: categoryAccount(world, business.id, 'expense', 'interest', business.currency),
          debit: due,
        },
        { accountId: loan.id, credit: due },
      ]);
      interest += due;
    }
    if (world.tick < loan.loan.firstPaymentTick) continue;
    const payment = minBig(loan.loan.paymentMinor, loan.balance);
    if (balanceOf(world, payer.checkingId) >= payment) {
      post(
        world,
        'tx.loanPayment',
        [
          { accountId: loan.id, debit: payment },
          { accountId: payer.checkingId, credit: payment },
        ],
        { params: { product: 'business' } },
      );
      loan.loan.missedPayments = 0;
    } else loan.loan.missedPayments += 1;
  }
  return { interest };
}

function recordHistory(business: Business, entry: Business['history'][number], tick: number): void {
  business.history.push(entry);
  const cutoff = tick - 24;
  if (business.history.some((h) => h.tick < cutoff && h.tick % 12 !== 11)) {
    business.history = business.history.filter((h) => h.tick >= cutoff || h.tick % 12 === 11);
  }
}

/** One month for one company: sales, costs, tax, loans, statement, quality and brand. */
export function runBusinessMonth(world: World, business: Business): void {
  const type = getBusinessType(business.typeId);
  const results = business.branches.map((b) => runBranch(world, business, type, b));
  const sum = (key: keyof Omit<BranchResult, 'demanded' | 'sold' | 'overloaded'>) =>
    results.reduce((s, r) => s + r[key], 0n);
  const revenue = sum('revenue');
  const cogs = sum('cogs');
  const firstBranch = business.branches[0];
  const managerCost =
    business.manager === 'hired' && firstBranch
      ? convert(
          world,
          firstBranch.wageMinor * BigInt(MANAGER_WAGES),
          getLocation(firstBranch.locationId).country.code,
          business.countryCode,
        )
      : 0n;
  const wages = sum('wages') + managerCost;
  const rent = sum('rent');
  const other = sum('other');
  const marketing = business.marketingMinor;
  const payer = { ownerId: business.id, checkingId: business.cashAccountId, savingsId: null };
  if (revenue > 0n) {
    post(
      world,
      'tx.sales',
      [
        { accountId: business.cashAccountId, debit: revenue },
        {
          accountId: categoryAccount(world, business.id, 'income', 'sales', business.currency),
          credit: revenue,
        },
      ],
      { params: { business: business.name } },
    );
  }
  // Arrears from earlier months are settled first when cash allows.
  const arrears = sortedValues(world.ledger.accounts).find(
    (a) =>
      a.ownerId === business.id && a.type === 'arrears' && a.closedTick === null && a.balance > 0n,
  );
  if (arrears) {
    const pay = minBig(arrears.balance, maxBig(0n, balanceOf(world, business.cashAccountId)));
    if (pay > 0n)
      post(world, 'tx.arrearsPaid', [
        { accountId: arrears.id, debit: pay },
        { accountId: business.cashAccountId, credit: pay },
      ]);
  }
  let unpaid = 0n;
  for (const [category, amount, kind] of [
    ['cogs', cogs, 'tx.supplies'],
    ['wages', wages, 'tx.payroll'],
    ['rent', rent, 'tx.premises'],
    ['marketing', marketing, 'tx.marketing'],
    ['other', other, 'tx.overheads'],
  ] as const) {
    unpaid += payExpense(world, payer, category, amount, kind, { business: business.name }).unpaid;
  }
  const operatingProfit = revenue - cogs - wages - rent - marketing - other;
  const { interest } = businessLoans(world, business);
  const taxable = operatingProfit - interest;
  const tax = taxable > 0n ? applyBp(taxable, countryMarket(business.countryCode).corporateBp) : 0n;
  if (tax > 0n)
    unpaid += payExpense(world, payer, 'tax', tax, 'tx.corporateTax', {
      business: business.name,
    }).unpaid;
  const netProfit = operatingProfit - interest - tax;
  const statement: Statement = {
    tick: world.tick,
    unitsDemanded: results.reduce((s, r) => s + r.demanded, 0),
    unitsSold: results.reduce((s, r) => s + r.sold, 0),
    revenue,
    cogs,
    wages,
    rent,
    marketing,
    other,
    operatingProfit,
    interest,
    tax,
    netProfit,
  };
  business.statement = statement;
  recordHistory(
    business,
    { tick: world.tick, revenue, netProfit, cash: balanceOf(world, business.cashAccountId) },
    world.tick,
  );

  // Quality and brand drift towards what the business invests in.
  const avgWagePercent = (() => {
    const b = business.branches[0];
    if (!b) return 100;
    const reference = staffWage(world, type, b.locationId);
    return reference > 0n ? Number((b.wageMinor * 100n) / reference) : 100;
  })();
  const overloaded = results.some((r) => r.overloaded);
  const qualityTarget = clamp(
    380 +
      Math.floor(ownerSkill(world, business, type) / 3) +
      SUPPLIERS[business.supplier].quality +
      (avgWagePercent - 100) * 2 -
      (overloaded ? 80 : 0),
    0,
    1000,
  );
  business.quality = clamp(
    business.quality + Math.trunc((qualityTarget - business.quality) / 6),
    0,
    1000,
  );
  const median = medianWage(world, business.countryCode);
  const spendShare = median > 0n ? Number((marketing * 100n) / median) : 0;
  const brandTarget = clamp(
    250 + Math.min(500, spendShare * 3) + Math.floor(business.quality / 5),
    0,
    1000,
  );
  business.brand = clamp(business.brand + Math.trunc((brandTarget - business.brand) / 10), 0, 1000);

  const owesMoney =
    unpaid > 0n ||
    sortedValues(world.ledger.accounts).some(
      (a) => a.ownerId === business.id && a.type === 'arrears' && a.balance > 0n,
    );
  business.distressMonths = owesMoney ? business.distressMonths + 1 : 0;
  const player = world.characters[world.activeCharacterId];
  const playerOwns = player ? ownerShare(business, player.id) !== undefined : false;
  if (business.distressMonths === 3 && playerOwns) {
    addNotification(
      world,
      'business',
      'ntf.businessDistress',
      { business: business.name },
      'business',
      business.id,
    );
  }
  if (business.distressMonths >= FAILURE_MONTHS) {
    closeBusiness(world, business, 'failed');
    return;
  }
  revalueStakes(world, business);
}

/** Background competitors improve, change prices, close or appear (seeded). */
function evolveCompetitors(world: World): void {
  const markets = new Set<string>();
  for (const id of sortedKeys(world.competitors)) {
    const c = world.competitors[id];
    if (c?.status !== 'active') continue;
    markets.add(`${c.typeId}|${c.locationId}`);
    const { country } = getLocation(c.locationId);
    const cycle = world.economy[country.code]?.cycle ?? 0;
    withRng(world, 'business', (rng) => {
      c.quality = clamp(c.quality + rng.range(-12, 12), 100, 950);
      c.brand = clamp(c.brand + rng.range(-10, 10), 50, 950);
      c.pricePercent = clamp(c.pricePercent + rng.range(-3, 3), 70, 150);
      const closePpm = (c.quality < 350 ? 6000 : 1000) * (cycle < -40 ? 3 : 1);
      if (rng.chancePpm(closePpm)) c.status = 'closed';
      else if (rng.chancePpm(cycle > 30 ? 8000 : 2000) && c.size < 6) c.size += 1;
    });
  }
  for (const key of [...markets].sort()) {
    const [typeId = '', locationId = ''] = key.split('|');
    const { country } = getLocation(locationId);
    const cycle = world.economy[country.code]?.cycle ?? 0;
    const entrants = withRng(world, 'business', (rng) =>
      rng.chancePpm(cycle > 20 ? 15_000 : 5_000),
    );
    if (entrants && competitorsAt(world, typeId, locationId).length < 6)
      newCompetitor(world, typeId, locationId);
  }
}

/** Step 5 (business part): every active company once, then the competition. */
export function processBusinesses(world: World): void {
  for (const id of sortedKeys(world.businesses)) {
    const business = world.businesses[id];
    if (business?.status === 'active') runBusinessMonth(world, business);
  }
  evolveCompetitors(world);
}

/** Businesses the player owns (any share). */
export function playerBusinesses(world: World): Business[] {
  return sortedValues(world.businesses).filter(
    (b) => b.status === 'active' && ownerShare(b, world.activeCharacterId),
  );
}

/** Monthly hours the player spends managing their companies. */
export function managementHours(world: World, ownerId: string): number {
  return sortedValues(world.businesses).filter(
    (b) => b.status === 'active' && b.manager === 'owner' && ownerShare(b, ownerId),
  ).length;
}
