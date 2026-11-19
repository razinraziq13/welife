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
import { addBiography, addNotification, ageYears, nextId } from '../core/world';
import { emptyFinance, moveToHousehold, removeEmptyHouseholds } from '../characters/factory';
import { changeStat } from '../characters/stats';
import { findClub } from '../education/catalog';
import { getCountry, getLocation } from '../world/countries';
import { getRules } from '../world/rules';
import type {
  Account,
  Character,
  Household,
  HomeSize,
  Lifestyle,
  Policy,
  WealthTier,
  World,
} from '../state/schema';
import { medianWage, savingsRateBp, type MarketMove } from './economy';
import {
  ASSET_TYPES,
  LedgerError,
  balanceOf,
  categoryAccount,
  monthTotals,
  netWorthOf,
  openAccount,
  post,
  pruneJournal,
  recordMonthSummary,
} from './ledger';
import { annualIncomeTax, payslip } from './tax';
import { abroadAccounts, convertCurrency, exchange, localAccount, topUp } from './fx';
import { coverageShare } from '../civics/status';

/**
 * Household economy (spec §4 step 4; §3.9 Finance): wages, taxes, social contributions,
 * pensions, benefits, living costs, housing, school fees, loans, insurance and savings,
 * all posted to the balanced ledger. Tracked households are the player's and the player's
 * parents'; other NPC households are background. All numbers PROPOSED TUNING.
 */

export const LIFESTYLE_PERCENT: Record<Lifestyle, number> = {
  frugal: 70,
  moderate: 100,
  comfortable: 150,
  lavish: 260,
};

/** Rent per month by home size, percent of the median wage (scaled by local costs). */
export const RENT_PERCENT: Record<HomeSize, number> = { room: 18, apartment: 32, house: 50 };

/** Opening savings by wealth, in months of the median wage. */
const OPENING_SAVINGS_MONTHS: Record<WealthTier, number> = {
  low: 1,
  'lower-middle': 3,
  middle: 8,
  'upper-middle': 20,
  wealthy: 80,
  'very-wealthy': 400,
  royal: 1000,
};

export const DEFAULT_LIFESTYLE: Record<WealthTier, Lifestyle> = {
  low: 'frugal',
  'lower-middle': 'frugal',
  middle: 'moderate',
  'upper-middle': 'comfortable',
  wealthy: 'comfortable',
  'very-wealthy': 'lavish',
  royal: 'lavish',
};

const CURRENCY_CACHE = new Map<string, string>();
export function currencyFor(code: string): string {
  let cached = CURRENCY_CACHE.get(code);
  if (!cached) {
    cached = getCountry(code).currency.code;
    CURRENCY_CACHE.set(code, cached);
  }
  return cached;
}

/** Opens the household's accounts with its starting savings (posted against opening equity). */
export function trackHousehold(world: World, household: Household, headId: string): void {
  if (household.finance) return;
  const head = world.characters[headId];
  if (!head) throw new Error('Unknown head of household');
  const cur = currencyFor(head.countryCode);
  const checkingId = openAccount(world, household.id, 'checking', cur);
  const savingsId = openAccount(world, household.id, 'savings', cur, {
    rateBp: savingsRateBp(world, head.countryCode),
  });
  const owned =
    household.wealth === 'upper-middle' ||
    household.wealth === 'wealthy' ||
    household.wealth === 'very-wealthy' ||
    household.wealth === 'royal';
  const size: HomeSize = household.wealth === 'low' ? 'apartment' : owned ? 'house' : 'apartment';
  household.finance = {
    checkingId,
    savingsId,
    lifestyle: DEFAULT_LIFESTYLE[household.wealth],
    housing: owned ? 'owned' : 'rented',
    homeSize: size,
    rentMinor: owned ? 0n : rentFor(world, household.locationId, size),
    propertyId: null,
    headId,
  };
  const median = medianWage(world, head.countryCode);
  const opening = median * BigInt(OPENING_SAVINGS_MONTHS[household.wealth]);
  const equity = categoryAccount(world, household.id, 'equity', 'opening', cur);
  post(world, 'tx.opening', [
    { accountId: checkingId, debit: median },
    { accountId: savingsId, debit: opening },
    { accountId: equity, credit: median + opening },
  ]);
  for (const id of household.memberIds) {
    const member = world.characters[id];
    if (member?.death === null && !member.finance && ageYears(world, member) >= 16)
      member.finance = emptyFinance(world.tick);
  }
}

export function rentFor(world: World, locationId: string, size: HomeSize): bigint {
  const { country, location } = getLocation(locationId);
  return applyPercent(
    applyPercent(medianWage(world, country.code), RENT_PERCENT[size]),
    location.costIndex,
  );
}

/** The player's personal accounts: a child savings account at birth, checking from 16. */
export function ensurePlayerAccounts(world: World, c: Character): void {
  c.finance ??= emptyFinance(world.tick);
  const cur = currencyFor(c.countryCode);
  c.finance.savingsId ??= openAccount(world, c.id, 'savings', cur, {
    rateBp: savingsRateBp(world, c.countryCode),
  });
  if (c.finance.checkingId === null && ageYears(world, c) >= 16) {
    c.finance.checkingId = openAccount(world, c.id, 'checking', cur);
    addNotification(world, 'money', 'ntf.firstAccount', {}, 'finance');
  }
  if (c.finance.retirementId === null && (c.employmentId !== null || ageYears(world, c) >= 18)) {
    c.finance.retirementId = openAccount(world, c.id, 'retirement', cur);
  }
}

/** The accounts a character pays from: their own, or their household's while a child. */
export function payerFor(
  world: World,
  c: Character,
): { ownerId: string; checkingId: string; savingsId: string | null } | null {
  if (c.id === world.activeCharacterId && c.finance?.checkingId) {
    return { ownerId: c.id, checkingId: c.finance.checkingId, savingsId: c.finance.savingsId };
  }
  const h = world.households[c.householdId];
  if (h?.finance)
    return { ownerId: h.id, checkingId: h.finance.checkingId, savingsId: h.finance.savingsId };
  return null;
}

/**
 * The accounts that pay in a given currency: the usual ones, or (for property or loans left
 * in another country) an account kept abroad, first topped up with `needed` from home.
 */
