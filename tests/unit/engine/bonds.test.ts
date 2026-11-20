import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { divRound, monthlyInterest } from '@engine/core/money';
import { balanceOf, checkLedger } from '@engine/economy/ledger';
import { bondSaleValue, bondYieldBp, playerBonds } from '@engine/economy/investments';
import { execute, type SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { MARKET_HISTORY_LIMIT, WorldSchema } from '@engine/state/schema';
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
  it('liquidates market positions and government bonds together at the quoted prices', () => {
    let state = withPolicyRate(investor('bonds-price'), 300);
    for (const fund of ['stocks', 'selara', 'bitcoin', 'bonds'] as const) {
      state = checked(state, { type: 'buyFund', fund, amountMinor: '100000' }).state;
    }
    state = checked(state, { type: 'buyBond', termMonths: 12, amountMinor: '100000' }).state;
    state = checked(state, { type: 'buyBond', termMonths: 120, amountMinor: '100000' }).state;
    state = withPolicyRate(state, 600);

    const before = checking(state);
    const quote = projectGame(state).enterprise.investments;
    const proceeds =
      quote.markets.reduce((total, market) => total + market.balanceMinor, 0n) +
      quote.bonds.reduce((total, bond) => total + bond.saleValueMinor, 0n);
    expect(proceeds).toBeLessThan(600_000n);

    const command = { type: 'liquidateInvestments', id: 'liquidate-portfolio' } as const;
    const result = execute(state, command);
    expect(result.outcome).toMatchObject({ status: 'applied', key: 'out.investmentsLiquidated' });
    expect(checking(result.state)).toBe(before + proceeds);
    const remaining = projectGame(result.state).enterprise.investments;
    expect(remaining.markets.every((market) => market.balanceMinor === 0n)).toBe(true);
    expect(remaining.bonds).toEqual([]);
    expect(checkLedger(result.state.world)).toEqual([]);
    expect(checking(state)).toBe(before);

    const duplicate = execute(result.state, command);
    expect(duplicate.outcome).toMatchObject({ status: 'rejected', reason: 'duplicate' });
    expect(duplicate.state).toBe(result.state);
    expect(run(result.state, { type: 'liquidateInvestments' }).outcome).toMatchObject({
      status: 'rejected',
      key: 'err.InvestmentError.emptyPortfolio',
    });
  });

  it('starts chart history for older saves and marks each new investment at its own market price', () => {
    const older = investor('investment-market');
    const country = playerOf(older).countryCode;
    const economy = older.world.economy[country];
    if (!economy) throw new Error('no economy');
    delete economy.marketHistory;
    const state: SimState = { world: WorldSchema.parse(older.world), pending: null };
    const original = projectGame(state).enterprise.investments.markets;
    expect(original).toHaveLength(7);
    expect(original.every((market) => market.history.length === 1)).toBe(true);
    const principal = 100_000n;
    let invested = state;
    for (const fund of ['bitcoin', 'technology', 'consumer', 'selara', 'meranti'] as const) {
      invested = checked(invested, {
        type: 'buyFund',
        fund,
        amountMinor: principal.toString(),
      }).state;
    }
    const next = advanceMonths(invested, 1);
    const markets = projectGame(next).enterprise.investments.markets;
    expect(markets).toEqual(projectGame(advanceMonths(invested, 1)).enterprise.investments.markets);
    for (const fund of ['bitcoin', 'technology', 'consumer', 'selara', 'meranti'] as const) {
      const market = markets.find(({ id }) => id === fund);
      const [first, latest] = market?.history ?? [];
      if (!market || !first || !latest) throw new Error('missing market history');
      expect([first.tick, latest.tick]).toEqual([state.world.tick, next.world.tick]);
      expect(market.balanceMinor).toBe(
        divRound(principal * BigInt(latest.indexBp), BigInt(first.indexBp)),
      );
      expect(market.costMinor).toBe(principal);
    }
    const sold = checked(next, { type: 'sellFund', fund: 'bitcoin', amountMinor: '10000' }).state;
    expect(checkLedger(sold.world)).toEqual([]);
    const later = advanceMonths(sold, MARKET_HISTORY_LIMIT);
    expect(later.world.economy[country]?.marketHistory).toHaveLength(MARKET_HISTORY_LIMIT);
    expect(WorldSchema.safeParse(later.world).success).toBe(true);
  });

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
