import { sortedValues } from '../core/data';
import { ageYears } from '../core/world';
import type { Account, Character, Fund, World } from '../state/schema';
import { currencyFor } from './finance';
import { balanceOf, openAccount, post } from './ledger';

/**
 * Investment funds (spec §4 step 5 "investment prices"): a stock index fund and a bond fund
 * in the player's country. Holdings are valued at market every month (gains and losses are
 * booked, like the retirement fund), so net worth always reflects current prices.
 */

export type InvestmentRejection =
  'tooYoung' | 'noAccount' | 'invalid' | 'insufficientFunds' | 'nothingToSell';

export const INVESTMENT_MESSAGES: Record<InvestmentRejection, string> = {
  tooYoung: 'You must be 18 or older to invest.',
  noAccount: 'You need a current account first.',
  invalid: 'Enter an amount greater than zero.',
  insufficientFunds: 'There is not enough money in your current account.',
  nothingToSell: 'You do not hold that much in this fund.',
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
}

export function sellFund(world: World, c: Character, fund: Fund, amount: bigint): void {
  const checking = c.finance?.checkingId;
  if (!checking) throw new InvestmentError('noAccount');
  if (amount <= 0n) throw new InvestmentError('invalid');
  const account = fundAccount(world, c.id, fund);
  if (!account || account.balance < amount) throw new InvestmentError('nothingToSell');
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