export function payerIn(
  world: World,
  c: Character,
  currency: string,
  needed = 0n,
): { ownerId: string; checkingId: string; savingsId: string | null } | null {
  const base = payerFor(world, c);
  if (!base) return null;
  if (world.ledger.accounts[base.checkingId]?.currency === currency) return base;
  const main = c.finance?.checkingId;
  if (!main) return null;
  const local = localAccount(world, c.id, currency);
  if (needed > 0n && world.tick >= 0) topUp(world, c.id, main, local, needed);
  return { ownerId: c.id, checkingId: local, savingsId: null };
}

/** Brings money left in accounts abroad back to the main current account. */
export function sweepAbroad(world: World, c: Character): void {
  const main = c.finance?.checkingId;
  if (!main) return;
  for (const account of abroadAccounts(world, c.id)) {
    if (account.balance > 0n) exchange(world, c.id, account.id, main, account.balance);
  }
}

/** Converts an amount into the character's home currency (for display and tax totals). */
export function inHomeCurrency(world: World, c: Character, amount: bigint, from: string): bigint {
  return convertCurrency(world, amount, from, currencyFor(c.countryCode));
}

/**
 * Pays an expense from checking, then savings; anything still unpaid becomes arrears
 * (a debt) rather than a negative balance.
 */
export function payExpense(
  world: World,
  payer: { ownerId: string; checkingId: string; savingsId: string | null },
  category: string,
  amount: bigint,
  kind: string,
  params: Record<string, string | number> = {},
  source: string | null = null,
): { paid: bigint; unpaid: bigint } {
  if (amount <= 0n) return { paid: 0n, unpaid: 0n };
  const cur = world.ledger.accounts[payer.checkingId]?.currency ?? 'USD';
  const expense = categoryAccount(world, payer.ownerId, 'expense', category, cur);
  const fromChecking = minBig(amount, maxBig(0n, balanceOf(world, payer.checkingId)));
  const fromSavings = payer.savingsId
    ? minBig(amount - fromChecking, maxBig(0n, balanceOf(world, payer.savingsId)))
    : 0n;
  const unpaid = amount - fromChecking - fromSavings;
  const entries = [
    { accountId: expense, debit: amount },
    { accountId: payer.checkingId, credit: fromChecking },
  ];
  if (payer.savingsId && fromSavings > 0n)
    entries.push({ accountId: payer.savingsId, credit: fromSavings });
  if (unpaid > 0n)
    entries.push({ accountId: arrearsAccount(world, payer.ownerId, cur), credit: unpaid });
  post(world, kind, entries, { params, source });
  return { paid: fromChecking + fromSavings, unpaid };
}

function arrearsAccount(world: World, ownerId: string, cur: string): string {
  const existing = sortedValues(world.ledger.accounts).find(
    (a) =>
      a.ownerId === ownerId && a.type === 'arrears' && a.closedTick === null && a.currency === cur,
  );
  return existing?.id ?? openAccount(world, ownerId, 'arrears', cur);
}

export function receiveIncome(
  world: World,
  ownerId: string,
  intoId: string,
  category: string,
  amount: bigint,
  kind: string,
  params: Record<string, string | number> = {},
): void {
  if (amount <= 0n) return;
  const cur = world.ledger.accounts[intoId]?.currency ?? 'USD';
  post(
    world,
    kind,
    [
      { accountId: intoId, debit: amount },
      { accountId: categoryAccount(world, ownerId, 'income', category, cur), credit: amount },
    ],
    { params },
  );
}

/** Pays down arrears from available cash first each month. */
function settleArrears(
  world: World,
  payer: { ownerId: string; checkingId: string },
  player?: Character,
): void {
  const cur = world.ledger.accounts[payer.checkingId]?.currency;
  for (const arrears of sortedValues(world.ledger.accounts)) {
    if (
      arrears.ownerId !== payer.ownerId ||
      arrears.type !== 'arrears' ||
      arrears.closedTick !== null ||
      arrears.balance <= 0n
    )
      continue;
    const foreign = arrears.currency !== cur;
    if (foreign && !player) continue;
    const fee = divRound(arrears.balance, 100n);
    if (fee > 0n) {
      post(world, 'tx.lateFee', [
        {
          accountId: categoryAccount(world, payer.ownerId, 'expense', 'fees', arrears.currency),
          debit: fee,
        },
        { accountId: arrears.id, credit: fee },
      ]);
    }
    const account =
      foreign && player ? payerIn(world, player, arrears.currency, arrears.balance) : payer;
    if (!account) continue;
    const pay = minBig(arrears.balance, maxBig(0n, balanceOf(world, account.checkingId)));
    if (pay > 0n)
      post(world, 'tx.arrearsPaid', [
        { accountId: arrears.id, debit: pay },
        { accountId: account.checkingId, credit: pay },
      ]);
  }
}

function payWages(
  world: World,
  c: Character,
  depositTo: { ownerId: string; checkingId: string },
): void {
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (e?.status !== 'active') return;
  const isPlayer = c.id === world.activeCharacterId;
  const retirementId = isPlayer ? (c.finance?.retirementId ?? null) : null;
  const slip = payslip(
    world,
    c.countryCode,
    e.salaryMinor,
    isPlayer ? (c.finance?.pensionBp ?? 0) : 0,
    retirementId !== null,
  );
  const cur = world.ledger.accounts[depositTo.checkingId]?.currency ?? currencyFor(c.countryCode);
  const owner = isPlayer ? c.id : depositTo.ownerId;
  const entries = [
    { accountId: depositTo.checkingId, debit: slip.net },
    { accountId: categoryAccount(world, owner, 'expense', 'tax', cur), debit: slip.tax },
    { accountId: categoryAccount(world, owner, 'expense', 'social', cur), debit: slip.social },
    retirementId
      ? { accountId: retirementId, debit: slip.pension + slip.voluntary }
      : {
          accountId: categoryAccount(world, owner, 'expense', 'pension', cur),
          debit: slip.pension + slip.voluntary,
        },
    { accountId: categoryAccount(world, owner, 'income', 'salary', cur), credit: slip.gross },
  ];
  post(world, 'tx.salary', entries, { params: { employer: e.terms.employer }, source: e.id });
  if (retirementId && slip.employerPension > 0n) {
    post(world, 'tx.employerPension', [
      { accountId: retirementId, debit: slip.employerPension },
      {
        accountId: categoryAccount(world, owner, 'income', 'employerPension', cur),
        credit: slip.employerPension,
      },
    ]);
  }
  if (c.finance) {
    c.finance.taxYear.gross += slip.gross;
    c.finance.taxYear.withheld += slip.tax;
    c.finance.taxYear.social += slip.social;
    if (
      getRules(c.countryCode).pension.kind === 'state' ||
      getRules(c.countryCode).pension.basicPercent > 0
    ) {
      c.finance.contributionMonths += 1;
      c.finance.pensionableEarnings += slip.gross;
    }
  }
}

