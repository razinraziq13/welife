import { describe, expect, it } from 'vitest';
import { ensurePlayerAccounts, payExpense, receiveIncome } from '@engine/economy/finance';
import { balanceOf, checkLedger } from '@engine/economy/ledger';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

describe('overdue bills', () => {
  it('are paid from savings when the current account is empty', () => {
    const state = advanceMonths(newState({ seed: 'arrears-savings', countryCode: 'MY' }), 1);
    const p = playerOf(state);
    p.birth.year -= 25;
    ensurePlayerAccounts(state.world, p);
    const checking = p.finance?.checkingId ?? '';
    const savings = p.finance?.savingsId ?? '';
    const payer = { ownerId: p.id, checkingId: checking, savingsId: savings };
    // Empty both accounts with a bill too big to pay: the rest becomes overdue.
    const { unpaid } = payExpense(state.world, payer, 'other', 1_000_000_000n, 'tx.overheads');
    expect(unpaid).toBeGreaterThan(0n);
    // Money then arrives in savings only (as birthday money does).
    receiveIncome(state.world, p.id, savings, 'gifts', 2_000_000_000n, 'tx.birthdayGift');
    expect(balanceOf(state.world, checking)).toBe(0n);
    const next = advanceMonths(state, 1);
    const overdue = Object.values(next.world.ledger.accounts).filter(
      (a) => a.ownerId === p.id && a.type === 'arrears' && a.balance > 0n,
    );
    expect(overdue).toEqual([]);
    expect(checkLedger(next.world)).toEqual([]);
  });
});
