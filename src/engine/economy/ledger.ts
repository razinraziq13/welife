import { nextId } from '../core/world';
import type {
  Account,
  AccountType,
  LedgerEntry,
  LedgerTransaction,
  MonthSummary,
  World,
} from '../state/schema';

/**
 * Balanced double-entry ledger (spec §4 Finance, §6 LedgerTransaction/LedgerEntry).
 *
 * Every transaction's debits equal its credits per currency, and every account keeps a
 * natural (positive) balance on its normal side: checking, savings, retirement and expense
 * accounts are debit-normal; loans, arrears, income and equity are credit-normal. Hence, per
 * currency, the sum of debit-normal balances always equals the sum of credit-normal ones
 * (the trial balance), and net worth = assets - liabilities.
 */

export const DEBIT_NORMAL: ReadonlySet<AccountType> = new Set([
  'checking',
  'savings',
  'retirement',
  'investment',
  'property',
  'stake',
  'expense',
]);
export const ASSET_TYPES: ReadonlySet<AccountType> = new Set([
  'checking',
  'savings',
  'retirement',
  'investment',
  'property',
  'stake',
]);
export const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set(['loan', 'arrears']);

/**
 * Individual transactions are kept in the live world for this many months; every monthly
 * snapshot still contains that month's transactions, so the full record survives in the
 * timeline (spec §5) without growing the world without bound.
 */
export const JOURNAL_MONTHS = 3;
/** Monthly summaries stay monthly for two years, then one per year (bounded history). */
export const MONTHLY_HISTORY = 24;

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export interface OpenAccountOptions {
  rateBp?: number;
  loan?: Account['loan'];
  category?: string;
}

/** Opens a balance-sheet account (checking, savings, retirement, loan, arrears). */
export function openAccount(
  world: World,
  ownerId: string,
  type: Exclude<AccountType, 'income' | 'expense' | 'equity'>,
  currency: string,
  options: OpenAccountOptions = {},
): string {
  const id = nextId(world, 'acc');
  world.ledger.accounts[id] = {
    id,
    ownerId,
    type,
    category: options.category ?? type,
    currency,
    balance: 0n,
    rateBp: options.rateBp ?? 0,
    openedTick: world.tick,
    closedTick: null,
    loan: options.loan ?? null,
  };
  return id;
}

/**
 * Income, expense and equity accounts are created on first use with a deterministic id,
 * so lookups never scan the ledger.
 */
export function categoryAccount(
  world: World,
  ownerId: string,
  type: 'income' | 'expense' | 'equity',
  category: string,
  currency: string,
): string {
  // The first account for a category keeps the short id; a later one in another currency
  // (after moving abroad) gets the currency appended, so currencies never mix.
  const base = `${ownerId}~${type}~${category}`;
  const existing = world.ledger.accounts[base];
  const id = !existing || existing.currency === currency ? base : `${base}~${currency}`;
  world.ledger.accounts[id] ??= {
    id,
    ownerId,
    type,
    category,
    currency,
    balance: 0n,
    rateBp: 0,
    openedTick: world.tick,
    closedTick: null,
    loan: null,
  };
  return id;
}

export function getAccount(world: World, id: string): Account {
  const account = world.ledger.accounts[id];
  if (!account) throw new LedgerError(`Unknown account ${id}`);
  return account;
}

export function balanceOf(world: World, id: string | null): bigint {
  if (id === null) return 0n;
  return world.ledger.accounts[id]?.balance ?? 0n;
}

export interface EntryInput {
  accountId: string;
  debit?: bigint;
  credit?: bigint;
}

/**
 * Posts a balanced transaction. Throws (leaving the world untouched) if it does not balance
 * per currency or would push an asset or liability account below zero.
 */
export function post(
  world: World,
  kind: string,
  entriesIn: readonly EntryInput[],
  options: { params?: LedgerTransaction['params']; source?: string | null } = {},
): LedgerTransaction | null {
  const entries: LedgerEntry[] = entriesIn
    .map((e) => ({ accountId: e.accountId, debit: e.debit ?? 0n, credit: e.credit ?? 0n }))
    .filter((e) => e.debit !== 0n || e.credit !== 0n);
  if (entries.length === 0) return null;
  const totals = new Map<string, bigint>();
  const deltas = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.debit < 0n || entry.credit < 0n)
      throw new LedgerError(`Negative entry amount in ${kind}`);
    const account = getAccount(world, entry.accountId);
    if (account.closedTick !== null) throw new LedgerError(`Account ${account.id} is closed`);
    totals.set(account.currency, (totals.get(account.currency) ?? 0n) + entry.debit - entry.credit);
    const delta = DEBIT_NORMAL.has(account.type)
      ? entry.debit - entry.credit
      : entry.credit - entry.debit;
    deltas.set(account.id, (deltas.get(account.id) ?? 0n) + delta);
  }
  for (const [currency, total] of totals) {
    if (total !== 0n) throw new LedgerError(`${kind} does not balance in ${currency}`);
  }
  for (const [id, delta] of deltas) {
    const account = getAccount(world, id);
    const after = account.balance + delta;
    if (after < 0n && (ASSET_TYPES.has(account.type) || LIABILITY_TYPES.has(account.type))) {
      throw new LedgerError(`${kind} would overdraw ${account.type} account ${id}`);
    }
  }
  for (const [id, delta] of deltas) getAccount(world, id).balance += delta;
  const tx: LedgerTransaction = {
    id: nextId(world, 'tx'),
    tick: world.tick,
    kind,
    params: options.params ?? {},
    source: options.source ?? null,
    entries,
  };
  const key = String(world.tick);
  const month = world.ledger.journal[key] ?? [];
  month.push(tx);
  world.ledger.journal[key] = month;
  return tx;
}