/** State pension: basic amount plus earnings-related part (from the state pension age). */
export function statePension(world: World, c: Character, ignoreAge = false): bigint {
  if (!c.finance) return 0n;
  const rules = getRules(c.countryCode).pension;
  if (!ignoreAge && ageYears(world, c) < rules.stateAge) return 0n;
  const median = medianWage(world, c.countryCode);
  let amount = applyPercent(median, rules.basicPercent);
  if (rules.replacementBp > 0 && c.finance.contributionMonths > 0) {
    const average = c.finance.pensionableEarnings / BigInt(c.finance.contributionMonths);
    const fullCareer = Math.min(480, c.finance.contributionMonths);
    amount += divRound(applyBp(average, rules.replacementBp) * BigInt(fullCareer), 480n);
  }
  return amount;
}

/** End of the tax year: actual tax on actual earnings versus what was withheld. */
function reconcileTaxYear(world: World, c: Character): void {
  if (!c.finance) return;
  const rules = getRules(c.countryCode).tax;
  if (world.clock.month !== rules.yearStartMonth) return;
  const year = c.finance.taxYear;
  if (year.startTick === world.tick) return;
  const due = annualIncomeTax(world, c.countryCode, year.gross);
  const diff = due - year.withheld;
  const payer = payerFor(world, c);
  if (payer && c.id === world.activeCharacterId && year.gross > 0n) {
    const cur = world.ledger.accounts[payer.checkingId]?.currency ?? 'USD';
    const taxAccount = categoryAccount(world, c.id, 'expense', 'tax', cur);
    if (diff < 0n) {
      post(world, 'tx.taxRefund', [
        { accountId: payer.checkingId, debit: -diff },
        { accountId: taxAccount, credit: -diff },
      ]);
      addNotification(world, 'money', 'ntf.taxRefund', { amount: (-diff).toString() }, 'finance');
    } else if (diff > 0n) {
      payExpense(world, { ...payer, ownerId: c.id }, 'tax', diff, 'tx.taxBill');
      addNotification(world, 'money', 'ntf.taxBill', { amount: diff.toString() }, 'finance');
    }
  }
  c.finance.taxYear = { startTick: world.tick, gross: 0n, withheld: 0n, social: 0n };
}

/** Monthly living costs of a household (food, utilities, transport, clothing). */
export function livingCosts(world: World, h: Household): bigint {
  if (!h.finance) return 0n;
  const { country, location } = getLocation(h.locationId);
  const median = medianWage(world, country.code);
  const base = applyPercent(
    applyPercent(median, location.costIndex),
    LIFESTYLE_PERCENT[h.finance.lifestyle],
  );
  let total = 0n;
  for (const id of h.memberIds) {
    const m = world.characters[id];
    if (m?.death !== null) continue;
    if (m.id === world.activeCharacterId && h.finance.headId !== m.id && ageYears(world, m) >= 18)
      continue;
    total += applyPercent(base, ageYears(world, m) >= 18 ? 40 : 15);
  }
  return total;
}

/** Monthly childcare for under-threes when every adult works. */
function childcareCost(world: World, h: Household): bigint {
  const adults = h.memberIds
    .map((id) => world.characters[id])
    .filter((m): m is Character => m?.death === null && ageYears(world, m) >= 18);
  if (adults.length === 0 || adults.some((a) => a.employmentId === null)) return 0n;
  const toddlers = h.memberIds.filter((id) => {
    const m = world.characters[id];
    return m?.death === null && ageYears(world, m) < 3;
  }).length;
  const { country } = getLocation(h.locationId);
  // Subsidies and family help make childcare cheaper for lower-income families.
  return (
    applyPercent(medianWage(world, country.code), CHILDCARE_PERCENT[h.wealth]) * BigInt(toddlers)
  );
}

/** Childcare per child under three, percent of the median wage (PROPOSED TUNING). */
const CHILDCARE_PERCENT: Record<WealthTier, number> = {
  low: 5,
  'lower-middle': 10,
  middle: 18,
  'upper-middle': 22,
  wealthy: 28,
  'very-wealthy': 35,
  royal: 35,
};

/** Fees for a student this month: private school, tuition (less scholarships), clubs. */
export function educationFees(
  world: World,
  c: Character,
): { school: bigint; tuition: bigint; clubs: bigint } {
  const rules = getRules(c.countryCode).education;
  const median = medianWage(world, c.countryCode);
  const current = c.education.current;
  let school = 0n;
  let tuition = 0n;
  if (current && current.stage !== 'tertiary' && current.kind === 'private') {
    school = applyPercent(median, rules.privateSchoolPercent);
  }
  if (current?.stage === 'tertiary') {
    const yearly = applyPercent(
      median,
      current.kind === 'private' ? rules.tuitionPrivatePercent : rules.tuitionPublicPercent,
    );
    const multiplier = current.level === 'master' ? 130 : 100;
    tuition = applyPercent(
      divRound(applyPercent(yearly, multiplier), 12n),
      100 - current.scholarshipPercent,
    );
  }
  let clubs = 0n;
  for (const id of c.education.clubs) clubs += applyPercent(median, findClub(id)?.feePercent ?? 0);
  return { school, tuition, clubs };
}

export function rateFor(world: World, c: Character, product: 'personal' | 'student'): number {
  const policy =
    world.economy[c.countryCode]?.policyRateBp ?? getRules(c.countryCode).rates.policyBp;
  if (product === 'student') return clamp(policy + 100, 0, 3000);
  const score = c.finance?.creditScore ?? 500;
  return clamp(policy + 600 + (score < 600 ? 400 : 0) + (score < 400 ? 600 : 0), 0, 4000);
}

