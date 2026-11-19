import { sortedValues } from '../core/data';
import { divRound, monthlyInterest } from '../core/money';
import { addNotification, ageYears } from '../core/world';
import type { Account, Character, Fund, World } from '../state/schema';
import { currencyFor } from './finance';
import { balanceOf, categoryAccount, openAccount, post } from './ledger';

/**
 * Investment funds (spec §4 step 5 "investment prices"): a stock index fund and a bond fund
 * in the player's country. Holdings are valued at market every month (gains and losses are
 * booked, like the retirement fund), so net worth always reflects current prices.
 */

export type InvestmentRejection =
  'tooYoung' | 'noAccount' | 'invalid' | 'insufficientFunds' | 'nothingToSell' | 'noBond';

export const INVESTMENT_MESSAGES: Record<InvestmentRejection, string> = {
  tooYoung: 'You must be 18 or older to invest.',
  noAccount: 'You need a current account first.',
  invalid: 'Enter an amount greater than zero.',
  insufficientFunds: 'There is not enough money in your current account.',
  nothingToSell: 'You do not hold that much in this fund.',
  noBond: 'You do not hold that bond.',
};

export class InvestmentError extends Error {
  readonly code: InvestmentRejection;
  constructor(code: InvestmentRejection) {
    super(INVESTMENT_MESSAGES[code]);
    this.name = 'InvestmentError';
    this.code = code;
  }
}

export function fundAccount(world: World, ownerId: string, fund: Fund): Account | undefined {
  return sortedValues(world.ledger.accounts).find(
    (a) =>
      a.ownerId === ownerId &&
      a.type === 'investment' &&
      a.category === fund &&
      a.bond === undefined &&
      a.closedTick === null,
  );
}

export function buyFund(world: World, c: Character, fund: Fund, amount: bigint): void {
  if (ageYears(world, c) < 18) throw new InvestmentError('tooYoung');
  const checking = c.finance?.checkingId;
  if (!checking) throw new InvestmentError('noAccount');
  if (amount <= 0n) throw new InvestmentError('invalid');
  if (balanceOf(world, checking) < amount) throw new InvestmentError('insufficientFunds');
  const account =
    fundAccount(world, c.id, fund)?.id ??
    openAccount(world, c.id, 'investment', currencyFor(c.countryCode), { category: fund });
  post(
    world,
    'tx.fundBought',
    [
      { accountId: account, debit: amount },
      { accountId: checking, credit: amount },
    ],
    { params: { fund } },
  );
  const held = world.ledger.accounts[account];
  if (held) held.costMinor = (held.costMinor ?? held.balance - amount) + amount;
}

export function sellFund(world: World, c: Character, fund: Fund, amount: bigint): void {
  const checking = c.finance?.checkingId;
  if (!checking) throw new InvestmentError('noAccount');
  if (amount <= 0n) throw new InvestmentError('invalid');
  const account = fundAccount(world, c.id, fund);
  if (!account || account.balance < amount) throw new InvestmentError('nothingToSell');
  if (account.costMinor !== undefined)
    account.costMinor -= divRound(account.costMinor * amount, account.balance);
  post(
    world,
    'tx.fundSold',
    [
      { accountId: checking, debit: amount },
      { accountId: account.id, credit: amount },
    ],
    { params: { fund } },
  );
}

// ----------------------------------------------------------------------------------------
// Fixed-term government bonds (gameplay expansion, decision E71)
// ----------------------------------------------------------------------------------------

/** Terms on offer, months. */
export const BOND_TERMS = [12, 60, 120] as const;
export type BondTerm = (typeof BOND_TERMS)[number];

/** Annual yield for a bond with `months` to run: the policy rate plus a term premium. */
export function bondYieldBp(world: World, countryCode: string, months: number): number {
  const policy = world.economy[countryCode]?.policyRateBp ?? 300;
  const premium = Math.min(125, Math.max(0, 25 + Math.floor(((months - 12) * 100) / 108)));
  return policy + premium;
}

/**
 * What a bond would fetch if sold now: its face value adjusted for how its fixed rate compares
 * with today's yield for the time left. Rates up, price down (and the other way round).
 * shortcut: linear duration approximation, fine for rates in the game's 0-30% range.
 */