/** Drops journal months older than the retention window. */
export function pruneJournal(world: World): void {
  const oldest = world.tick - JOURNAL_MONTHS;
  for (const key of Object.keys(world.ledger.journal)) {
    if (Number(key) < oldest) Reflect.deleteProperty(world.ledger.journal, key);
  }
}

export function ownedAccounts(world: World, ownerId: string): Account[] {
  return Object.keys(world.ledger.accounts)
    .sort()
    .map((id) => world.ledger.accounts[id] as Account)
    .filter((a) => a.ownerId === ownerId && a.closedTick === null);
}

type AccountAmount = (amount: bigint, currency: string) => bigint;
const nominalAmount: AccountAmount = (amount) => amount;

export function assetsOf(world: World, ownerId: string, value = nominalAmount): bigint {
  let total = 0n;
  for (const a of ownedAccounts(world, ownerId))
    if (ASSET_TYPES.has(a.type)) total += value(a.balance, a.currency);
  return total;
}

export function liabilitiesOf(world: World, ownerId: string, value = nominalAmount): bigint {
  let total = 0n;
  for (const a of ownedAccounts(world, ownerId))
    if (LIABILITY_TYPES.has(a.type)) total += value(a.balance, a.currency);
  return total;
}

export function netWorthOf(world: World, ownerId: string): bigint {
  return assetsOf(world, ownerId) - liabilitiesOf(world, ownerId);
}

/** Income and expenses booked this month for an owner (from their category accounts). */
export function monthTotals(
  world: World,
  ownerId: string,
  tick: number = world.tick,
  value = nominalAmount,
): { income: bigint; expenses: bigint; byCategory: Map<string, bigint> } {
  let income = 0n;
  let expenses = 0n;
  const byCategory = new Map<string, bigint>();
  for (const tx of world.ledger.journal[String(tick)] ?? []) {
    for (const entry of tx.entries) {
      const account = world.ledger.accounts[entry.accountId];
      if (account?.ownerId !== ownerId) continue;
      if (account.type === 'income') {
        const amount = value(entry.credit - entry.debit, account.currency);
        income += amount;
        byCategory.set(
          `income:${account.category}`,
          (byCategory.get(`income:${account.category}`) ?? 0n) + amount,
        );
      } else if (account.type === 'expense') {
        const amount = value(entry.debit - entry.credit, account.currency);
        expenses += amount;
        byCategory.set(
          `expense:${account.category}`,
          (byCategory.get(`expense:${account.category}`) ?? 0n) + amount,
        );
      }
    }
  }
  return { income, expenses, byCategory };
}

/** Appends this month's summary for an owner (bounded history). */
export function recordMonthSummary(world: World, ownerId: string): void {
  const { income, expenses } = monthTotals(world, ownerId);
  const summary: MonthSummary = {
    tick: world.tick,
    income: income < 0n ? 0n : income,
    expenses: expenses < 0n ? 0n : expenses,
    netWorth: netWorthOf(world, ownerId),
  };
  const list = world.ledger.history[ownerId] ?? [];
  if (list.length > 0 && list[list.length - 1]?.tick === world.tick) list.pop();
  list.push(summary);
  const cutoff = world.tick - MONTHLY_HISTORY;
  const stale = list.some((m) => m.tick < cutoff && m.tick % 12 !== 11);
  world.ledger.history[ownerId] = stale
    ? list.filter((m) => m.tick >= cutoff || m.tick % 12 === 11)
    : list;
}

/** Ledger invariants (spec §6): balanced transactions, trial balance, no illegal negatives. */
export function checkLedger(world: World): string[] {
  const violations: string[] = [];
  const trial = new Map<string, bigint>();
  for (const id of Object.keys(world.ledger.accounts)) {
    const a = world.ledger.accounts[id];
    if (!a) continue;
    if (a.id !== id) violations.push(`account key ${id} != id ${a.id}`);
    if (
      !world.characters[a.ownerId] &&
      !world.households[a.ownerId] &&
      !world.businesses[a.ownerId]
    ) {
      violations.push(`account ${id} has unknown owner ${a.ownerId}`);
    }
    if (a.balance < 0n && (ASSET_TYPES.has(a.type) || LIABILITY_TYPES.has(a.type))) {
      violations.push(`account ${id} has a negative balance`);
    }
    const signed = DEBIT_NORMAL.has(a.type) ? a.balance : -a.balance;
    trial.set(a.currency, (trial.get(a.currency) ?? 0n) + signed);
  }
  for (const [currency, total] of trial) {
    if (total !== 0n) violations.push(`trial balance off by ${total.toString()} ${currency}`);
  }
  for (const [key, list] of Object.entries(world.ledger.journal)) {
    for (const tx of list) {
      if (String(tx.tick) !== key) violations.push(`transaction ${tx.id} filed under wrong month`);
      const sums = new Map<string, bigint>();
      for (const e of tx.entries) {
        const account = world.ledger.accounts[e.accountId];
        if (!account) {
          violations.push(`transaction ${tx.id} references unknown account`);
          continue;
        }
        sums.set(account.currency, (sums.get(account.currency) ?? 0n) + e.debit - e.credit);
      }
      for (const total of sums.values()) {
        if (total !== 0n) violations.push(`transaction ${tx.id} does not balance`);
      }
    }
  }
  return violations;
}