/** Loans: interest accrues monthly; scheduled payments start at firstPaymentTick. */
function processLoans(world: World, c: Character): void {
  if (!c.finance) return;
  for (const account of sortedValues(world.ledger.accounts)) {
    if (
      account.ownerId !== c.id ||
      account.type !== 'loan' ||
      account.closedTick !== null ||
      !account.loan
    )
      continue;
    if (account.balance <= 0n) {
      if (account.loan.product === 'student' && c.education.current?.stage === 'tertiary') continue;
      account.closedTick = world.tick;
      addNotification(
        world,
        'money',
        'ntf.loanRepaid',
        { product: account.loan.product },
        'finance',
      );
      continue;
    }
    const cur = account.currency;
    const interest = monthlyInterest(account.balance, account.loan.rateBp);
    if (interest > 0n) {
      post(world, 'tx.loanInterest', [
        { accountId: categoryAccount(world, c.id, 'expense', 'interest', cur), debit: interest },
        { accountId: account.id, credit: interest },
      ]);
    }
    if (world.tick < account.loan.firstPaymentTick) continue;
    if (account.loan.product === 'student' && account.loan.paymentMinor === 0n) {
      account.loan.paymentMinor = amortisedPayment(
        account.balance,
        account.loan.rateBp,
        account.loan.termMonths,
      );
    }
    const due = minBig(account.loan.paymentMinor, account.balance);
    const payer = payerIn(world, c, cur, due);
    if (!payer || due <= 0n) continue;
    const available =
      maxBig(0n, balanceOf(world, payer.checkingId)) +
      maxBig(0n, balanceOf(world, payer.savingsId));
    if (available >= due) {
      const fromChecking = minBig(due, maxBig(0n, balanceOf(world, payer.checkingId)));
      const entries = [
        { accountId: account.id, debit: due },
        { accountId: payer.checkingId, credit: fromChecking },
      ];
      if (due - fromChecking > 0n && payer.savingsId)
        entries.push({ accountId: payer.savingsId, credit: due - fromChecking });
      post(world, 'tx.loanPayment', entries, { params: { product: account.loan.product } });
      account.loan.missedPayments = 0;
    } else {
      account.loan.missedPayments += 1;
      c.finance.creditScore = clamp(c.finance.creditScore - 40, 0, 1000);
      c.finance.cleanMonths = 0;
      addNotification(
        world,
        'money',
        'ntf.loanMissed',
        { product: account.loan.product },
        'finance',
      );
      changeStat(world, c, 'stress', 60, 'money:missedPayment');
    }
  }
}

function processInsurance(world: World, c: Character): void {
  const payer = payerFor(world, c);
  for (const policy of sortedValues(world.insurance)) {
    if (policy.holderId !== c.id || policy.status !== 'active' || !payer) continue;
    const available =
      maxBig(0n, balanceOf(world, payer.checkingId)) +
      maxBig(0n, balanceOf(world, payer.savingsId));
    if (available < policy.premiumMinor) {
      policy.status = 'lapsed';
      addNotification(world, 'money', 'ntf.policyLapsed', { type: policy.type }, 'finance');
      continue;
    }
    payExpense(
      world,
      payer,
      'insurance',
      policy.premiumMinor,
      'tx.premium',
      { type: policy.type },
      policy.id,
    );
  }
}

/** Monthly fund return on retirement accounts, and savings interest. */
function growAccounts(
  world: World,
  ownerId: string,
  code: string,
  market: MarketMove | undefined,
): void {
  for (const account of sortedValues(world.ledger.accounts)) {
    if (account.ownerId !== ownerId || account.closedTick !== null || account.balance <= 0n)
      continue;
    const cur = account.currency;
    if (account.type === 'savings') {
      account.rateBp = savingsRateBp(world, code);
      const interest = monthlyInterest(account.balance, account.rateBp);
      if (interest > 0n)
        post(world, 'tx.interest', [
          { accountId: account.id, debit: interest },
          {
            accountId: categoryAccount(world, ownerId, 'income', 'interest', cur),
            credit: interest,
          },
        ]);
    } else if ((account.type === 'retirement' || account.type === 'investment') && market) {
      const change = applyBp(
        account.balance,
        account.type === 'investment' && account.category === 'bonds'
          ? market.bondReturnBp
          : market.returnBp,
      );
      if (change > 0n)
        post(world, 'tx.fundReturn', [
          { accountId: account.id, debit: change },
          {
            accountId: categoryAccount(world, ownerId, 'income', 'investment', cur),
            credit: change,
          },
        ]);
      else if (change < 0n)
        post(world, 'tx.fundReturn', [
          {
            accountId: categoryAccount(world, ownerId, 'expense', 'investmentLoss', cur),
            debit: -change,
          },
          { accountId: account.id, credit: -change },
        ]);
    }
  }
}

function householdIncome(world: World, h: Household): void {
  if (!h.finance) return;
  const payer = { ownerId: h.id, checkingId: h.finance.checkingId };
  for (const id of h.memberIds) {
    const m = world.characters[id];
    if (m?.death !== null) continue;
    const isPlayer = id === world.activeCharacterId;
    if (isPlayer && m.finance?.checkingId) {
      payWages(world, m, { ownerId: m.id, checkingId: m.finance.checkingId });
    } else if (!isPlayer) {
      payWages(world, m, payer);
    }
    if (!m.finance) continue;
    const into =
      isPlayer && m.finance.checkingId
        ? { ownerId: m.id, checkingId: m.finance.checkingId }
        : payer;
    if (m.finance.benefitMonths > 0 && m.employmentId === null) {
      receiveIncome(
        world,
        into.ownerId,
        into.checkingId,
        'benefits',
        m.finance.benefitMinor,
        'tx.benefit',
      );
      m.finance.benefitMonths -= 1;
    }
    const pension = statePension(world, m);
    if (pension > 0n)
      receiveIncome(
        world,
        into.ownerId,
        into.checkingId,
        'statePension',
        pension,
        'tx.statePension',
      );
    if (isPlayer && m.finance.retired && m.finance.retirementId && m.finance.checkingId) {
      const balance = balanceOf(world, m.finance.retirementId);
      const monthsLeft = Math.max(60, (90 - ageYears(world, m)) * 12);
      const draw = balance / BigInt(monthsLeft);
      if (draw > 0n)
        post(world, 'tx.drawdown', [
          { accountId: m.finance.checkingId, debit: draw },
          { accountId: m.finance.retirementId, credit: draw },
        ]);
    }
  }
}

function householdSupport(world: World, h: Household): void {
  if (!h.finance) return;
  const children = h.memberIds.filter((id) => {
    const m = world.characters[id];
    return m?.death === null && ageYears(world, m) < 18;
  }).length;
  if (children === 0) return;
  const { country } = getLocation(h.locationId);
  const median = medianWage(world, country.code);
  let earnings = 0n;
  for (const id of h.memberIds) {
    const e = world.characters[id]?.employmentId;
    const job = e ? world.employment[e] : undefined;
    if (job?.status === 'active') earnings += job.salaryMinor;
  }
  // Simplified child benefit for families on modest earnings (country schemes differ;
  // researched in M6).
  if (earnings < applyPercent(median, 160)) {
    receiveIncome(
      world,
      h.id,
      h.finance.checkingId,
      'familySupport',
      applyPercent(median, 8) * BigInt(children),
      'tx.familySupport',
    );
  }
}

