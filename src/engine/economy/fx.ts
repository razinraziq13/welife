import { sortedValues } from '../core/data';
import { COUNTRIES } from '../world/countries';
import { convert } from './economy';
import { balanceOf, categoryAccount, openAccount, post } from './ledger';
import type { Account, World } from '../state/schema';

/**
 * Currency exchange between a person's own accounts (Milestone 6: moving abroad, property
 * and loans left in another country).
 *
 * Every exchange is two balanced transactions, one per currency, booked as
 * expense:currencyExchange in the source currency and income:currencyExchange in the target
 * currency. So each currency reconciles on its own (net-worth change = booked income -
 * expenses), and the ledger's per-transaction balance rule is never broken.
 */

const CURRENCY_COUNTRY = new Map<string, string>();
for (const c of COUNTRIES) {
  if (!CURRENCY_COUNTRY.has(c.currency.code)) CURRENCY_COUNTRY.set(c.currency.code, c.code);
}

/** A representative country for a currency (the first profile that uses it). */
export function currencyCountry(currency: string): string {
  const code = CURRENCY_COUNTRY.get(currency);
  if (!code) throw new Error(`Unknown currency ${currency}`);
  return code;
}

export function convertCurrency(world: World, amount: bigint, from: string, to: string): bigint {
  if (from === to) return amount;
  return convert(world, amount, currencyCountry(from), currencyCountry(to));
}

/**
 * Moves `amount` (in the source account's currency) from one of the owner's accounts to
 * another, converting when the currencies differ. Returns the amount received.
 */
export function exchange(
  world: World,
  ownerId: string,
  fromId: string,
  toId: string,
  amount: bigint,
  kind = 'tx.currencyExchange',
): bigint {
  if (amount <= 0n) return 0n;
  const from = world.ledger.accounts[fromId];
  const to = world.ledger.accounts[toId];
  if (!from || !to) throw new Error('Unknown account');
  if (from.currency === to.currency) {
    post(world, 'tx.transfer', [
      { accountId: toId, debit: amount },
      { accountId: fromId, credit: amount },
    ]);
    return amount;
  }
  const received = convertCurrency(world, amount, from.currency, to.currency);
  const params = { from: from.currency, to: to.currency };
  post(
    world,
    kind,
    [
      {
        accountId: categoryAccount(world, ownerId, 'expense', 'currencyExchange', from.currency),
        debit: amount,
      },
      { accountId: fromId, credit: amount },
    ],
    { params },
  );
  if (received > 0n)
    post(
      world,
      kind,
      [
        { accountId: toId, debit: received },
        {
          accountId: categoryAccount(world, ownerId, 'income', 'currencyExchange', to.currency),
          credit: received,
        },
      ],
      { params },
    );
  return received;
}

/**
 * Converts a liability (loan or arrears) into another currency: the old balance is cleared
 * and an equal debt opens in the new currency, with the same loan terms.
 */
export function convertLiability(world: World, account: Account, currency: string): string {
  const amount = account.balance;
  const converted = convertCurrency(world, amount, account.currency, currency);
  const next = openAccount(world, account.ownerId, account.type as 'loan' | 'arrears', currency, {
    category: account.category,
    rateBp: account.rateBp,
  });
  const created = world.ledger.accounts[next];
  if (created && account.loan) {
    created.loan = {
      ...account.loan,
      paymentMinor: convertCurrency(world, account.loan.paymentMinor, account.currency, currency),
      principalMinor: convertCurrency(
        world,
        account.loan.principalMinor,
        account.currency,
        currency,
      ),
    };
  }
  const params = { from: account.currency, to: currency };
  if (amount > 0n) {
    post(
      world,
      'tx.currencyExchange',
      [
        { accountId: account.id, debit: amount },
        {
          accountId: categoryAccount(
            world,
            account.ownerId,
            'income',
            'currencyExchange',
            account.currency,
          ),
          credit: amount,
        },
      ],
      { params },
    );
  }
  if (converted > 0n) {
    post(
      world,
      'tx.currencyExchange',
      [
        {
          accountId: categoryAccount(
            world,
            account.ownerId,
            'expense',
            'currencyExchange',
            currency,
          ),
          debit: converted,
        },
        { accountId: next, credit: converted },
      ],
      { params },
    );
  }
  account.closedTick = world.tick;
  return next;
}

/** A current account kept in another currency (for property or loans left abroad). */
export function localAccount(world: World, ownerId: string, currency: string): string {
  const existing = sortedValues(world.ledger.accounts).find(
    (a) =>
      a.ownerId === ownerId &&
      a.type === 'checking' &&
      a.category === 'abroad' &&
      a.currency === currency &&
      a.closedTick === null,
  );
  return existing?.id ?? openAccount(world, ownerId, 'checking', currency, { category: 'abroad' });
}

/** Open accounts kept abroad for this owner. */
export function abroadAccounts(world: World, ownerId: string): Account[] {
  return sortedValues(world.ledger.accounts).filter(
    (a) =>
      a.ownerId === ownerId &&
      a.type === 'checking' &&
      a.category === 'abroad' &&
      a.closedTick === null,
  );
}

/** Tops a foreign account up from the main account, as far as money allows. */
export function topUp(
  world: World,
  ownerId: string,
  mainId: string,
  localId: string,
  needed: bigint,
): void {
  const local = world.ledger.accounts[localId];
  const main = world.ledger.accounts[mainId];
  if (!local || !main) return;
  const shortfall = needed - balanceOf(world, localId);
  if (shortfall <= 0n) return;
  // Buy a little extra to cover rounding in the conversion.
  const cost = convertCurrency(world, shortfall, local.currency, main.currency) + 1n;
  const pay = cost < balanceOf(world, mainId) ? cost : balanceOf(world, mainId);
  if (pay > 0n) exchange(world, ownerId, mainId, localId, pay);
}
