import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { monthlyInterest } from '@engine/core/money';
import { balanceOf, checkLedger } from '@engine/economy/ledger';
import { bondSaleValue, bondYieldBp, playerBonds } from '@engine/economy/investments';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, findWork, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** An adult with a job and money to invest. */
function investor(seed = 'bonds'): SimState {
  let state = advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12);
  state = findWork(state);
  return giveMoney(state, 2_000_000n);
}

function checking(state: SimState): bigint {
  return balanceOf(state.world, playerOf(state).finance?.checkingId ?? null);
}

function withPolicyRate(state: SimState, bp: number): SimState {
  const world = structuredClone(state.world);
  const economy = world.economy[playerOf(state).countryCode];
  if (!economy) throw new Error('no economy');
  economy.policyRateBp = bp;
  return { world, pending: null };
}

describe('government bonds', () => {
  it('buying locks the current yield and moves the money out of the current account', () => {
    const state = investor();
    const before = checking(state);
    const yieldBp = bondYieldBp(state.world, playerOf(state).countryCode, 60);
    const res = checked(state, { type: 'buyBond', termMonths: 60, amountMinor: '100000' });
    expect(res.outcome.status).toBe('applied');
    expect(checking(res.state)).toBe(before - 100_000n);
    const [bond] = playerBonds(res.state.world, playerOf(res.state).id);
    expect(bond?.balance).toBe(100_000n);
    expect(bond?.bond).toMatchObject({ termMonths: 60, couponBp: yieldBp });
    expect(checkLedger(res.state.world)).toEqual([]);
  });

  it('longer bonds pay more than shorter ones', () => {
    const state = investor('bonds-curve');
    const code = playerOf(state).countryCode;
    expect(bondYieldBp(state.world, code, 120)).toBeGreaterThan(bondYieldBp(state.world, code, 12));
  });

  it('pays interest every month and repays the face value at maturity', () => {
    const bought = checked(investor('bonds-pay'), {
      type: 'buyBond',
      termMonths: 12,
      amountMinor: '100000',
    }).state;
    const [bond] = playerBonds(bought.world, playerOf(bought).id);
    if (!bond?.bond) throw new Error('no bond');
    const coupon = monthlyInterest(100_000n, bond.bond.couponBp);
    expect(coupon).toBeGreaterThan(0n);
    const next = advanceMonths(bought, 1);
    const paid = Object.values(next.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.bondInterest');
    expect(paid.length).toBe(1);
    expect(paid[0]?.entries.some((e) => e.debit === coupon)).toBe(true);

    const late = advanceMonths(bought, 12);
    expect(late.world.ledger.accounts[bond.id]?.closedTick).not.toBeNull();
    const repaid = Object.values(late.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.bondMatured');
    expect(repaid.length).toBe(1);
    expect(checkLedger(late.world)).toEqual([]);
    expect(checkInvariants(late.world)).toEqual([]);
  });

  it('sold early it is worth less when rates rise and more when they fall', () => {
    const base = withPolicyRate(investor('bonds-price'), 300);
    const bought = checked(base, { type: 'buyBond', termMonths: 120, amountMinor: '100000' }).state;
    const code = playerOf(bought).countryCode;
    const [bond] = playerBonds(bought.world, playerOf(bought).id);
    if (!bond) throw new Error('no bond');
    expect(bondSaleValue(bought.world, bond, code)).toBe(100_000n);

    const higher = withPolicyRate(bought, 600);
    const hb = higher.world.ledger.accounts[bond.id];
    if (!hb) throw new Error('no bond');
    const low = bondSaleValue(higher.world, hb, code);
    expect(low).toBeLessThan(100_000n);

    const lower = withPolicyRate(bought, 100);
    const lb = lower.world.ledger.accounts[bond.id];
    if (!lb) throw new Error('no bond');
    expect(bondSaleValue(lower.world, lb, code)).toBeGreaterThan(100_000n);

    // Selling books the loss and pays the price into the current account.
    const cash = checking(higher);
    const sold = checked(higher, { type: 'sellBond', accountId: bond.id });
    expect(sold.outcome.status).toBe('applied');
    expect(checking(sold.state)).toBe(cash + low);
    expect(sold.state.world.ledger.accounts[bond.id]?.closedTick).toBe(sold.state.world.tick);
    expect(checkLedger(sold.state.world)).toEqual([]);

    const again = run(sold.state, { type: 'sellBond', accountId: bond.id });
    expect(again.outcome.status).toBe('rejected');
  });
});

describe('fund gains', () => {
  it('tracks what was put in, reduced in proportion when selling', () => {
    const state = investor('fund-cost');
    const a = checked(state, { type: 'buyFund', fund: 'stocks', amountMinor: '100000' }).state;
    const b = checked(a, { type: 'buyFund', fund: 'stocks', amountMinor: '50000' }).state;
    expect(projectGame(b).enterprise.investments.stocksCostMinor).toBe(150_000n);
    const c = checked(b, { type: 'sellFund', fund: 'stocks', amountMinor: '75000' }).state;
    expect(projectGame(c).enterprise.investments.stocksCostMinor).toBe(75_000n);
    const later = advanceMonths(c, 3);
    const inv = projectGame(later).enterprise.investments;
    expect(inv.stocksCostMinor).toBe(75_000n);
    expect(inv.stocksMinor).not.toBe(75_000n);
  });
});