function householdExpenses(world: World, h: Household): void {
  if (!h.finance) return;
  const payer = { ownerId: h.id, checkingId: h.finance.checkingId, savingsId: h.finance.savingsId };
  const head = world.characters[h.finance.headId];
  payExpense(world, payer, 'living', livingCosts(world, h), 'tx.living');
  if (h.finance.housing === 'rented')
    payExpense(world, payer, 'rent', h.finance.rentMinor, 'tx.rent');
  else if (h.finance.propertyId === null) {
    // A family home outside the property system; owned properties pay their own upkeep.
    const { country, location } = getLocation(h.locationId);
    payExpense(
      world,
      payer,
      'home',
      applyPercent(applyPercent(medianWage(world, country.code), 4), location.costIndex),
      'tx.homeCosts',
    );
  }
  payExpense(world, payer, 'childcare', childcareCost(world, h), 'tx.childcare');
  for (const id of h.memberIds) {
    const m = world.characters[id];
    if (m?.death !== null) continue;
    const isPlayer = id === world.activeCharacterId;
    const fees = educationFees(world, m);
    // The family pays school fees and, while the player lives at home, tuition and clubs.
    const playerPays = isPlayer && h.finance.headId === m.id;
    const studentLoan = isPlayer && fees.tuition > 0n ? findStudentLoan(world, m) : null;
    if (fees.school > 0n) payExpense(world, payer, 'school', fees.school, 'tx.schoolFees');
    if (fees.tuition > 0n) {
      if (studentLoan) {
        post(world, 'tx.tuitionLoan', [
          {
            accountId: categoryAccount(world, m.id, 'expense', 'tuition', studentLoan.currency),
            debit: fees.tuition,
          },
          { accountId: studentLoan.id, credit: fees.tuition },
        ]);
      } else {
        const tuitionPayer = playerPays ? (payerFor(world, m) ?? payer) : payer;
        payExpense(world, tuitionPayer, 'tuition', fees.tuition, 'tx.tuition');
      }
    }
    if (fees.clubs > 0n) {
      const clubPayer =
        isPlayer && ageYears(world, m) >= 18 ? (payerFor(world, m) ?? payer) : payer;
      payExpense(world, clubPayer, 'clubs', fees.clubs, 'tx.clubFees');
    }
  }
  if (head && head.id !== world.activeCharacterId) adjustNpcLifestyle(world, h);
}

/** Parents adapt: cut back when in debt, spend more when comfortably saving. */
function adjustNpcLifestyle(world: World, h: Household): void {
  if (!h.finance || world.clock.month !== 1) return;
  const order: Lifestyle[] = ['frugal', 'moderate', 'comfortable', 'lavish'];
  const index = order.indexOf(h.finance.lifestyle);
  const debt = sortedValues(world.ledger.accounts).some(
    (a) => a.ownerId === h.id && a.type === 'arrears' && a.balance > 0n,
  );
  const savings = balanceOf(world, h.finance.savingsId);
  const costs = livingCosts(world, h) + h.finance.rentMinor;
  // Spending more than comes in (and without a large cushion) also means cutting back.
  const month = monthTotals(world, h.id);
  const shortfall = month.expenses > month.income && savings < costs * 24n;
  if ((debt || shortfall) && index > 0) h.finance.lifestyle = order[index - 1] ?? 'frugal';
  else if (
    !debt &&
    costs > 0n &&
    savings > costs * 36n &&
    index < order.indexOf(DEFAULT_LIFESTYLE[h.wealth])
  ) {
    h.finance.lifestyle = order[index + 1] ?? h.finance.lifestyle;
  }
}

/** The player's own spending while living with family, and board paid to the household. */
function playerAtHome(world: World, c: Character, h: Household): void {
  if (!h.finance || h.finance.headId === c.id || !c.finance?.checkingId) return;
  if (ageYears(world, c) < 18) return;
  const payer = { ownerId: c.id, checkingId: c.finance.checkingId, savingsId: c.finance.savingsId };
  const { location } = getLocation(c.locationId);
  const median = medianWage(world, c.countryCode);
  const spending = applyPercent(
    applyPercent(applyPercent(median, 15), location.costIndex),
    LIFESTYLE_PERCENT[h.finance.lifestyle],
  );
  // The player pays what they can; the family covers the rest (no debt for a young adult
  // living at home without an income).
  const own = minBig(
    spending,
    maxBig(0n, balanceOf(world, c.finance.checkingId)) +
      maxBig(0n, balanceOf(world, c.finance.savingsId)),
  );
  if (own > 0n) payExpense(world, payer, 'personal', own, 'tx.personal');
  if (spending > own) {
    const family = {
      ownerId: h.id,
      checkingId: h.finance.checkingId,
      savingsId: h.finance.savingsId,
    };
    payExpense(world, family, 'personal', spending - own, 'tx.familyCovers');
  }
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (e?.status === 'active') {
    const board = applyPercent(e.salaryMinor, 12);
    const can = minBig(board, maxBig(0n, balanceOf(world, c.finance.checkingId)));
    if (can > 0n)
      post(world, 'tx.board', [
        {
          accountId: categoryAccount(
            world,
            c.id,
            'expense',
            'board',
            world.ledger.accounts[c.finance.checkingId]?.currency ?? 'USD',
          ),
          debit: can,
        },
        { accountId: c.finance.checkingId, credit: can },
      ]);
    if (can > 0n)
      receiveIncome(world, h.id, h.finance.checkingId, 'board', can, 'tx.boardReceived');
  }
}

function findStudentLoan(world: World, c: Character): Account | null {
  return (
    sortedValues(world.ledger.accounts).find(
      (a) =>
        a.ownerId === c.id &&
        a.type === 'loan' &&
        a.closedTick === null &&
        a.loan?.product === 'student',
    ) ?? null
  );
}

/** Credit improves with clean months and suffers with arrears. */
function updateCredit(world: World, c: Character): void {
  if (!c.finance) return;
  const arrears = sortedValues(world.ledger.accounts).some(
    (a) => a.ownerId === c.id && a.type === 'arrears' && a.balance > 0n,
  );
  if (arrears) {
    c.finance.creditScore = clamp(c.finance.creditScore - 10, 0, 1000);
    c.finance.cleanMonths = 0;
  } else {
    c.finance.cleanMonths += 1;
    if (c.finance.cleanMonths % 6 === 0)
      c.finance.creditScore = clamp(c.finance.creditScore + 8, 0, 1000);
  }
}

