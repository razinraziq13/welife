import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { divRound } from '@engine/core/money';
import { checkLedger } from '@engine/economy/ledger';
import { currencyReform, scaleMoney } from '@engine/economy/reform';
import { WorldSchema } from '@engine/state/schema';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

describe('currency reform for saves from before today-money prices (E87)', () => {
  it('brings a century of inflation back to today’s money once, keeping the books balanced', () => {
    const state = advanceMonths(newState({ seed: 'reform', countryCode: 'MY' }), 30);
    const world = structuredClone(state.world);
    const h = world.households[playerOf(state).householdId]?.finance;
    if (!h) throw new Error('no household finance');
    const before = world.ledger.accounts[h.checkingId]?.balance ?? 0n;
    // An old save: every price and amount 25 times higher.
    scaleMoney(world, 25n, 1n);
    for (const e of Object.values(world.economy)) {
      e.priceIndexBp *= 25;
      e.priceIndexYearAgoBp *= 25;
      e.wageIndexBp *= 25;
      e.housePriceBp *= 25;
    }
    const my = world.economy.MY;
    const priceIndex = my?.priceIndexBp ?? 0;
    currencyReform(world);
    // Back to the start price level: amounts are divided by the whole price index.
    expect(my?.priceIndexBp).toBe(10_000);
    expect(world.ledger.accounts[h.checkingId]?.balance).toBe(
      divRound(before * 25n * 10_000n, BigInt(priceIndex)),
    );
    expect(world.notifications.at(-1)?.messageKey).toBe('ntf.currencyReform');
    expect(checkLedger(world)).toEqual([]);
    expect(checkInvariants(world)).toEqual([]);
    expect(WorldSchema.safeParse(world).success).toBe(true);
    // Once only.
    const count = world.notifications.length;
    currencyReform(world);
    expect(world.notifications.length).toBe(count);
    expect(checkLedger(advanceMonths({ world, pending: null }, 3).world)).toEqual([]);
  });
});
