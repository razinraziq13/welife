import { describe, expect, it } from 'vitest';
import { ensurePlayerAccounts } from '@engine/economy/finance';
import { checkLedger, netWorthOf } from '@engine/economy/ledger';
import { projectGambling } from '@engine/economy/gambling';
import { WorldSchema } from '@engine/state/schema';
import { giveMoney } from '../../helpers/reconcile';
import { newState, playerOf, run } from '../../helpers/sim';

function adult() {
  const state = newState({ countryCode: 'MY' });
  const player = playerOf(state);
  player.birth.year -= 25;
  ensurePlayerAccounts(state.world, player);
  return state;
}

describe('lottery and casino', () => {
  it('tickets and bets move real money and lose on average', () => {
    let state = giveMoney(adult(), 100_000_000n);
    const player = playerOf(state);
    const start = netWorthOf(state.world, player.id);
    const { ticketMinor } = projectGambling(state.world, player);
    for (let i = 0; i < 400; i++) {
      const result = run(state, { type: 'buyLotteryTicket' });
      expect(result.outcome.status).toBe('applied');
      state = result.state;
    }
    const afterLottery = netWorthOf(state.world, player.id);
    expect(afterLottery).toBeLessThan(start);
    let wins = 0;
    for (let i = 0; i < 400; i++) {
      const before = netWorthOf(state.world, player.id);
      const result = run(state, { type: 'placeBet', amountMinor: '1000' });
      state = result.state;
      const change = netWorthOf(state.world, player.id) - before;
      expect([1000n, -1000n]).toContain(change);
      if (change > 0n) wins += 1;
    }
    // 18 in 37 ≈ 49%.
    expect(wins).toBeGreaterThan(150);
    expect(wins).toBeLessThan(250);
    expect(ticketMinor > 0n).toBe(true);
    expect(checkLedger(WorldSchema.parse(state.world))).toEqual([]);
  });

  it('refuses children and bets bigger than the current account', () => {
    const child = newState({ countryCode: 'MY' });
    expect(projectGambling(child.world, playerOf(child)).reason).toContain('18');
    expect(run(child, { type: 'buyLotteryTicket' }).outcome.status).toBe('rejected');
    const state = adult();
    const cash = projectGambling(state.world, playerOf(state)).maxBetMinor;
    expect(
      run(state, { type: 'placeBet', amountMinor: (cash + 1n).toString() }).outcome.status,
    ).toBe('rejected');
  });
});