/** Birthday money from grandparents and relatives into the child's savings. */
function birthdayGifts(world: World, c: Character): void {
  if (!c.finance?.savingsId || world.clock.month !== c.birth.month || ageYears(world, c) === 0)
    return;
  const h = world.households[c.householdId];
  if (!h?.finance || ageYears(world, c) > 21) return;
  const gift = applyPercent(
    medianWage(world, c.countryCode),
    Math.max(1, Math.floor(LIFESTYLE_PERCENT[h.finance.lifestyle] / 25)),
  );
  receiveIncome(world, c.id, c.finance.savingsId, 'gifts', gift, 'tx.birthdayGift');
}

/** Step 4: the month's money for every tracked household. */
export function processFinances(world: World, markets: Map<string, MarketMove>): void {
  const player = world.characters[world.activeCharacterId];
  if (player?.death === null) ensurePlayerAccounts(world, player);
  for (const id of sortedKeys(world.households)) {
    const h = world.households[id];
    if (!h?.finance) continue;
    const { country } = getLocation(h.locationId);
    householdIncome(world, h);
    householdSupport(world, h);
    householdExpenses(world, h);
    settleArrears(world, { ownerId: h.id, checkingId: h.finance.checkingId });
    growAccounts(world, h.id, country.code, markets.get(country.code));
    if (world.clock.month === 1 && h.finance.housing === 'rented') {
      const inflation = world.economy[country.code]?.inflationBp ?? 0;
      if (inflation > 0) h.finance.rentMinor += applyBp(h.finance.rentMinor, inflation);
    }
  }
  if (player?.death === null) {
    const h = world.households[player.householdId];
    if (h) playerAtHome(world, player, h);
    processLoans(world, player);
    processInsurance(world, player);
    birthdayGifts(world, player);
    const payer = payerFor(world, player);
    if (payer?.ownerId === player.id) settleArrears(world, payer, player);
    growAccounts(world, player.id, player.countryCode, markets.get(player.countryCode));
    reconcileTaxYear(world, player);
    updateCredit(world, player);
    recordMonthSummary(world, player.id);
    if (h?.finance) recordMonthSummary(world, h.id);
  }
  // Former players keep their own money moving: loan payments, interest and fund values.
  for (const entry of world.legacy.lineage) {
    const c = world.characters[entry.characterId];
    if (c?.death !== null || c.id === world.activeCharacterId || !c.finance) continue;
    processLoans(world, c);
    growAccounts(world, c.id, c.countryCode, markets.get(c.countryCode));
  }
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (c?.death === null && c.id !== world.activeCharacterId && c.finance)
      reconcileTaxYear(world, c);
  }
  pruneJournal(world);
  if (world.clock.month === 1) updateWealthTiers(world);
}

/** Household wealth tier follows net worth and income (yearly). */
function updateWealthTiers(world: World): void {
  for (const id of sortedKeys(world.households)) {
    const h = world.households[id];
    if (!h?.finance || h.wealth === 'royal') continue;
    const { country } = getLocation(h.locationId);
    const median = medianWage(world, country.code);
    if (median <= 0n) continue;
    let worth = netWorthOf(world, h.id);
    for (const m of h.memberIds)
      worth += world.characters[m]?.id === world.activeCharacterId ? netWorthOf(world, m) : 0n;
    const months = Number(worth / median);
    const tier: WealthTier =
      months >= 300
        ? 'very-wealthy'
        : months >= 60
          ? 'wealthy'
          : months >= 18
            ? 'upper-middle'
            : months >= 5
              ? 'middle'
              : months >= 1
                ? 'lower-middle'
                : 'low';
    h.wealth = tier;
  }
}

// ----------------------------------------------------------------------------------------
// Player actions
// ----------------------------------------------------------------------------------------

export type FinanceRejection =
  | 'noAccount'
  | 'invalidAmount'
  | 'insufficientFunds'
  | 'tooYoung'
  | 'noIncome'
  | 'creditTooLow'
  | 'tooMuchDebt'
  | 'unknownLoan'
  | 'unknownPolicy'
  | 'alreadyInsured'
  | 'noChange'
  | 'notHead'
  | 'alreadyMovedOut'
  | 'cannotAffordMove'
  | 'cannotMoveHome'
  | 'notStudying'
  | 'noStudentLoans';

export const FINANCE_MESSAGES: Record<FinanceRejection, string> = {
  noAccount: 'You do not have that account yet.',
  invalidAmount: 'Enter an amount greater than zero.',
  insufficientFunds: 'There is not enough money in the account.',
  tooYoung: 'You must be 18 or older.',
  noIncome: 'Lenders need you to have a regular income.',
  creditTooLow: 'Your credit rating is too low for this loan.',
  tooMuchDebt: 'The repayments would be too large for your income.',
  unknownLoan: 'Unknown loan.',
  unknownPolicy: 'Unknown insurance policy.',
  alreadyInsured: 'You already have this kind of insurance.',
  noChange: 'That is already your setting.',
  notHead: 'Only the person who runs the household can change this.',
  alreadyMovedOut: 'You already have your own home.',
  cannotAffordMove: 'You need at least two months of rent saved to move out.',
  cannotMoveHome: 'You cannot move back in with your family right now.',
  notStudying: 'Student loans are for people enrolled in further education.',
  noStudentLoans: 'This country has no student loan scheme in the game.',
};

export class FinanceError extends Error {
  readonly code: FinanceRejection;
  constructor(code: FinanceRejection) {
    super(FINANCE_MESSAGES[code]);
    this.name = 'FinanceError';
    this.code = code;
  }
}

export function transferBetween(
  world: World,
  c: Character,
  from: 'checking' | 'savings',
  amount: bigint,
): void {
  const fromId = from === 'checking' ? c.finance?.checkingId : c.finance?.savingsId;
  const toId = from === 'checking' ? c.finance?.savingsId : c.finance?.checkingId;
  if (!fromId || !toId) throw new FinanceError('noAccount');
  if (amount <= 0n) throw new FinanceError('invalidAmount');
  if (balanceOf(world, fromId) < amount) throw new FinanceError('insufficientFunds');
  post(
    world,
    'tx.transfer',
    [
      { accountId: toId, debit: amount },
      { accountId: fromId, credit: amount },
    ],
    { params: { from } },
  );
}

