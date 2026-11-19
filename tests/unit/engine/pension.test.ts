import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { balanceOf, checkLedger } from '@engine/economy/ledger';
import { LUMP_SUM_PERCENT, lumpSumBlock, retirementDraw } from '@engine/economy/finance';
import { applyPercent } from '@engine/core/money';
import type { CommandOutcome, SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, findWork } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

function keyOf(o: CommandOutcome): string | undefined {
  return 'key' in o ? o.key : undefined;
}

/** A worker who has paid into the fund for a while, made `age` years old for the test. */
function saver(age: number, seed = 'pension'): SimState {
  let state = advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12);
  state = findWork(state);
  state = advanceMonths(state, 24);
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  if (!player) throw new Error('no player');
  player.birth = { ...player.birth, year: world.clock.year - age - 1 };
  return { world, pending: null };
}

function fund(state: SimState): bigint {
  return balanceOf(state.world, playerOf(state).finance?.retirementId ?? null);
}

function checking(state: SimState): bigint {
  return balanceOf(state.world, playerOf(state).finance?.checkingId ?? null);
}

describe('retirement fund payouts', () => {
  it('the lump sum is 25% of the fund, paid into the current account, once', () => {
    const state = saver(56);
    const before = fund(state);
    expect(before).toBeGreaterThan(0n);
    expect(lumpSumBlock(state.world, playerOf(state))).toBeNull();
    const view = projectGame(state).finance.retirementPayout;
    expect(view.lumpSumMinor).toBe(applyPercent(before, LUMP_SUM_PERCENT));
    expect(view.lumpSumBlock).toBeNull();

    const cash = checking(state);
    const res = checked(state, { type: 'takePensionLumpSum' });
    expect(keyOf(res.outcome)).toBe('out.pensionLumpSum');
    const amount = applyPercent(before, LUMP_SUM_PERCENT);
    expect(fund(res.state)).toBe(before - amount);
    expect(checking(res.state)).toBe(cash + amount);
    expect(checkLedger(res.state.world)).toEqual([]);
    expect(checkInvariants(res.state.world)).toEqual([]);

    const again = run(res.state, { type: 'takePensionLumpSum' });
    expect(again.outcome.status).toBe('rejected');
    expect(keyOf(again.outcome)).toBe('err.FinanceError.lumpSumTaken');
    expect(projectGame(res.state).finance.retirementPayout.lumpSumBlock).toBe(
      'You have already taken your one-off lump sum.',
    );
  });

  it('not before 55, and the reason is shown', () => {
    const state = saver(40, 'pension-young');
    const res = run(state, { type: 'takePensionLumpSum' });
    expect(res.outcome.status).toBe('rejected');
    expect(keyOf(res.outcome)).toBe('err.FinanceError.tooYoungForLumpSum');
    expect(projectGame(state).finance.retirementPayout.lumpSumBlock).toMatch(/age of 55/);
  });

  it('after retiring, the fund pays the shown monthly amount', () => {
    const state = saver(60, 'pension-retire');
    const retired = checked(state, { type: 'retire' }).state;
    const expected = retirementDraw(retired.world, playerOf(retired));
    expect(expected).toBeGreaterThan(0n);
    expect(projectGame(retired).finance.retirementPayout).toMatchObject({
      retired: true,
      monthlyMinor: expected,
    });
    const before = fund(retired);
    const next = advanceMonths(retired, 1);
    const drawn = Object.values(next.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.drawdown');
    expect(drawn.length).toBeGreaterThan(0);
    expect(fund(next)).toBeLessThan(before + applyPercent(before, 5));
  });
});
