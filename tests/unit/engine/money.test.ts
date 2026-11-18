import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  amortisedPayment,
  applyBp,
  divRound,
  monthlyInterest,
  progressiveTax,
} from '@engine/core/money';
import {
  checkLedger,
  categoryAccount,
  openAccount,
  post,
  LedgerError,
} from '@engine/economy/ledger';
import { annualIncomeTax, annualSocial, payslip } from '@engine/economy/tax';
import { majorToMinor } from '@engine/world/rules';
import { newState } from '../../helpers/sim';

describe('integer money maths', () => {
  it('rounds half away from zero', () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(applyBp(10_000n, 375)).toBe(375n);
  });

  it('an amortised loan is repaid within its term, never by more than one payment', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1_000n, max: 100_000_000n }),
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 6, max: 120 }),
        (principal, rateBp, months) => {
          const payment = amortisedPayment(principal, rateBp, months);
          let balance = principal;
          let paid = 0;
          while (balance > 0n && paid < months + 1) {
            balance += monthlyInterest(balance, rateBp);
            balance -= payment < balance ? payment : balance;
            paid += 1;
          }
          expect(balance).toBe(0n);
          expect(paid).toBeLessThanOrEqual(months);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a tiny rate over a long term still clears on time (regression found by fast-check)', () => {
    const payment = amortisedPayment(39_324_041n, 6, 55);
    let balance = 39_324_041n;
    for (let i = 0; i < 55; i++) {
      balance += monthlyInterest(balance, 6);
      balance -= payment < balance ? payment : balance;
    }
    expect(balance).toBe(0n);
  });

  it('progressive tax is monotonic and never exceeds the income', () => {
    const bands = [
      { fromMinor: 0n, rateBp: 0 },
      { fromMinor: 1_000n, rateBp: 2000 },
      { fromMinor: 5_000n, rateBp: 4500 },
    ];
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000n }),
        (a, extra) => {
          const t1 = progressiveTax(a, bands);
          const t2 = progressiveTax(a + extra, bands);
          expect(t2 >= t1).toBe(true);
          expect(t1 <= a).toBe(true);
        },
      ),
    );
    expect(progressiveTax(6_000n, bands)).toBe(800n + 450n);
  });
});

describe('country tax baseline', () => {
  const world = newState({ countryCode: 'GB' }).world;

  it('UK: 20% above the personal allowance on £30,000', () => {
    const annual = majorToMinor('GB', 30_000);
    // (30,000 - 12,570) x 20% = 3,486.
    expect(annualIncomeTax(world, 'GB', annual)).toBe(majorToMinor('GB', 3_486));
    // National Insurance: 8% of 17,430 = 1,394.40.
    expect(annualSocial(world, 'GB', annual)).toBe(139_440n);
  });

  it('countries without income tax take none', () => {
    const uae = newState({ countryCode: 'AE' }).world;
    expect(annualIncomeTax(uae, 'AE', majorToMinor('AE', 500_000))).toBe(0n);
  });

  it('a payslip always adds up to the gross salary', () => {
    for (const code of ['MY', 'SG', 'US', 'GB', 'DE', 'JP', 'IN', 'BR', 'ZA']) {
      const w = newState({ countryCode: code }).world;
      for (const gross of [100_000n, 1_000_000n, 25_000_000n]) {
        const slip = payslip(w, code, gross, 500, true);
        expect(slip.net + slip.tax + slip.social + slip.pension + slip.voluntary).toBe(gross);
        expect(slip.net >= 0n).toBe(true);
      }
    }
  });
});

describe('double-entry ledger', () => {
  it('posts balanced transactions and keeps the trial balance', () => {
    const world = structuredClone(newState().world);
    const owner = world.activeCharacterId;
    const checking = openAccount(world, owner, 'checking', 'MYR');
    const income = categoryAccount(world, owner, 'income', 'salary', 'MYR');
    post(world, 'tx.salary', [
      { accountId: checking, debit: 500n },
      { accountId: income, credit: 500n },
    ]);
    expect(world.ledger.accounts[checking]?.balance).toBe(500n);
    expect(checkLedger(world)).toEqual([]);
  });

  it('refuses unbalanced or overdrawing transactions without changing anything', () => {
    const world = structuredClone(newState().world);
    const owner = world.activeCharacterId;
    const checking = openAccount(world, owner, 'checking', 'MYR');
    const expense = categoryAccount(world, owner, 'expense', 'living', 'MYR');
    expect(() =>
      post(world, 'tx.bad', [
        { accountId: checking, debit: 10n },
        { accountId: expense, credit: 9n },
      ]),
    ).toThrow(LedgerError);
    expect(() =>
      post(world, 'tx.overdraw', [
        { accountId: expense, debit: 10n },
        { accountId: checking, credit: 10n },
      ]),
    ).toThrow(LedgerError);
    expect(world.ledger.accounts[checking]?.balance).toBe(0n);
    expect(checkLedger(world)).toEqual([]);
  });

  it('any sequence of valid postings keeps every invariant (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.integer({ min: 0, max: 3 }),
            amount: fc.bigInt({ min: 1n, max: 100_000n }),
          }),
          {
            maxLength: 60,
          },
        ),
        (ops) => {
          const world = structuredClone(newState().world);
          const owner = world.activeCharacterId;
          const checking = openAccount(world, owner, 'checking', 'MYR');
          const savings = openAccount(world, owner, 'savings', 'MYR');
          const loan = openAccount(world, owner, 'loan', 'MYR');
          const income = categoryAccount(world, owner, 'income', 'salary', 'MYR');
          const expense = categoryAccount(world, owner, 'expense', 'living', 'MYR');
          for (const op of ops) {
            const bal = (id: string) => world.ledger.accounts[id]?.balance ?? 0n;
            if (op.kind === 0)
              post(world, 'in', [
                { accountId: checking, debit: op.amount },
                { accountId: income, credit: op.amount },
              ]);
            if (op.kind === 1 && bal(checking) >= op.amount)
              post(world, 'out', [
                { accountId: expense, debit: op.amount },
                { accountId: checking, credit: op.amount },
              ]);
            if (op.kind === 2 && bal(checking) >= op.amount)
              post(world, 'save', [
                { accountId: savings, debit: op.amount },
                { accountId: checking, credit: op.amount },
              ]);
            if (op.kind === 3)
              post(world, 'borrow', [
                { accountId: checking, debit: op.amount },
                { accountId: loan, credit: op.amount },
              ]);
          }
          expect(checkLedger(world)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