/** Monthly net income used for loan affordability. */
export function monthlyNetIncome(world: World, c: Character): bigint {
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (e?.status !== 'active') return statePension(world, c);
  return payslip(world, c.countryCode, e.salaryMinor, 0, false).net;
}

export function loanPayments(world: World, c: Character): bigint {
  let total = 0n;
  for (const a of sortedValues(world.ledger.accounts)) {
    if (
      a.ownerId === c.id &&
      a.type === 'loan' &&
      a.closedTick === null &&
      a.loan &&
      world.tick >= a.loan.firstPaymentTick - 1
    )
      total += inHomeCurrency(world, c, minBig(a.loan.paymentMinor, a.balance), a.currency);
  }
  return total;
}

/** Highest share of net income that loan repayments may take, by difficulty. */
export function debtLimitPercent(world: World): number {
  return world.rules.difficulty === 'casual'
    ? 50
    : world.rules.difficulty === 'challenging'
      ? 33
      : 40;
}

export function personalLoanQuote(
  world: World,
  c: Character,
  amount: bigint,
  months: number,
): { rateBp: number; payment: bigint; reason: FinanceRejection | null } {
  const rateBp = rateFor(world, c, 'personal');
  const payment = amortisedPayment(amount, rateBp, months);
  let reason: FinanceRejection | null = null;
  const limit = debtLimitPercent(world);
  const income = monthlyNetIncome(world, c);
  if (ageYears(world, c) < 18) reason = 'tooYoung';
  else if (!c.finance?.checkingId) reason = 'noAccount';
  else if (amount <= 0n) reason = 'invalidAmount';
  else if (income <= 0n) reason = 'noIncome';
  else if (c.finance.creditScore < 350) reason = 'creditTooLow';
  else if ((loanPayments(world, c) + payment) * 100n > income * BigInt(limit))
    reason = 'tooMuchDebt';
  return { rateBp, payment, reason };
}

export function takePersonalLoan(
  world: World,
  c: Character,
  amount: bigint,
  months: number,
): string {
  const quote = personalLoanQuote(world, c, amount, months);
  if (quote.reason) throw new FinanceError(quote.reason);
  const checkingId = c.finance?.checkingId;
  if (!checkingId) throw new FinanceError('noAccount');
  const cur = world.ledger.accounts[checkingId]?.currency ?? 'USD';
  const loanId = openAccount(world, c.id, 'loan', cur, {
    category: 'personal',
    loan: {
      product: 'personal',
      rateBp: quote.rateBp,
      termMonths: months,
      paymentMinor: quote.payment,
      principalMinor: amount,
      firstPaymentTick: world.tick + 1,
      missedPayments: 0,
    },
  });
  post(
    world,
    'tx.loanDrawn',
    [
      { accountId: checkingId, debit: amount },
      { accountId: loanId, credit: amount },
    ],
    { params: { product: 'personal' } },
  );
  return loanId;
}

/** Opens a student loan that pays tuition from now on; repayments start after study. */
export function startStudentLoan(world: World, c: Character): string {
  const current = c.education.current;
  if (current?.stage !== 'tertiary') throw new FinanceError('notStudying');
  if (!getRules(c.countryCode).education.studentLoans) throw new FinanceError('noStudentLoans');
  if (findStudentLoan(world, c)) throw new FinanceError('noChange');
  ensurePlayerAccounts(world, c);
  const cur = currencyFor(c.countryCode);
  const remainingYears = Math.max(1, current.years - current.yearsCompleted);
  return openAccount(world, c.id, 'loan', cur, {
    category: 'student',
    loan: {
      product: 'student',
      rateBp: rateFor(world, c, 'student'),
      termMonths: 120,
      paymentMinor: 0n,
      principalMinor: 0n,
      firstPaymentTick: world.tick + remainingYears * 12 + 6,
      missedPayments: 0,
    },
  });
}

/** When studies end, student-loan repayments start six months later. */
export function rescheduleStudentLoan(world: World, c: Character): void {
  const loan = findStudentLoan(world, c);
  if (!loan?.loan || c.education.current?.stage === 'tertiary') return;
  if (loan.loan.firstPaymentTick > world.tick + 6) loan.loan.firstPaymentTick = world.tick + 6;
}

export function repayLoan(world: World, c: Character, loanId: string, amount: bigint): void {
  const loan = world.ledger.accounts[loanId];
  if (loan?.ownerId !== c.id || loan.type !== 'loan' || loan.closedTick !== null)
    throw new FinanceError('unknownLoan');
  const checkingId = c.finance?.checkingId;
  if (!checkingId) throw new FinanceError('noAccount');
  if (amount <= 0n) throw new FinanceError('invalidAmount');
  const pay = minBig(amount, loan.balance);
  if (pay === 0n) throw new FinanceError('invalidAmount');
  const home = world.ledger.accounts[checkingId];
  if (!home) throw new FinanceError('noAccount');
  let paymentId = checkingId;
  if (home.currency !== loan.currency) {
    const foreign = abroadAccounts(world, c.id).find((a) => a.currency === loan.currency);
    const available =
      (foreign?.balance ?? 0n) + convertCurrency(world, home.balance, home.currency, loan.currency);
    if (available < pay) throw new FinanceError('insufficientFunds');
    paymentId = foreign?.id ?? localAccount(world, c.id, loan.currency);
    topUp(world, c.id, checkingId, paymentId, pay);
  }
  if (balanceOf(world, paymentId) < pay) throw new FinanceError('insufficientFunds');
  post(world, 'tx.loanRepaid', [
    { accountId: loanId, debit: pay },
    { accountId: paymentId, credit: pay },
  ]);
  if (loan.balance === 0n) loan.closedTick = world.tick;
  else if (loan.loan?.product === 'personal') {
    const remaining = Math.max(1, loan.loan.termMonths - (world.tick - loan.openedTick));
    loan.loan.paymentMinor = amortisedPayment(loan.balance, loan.loan.rateBp, remaining);
  }
}

export function insurancePremium(
  world: World,
  c: Character,
  type: Policy['type'],
  coverage: bigint,
): bigint {
  const age = ageYears(world, c);
  const median = medianWage(world, c.countryCode);
  if (type === 'health') {
    const coveragePublic = getRules(c.countryCode).healthcare.publicCoverage;
    const base = applyPercent(median, 3 + Math.floor(age / 10));
    return applyPercent(base, clamp(140 - coveragePublic, 30, 140));
  }
  const yearlyBp = age < 30 ? 9 : age < 40 ? 15 : age < 50 ? 40 : age < 60 ? 110 : 300;
  const healthFactor = c.stats.health < 700 ? 100 + Math.floor((700 - c.stats.health) / 7) : 100;
  return applyPercent(divRound(applyBp(coverage, yearlyBp), 12n), healthFactor);
}