export function bondSaleValue(world: World, account: Account, countryCode: string): bigint {
  const bond = account.bond;
  if (!bond) return account.balance;
  const left = Math.max(0, bond.maturityTick - world.tick);
  const diffBp = bond.couponBp - bondYieldBp(world, countryCode, left);
  const value = account.balance + divRound(account.balance * BigInt(diffBp * left), 120_000n);
  return value < account.balance / 2n ? account.balance / 2n : value;
}

export function playerBonds(world: World, ownerId: string): Account[] {
  return sortedValues(world.ledger.accounts).filter(
    (a) => a.ownerId === ownerId && a.bond !== undefined && a.closedTick === null,
  );
}

export function buyBond(world: World, c: Character, term: BondTerm, amount: bigint): void {
  if (ageYears(world, c) < 18) throw new InvestmentError('tooYoung');
  const checking = c.finance?.checkingId;
  if (!checking) throw new InvestmentError('noAccount');
  if (amount <= 0n) throw new InvestmentError('invalid');
  if (balanceOf(world, checking) < amount) throw new InvestmentError('insufficientFunds');
  const id = openAccount(world, c.id, 'investment', currencyFor(c.countryCode), {
    category: 'bond',
  });
  const account = world.ledger.accounts[id];
  if (!account) throw new InvestmentError('noAccount');
  account.bond = {
    termMonths: term,
    couponBp: bondYieldBp(world, c.countryCode, term),
    maturityTick: world.tick + term,
  };
  post(
    world,
    'tx.bondBought',
    [
      { accountId: id, debit: amount },
      { accountId: checking, credit: amount },
    ],
    { params: { months: term } },
  );
}

/** Sells a bond before it matures at today's price; the difference is a gain or a loss. */
export function sellBond(world: World, c: Character, accountId: string): void {
  const account = world.ledger.accounts[accountId];
  const checking = c.finance?.checkingId;
  if (!checking) throw new InvestmentError('noAccount');
  if (account?.ownerId !== c.id || !account.bond || account.closedTick !== null)
    throw new InvestmentError('noBond');
  const price = bondSaleValue(world, account, c.countryCode);
  const face = account.balance;
  const cur = account.currency;
  const entries = [
    { accountId: checking, debit: price, credit: 0n },
    { accountId: account.id, debit: 0n, credit: face },
  ];
  if (price > face)
    entries.push({
      accountId: categoryAccount(world, c.id, 'income', 'investment', cur),
      debit: 0n,
      credit: price - face,
    });
  else if (price < face)
    entries.push({
      accountId: categoryAccount(world, c.id, 'expense', 'investmentLoss', cur),
      debit: face - price,
      credit: 0n,
    });
  post(world, 'tx.bondSold', entries);
  account.closedTick = world.tick;
}

/** Monthly: each bond pays its interest into the owner's current account and repays at the end. */
export function processBonds(world: World): void {
  for (const account of sortedValues(world.ledger.accounts)) {
    if (!account.bond || account.closedTick !== null) continue;
    const owner = world.characters[account.ownerId];
    const checking = owner?.finance?.checkingId;
    if (!checking || world.ledger.accounts[checking]?.currency !== account.currency) continue;
    const coupon = monthlyInterest(account.balance, account.bond.couponBp);
    if (coupon > 0n)
      post(world, 'tx.bondInterest', [
        { accountId: checking, debit: coupon },
        {
          accountId: categoryAccount(
            world,
            account.ownerId,
            'income',
            'interest',
            account.currency,
          ),
          credit: coupon,
        },
      ]);
    if (world.tick >= account.bond.maturityTick) {
      post(world, 'tx.bondMatured', [
        { accountId: checking, debit: account.balance },
        { accountId: account.id, credit: account.balance },
      ]);
      account.closedTick = world.tick;
      if (owner.id === world.activeCharacterId)
        addNotification(
          world,
          'money',
          'ntf.bondMatured',
          { months: account.bond.termMonths },
          'finance',
        );
    }
  }
}