export function buyInsurance(
  world: World,
  c: Character,
  type: Policy['type'],
  coverage: bigint,
): Policy {
  if (ageYears(world, c) < 18) throw new FinanceError('tooYoung');
  if (!c.finance?.checkingId) throw new FinanceError('noAccount');
  if (
    sortedValues(world.insurance).some(
      (p) => p.holderId === c.id && p.type === type && p.status === 'active',
    )
  )
    throw new FinanceError('alreadyInsured');
  if (type === 'life' && coverage <= 0n) throw new FinanceError('invalidAmount');
  const policy: Policy = {
    id: nextId(world, 'pol'),
    holderId: c.id,
    type,
    premiumMinor: insurancePremium(world, c, type, coverage),
    coverageMinor: type === 'health' ? 0n : coverage,
    startTick: world.tick,
    status: 'active',
  };
  world.insurance[policy.id] = policy;
  return policy;
}

export function cancelInsurance(world: World, c: Character, policyId: string): void {
  const policy = world.insurance[policyId];
  if (policy?.holderId !== c.id || policy.status !== 'active')
    throw new FinanceError('unknownPolicy');
  policy.status = 'cancelled';
}

/** Treatment costs after public coverage and private insurance (non-graphic health events). */
/** What a patient pays after public coverage (residence-dependent) and insurance. */
export function medicalDue(
  world: World,
  c: Character,
  gross: bigint,
  care: 'public' | 'private' = 'public',
): bigint {
  const rules = getRules(c.countryCode).healthcare;
  let coverage =
    care === 'public' ? Math.floor((rules.publicCoverage * coverageShare(c)) / 100) : 0;
  const job = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (rules.employerInsurance && job?.status === 'active' && job.terms.contract === 'permanent')
    coverage = Math.max(coverage, 80);
  let due = applyPercent(gross, 100 - coverage);
  const insured = sortedValues(world.insurance).some(
    (p) => p.holderId === c.id && p.type === 'health' && p.status === 'active',
  );
  if (insured) due = applyPercent(due, 20);
  return due;
}

export function payMedicalCost(
  world: World,
  c: Character,
  gross: bigint,
  source: string,
  care: 'public' | 'private' = 'public',
): bigint {
  const due = medicalDue(world, c, gross, care);
  const payer = payerFor(world, c);
  if (payer && due > 0n) payExpense(world, payer, 'medical', due, 'tx.medical', {}, source);
  return due;
}

/** Life insurance pays the household (or partner) when the insured dies. */
export function payLifeInsurance(world: World, c: Character): void {
  for (const policy of sortedValues(world.insurance)) {
    if (policy.holderId !== c.id || policy.type !== 'life' || policy.status !== 'active') continue;
    policy.status = 'paidOut';
    const h = world.households[c.householdId];
    if (!h?.finance) continue;
    receiveIncome(
      world,
      h.id,
      h.finance.savingsId,
      'lifeInsurance',
      policy.coverageMinor,
      'tx.lifeInsurance',
    );
  }
}

export function setLifestyle(world: World, c: Character, lifestyle: Lifestyle): void {
  const h = world.households[c.householdId];
  if (h?.finance?.headId !== c.id) throw new FinanceError('notHead');
  if (h.finance.lifestyle === lifestyle) throw new FinanceError('noChange');
  h.finance.lifestyle = lifestyle;
}

export function setPensionContribution(world: World, c: Character, bp: number): void {
  if (!c.finance) throw new FinanceError('noAccount');
  if (c.finance.pensionBp === bp) throw new FinanceError('noChange');
  ensurePlayerAccounts(world, c);
  c.finance.pensionBp = bp;
}

/** Moves the player into a rented home of their own (partner and children come along). */
export function moveOut(world: World, c: Character, size: HomeSize): Household {
  if (ageYears(world, c) < 18) throw new FinanceError('tooYoung');
  const home = world.households[c.householdId];
  if (home?.finance?.headId === c.id) throw new FinanceError('alreadyMovedOut');
  ensurePlayerAccounts(world, c);
  const checkingId = c.finance?.checkingId;
  const savingsId = c.finance?.savingsId;
  if (!checkingId || !savingsId) throw new FinanceError('noAccount');
  const rent = rentFor(world, c.locationId, size);
  if (balanceOf(world, checkingId) + balanceOf(world, savingsId) < rent * 2n)
    throw new FinanceError('cannotAffordMove');
  const household: Household = {
    id: nextId(world, 'hh'),
    locationId: c.locationId,
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
      checkingId,
      savingsId,
      lifestyle: 'moderate',
      housing: 'rented',
      homeSize: size,
      rentMinor: rent,
      propertyId: null,
      headId: c.id,
    },
  };
  world.households[household.id] = household;
  moveToHousehold(world, c, household.id);
  const partnerId =
    c.partnership && c.partnership.status !== 'dating' ? c.partnership.partnerId : null;
  const partner = partnerId ? world.characters[partnerId] : undefined;
  if (
    partner?.death === null &&
    partner.householdId !== household.id &&
    !world.households[partner.householdId]?.finance
  ) {
    moveToHousehold(world, partner, household.id);
    partner.finance ??= emptyFinance(world.tick);
  }
  addBiography(world, c.id, 'money', 'bio.movedOut', { size });
  addNotification(world, 'money', 'ntf.movedOut', { size }, 'finance');
  removeEmptyHouseholds(world);
  return household;
}

/** Moves back in with family (only when living alone). */
export function moveHome(world: World, c: Character, familyHouseholdId: string): void {
  const home = world.households[c.householdId];
  const family = world.households[familyHouseholdId];
  if (
    home?.finance?.headId !== c.id ||
    home.memberIds.length !== 1 ||
    !family ||
    family.id === home.id
  ) {
    throw new FinanceError('cannotMoveHome');
  }
  moveToHousehold(world, c, family.id);
  // The old household stays (empty) because its expense history lives in the ledger.
  home.finance = null;
  addBiography(world, c.id, 'money', 'bio.movedHome', {});
}

export function isAsset(account: Account): boolean {
  return ASSET_TYPES.has(account.type);
}

export { LedgerError };
