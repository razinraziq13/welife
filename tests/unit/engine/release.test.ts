import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { minimumCapital } from '@engine/business/business';
import { getBusinessType } from '@engine/business/catalog';
import { lineOfSuccession } from '@engine/legacy/succession';
import { createNpc } from '@engine/social/npcs';
import { ARCHIVE_HOUSEHOLD_ID, pruneDeparted } from '@engine/social/prune';
import { categoryAccount } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import type { Character, World } from '@engine/state/schema';
import { en } from '../../../src/app/i18n/en';
import { giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** Milestone 9: integration items added during the release pass. */

function child(world: World, parent: Character, ageYears: number, gender: 'male' | 'female') {
  const kid = createNpc(world, {
    countryCode: parent.countryCode,
    householdId: parent.householdId,
    ageYears,
    gender,
    tier: 'close',
  });
  const id = `fl-test-${kid.id}`;
  world.familyLinks[id] = { id, parentId: parent.id, childId: kid.id, type: 'biological' };
  return kid;
}

describe('release pass (Milestone 9)', () => {
  it('a refused command carries a translation key that the English table resolves', () => {
    const state = newState({ seed: 'refusal' });
    const result = run(state, { type: 'takeLoan', amountMinor: '100000', termMonths: 12 });
    expect(result.outcome).toMatchObject({ status: 'rejected', key: 'err.FinanceError.tooYoung' });
    const key = result.outcome.status === 'rejected' ? (result.outcome.key ?? '') : '';
    expect(en[key]).toBe('You must be 18 or older.');
  });

  it('orders the royal line by the country rule: agnatic skips daughters, male preference ranks them after sons', () => {
    for (const [country, expected] of [
      ['MY', ['son-younger']],
      ['GB', ['son-younger', 'daughter-elder']],
      ['US', ['daughter-elder', 'son-younger']],
    ] as const) {
      const world = structuredClone(
        newState({ seed: `line-${country}`, countryCode: country }).world,
      );
      const head = playerOf({ world, pending: null });
      const names = new Map<string, string>();
      names.set(child(world, head, 30, 'female').id, 'daughter-elder');
      names.set(child(world, head, 25, 'male').id, 'son-younger');
      const line = lineOfSuccession(world, head.id, country).map((c) => names.get(c.id));
      expect(line, country).toEqual(expected);
    }
  });

  it('difficulty changes how hard rivals compete: the same café sells more on Casual than on Challenging', () => {
    const base = advanceMonths(newState({ seed: 'rivals', scenario: 'wealthy' }), 24 * 12);
    const revenue = (difficulty: 'casual' | 'challenging') => {
      const world = structuredClone(base.world);
      world.rules.difficulty = difficulty;
      let state: SimState = { world, pending: null };
      const home = playerOf(state).locationId;
      const capital = minimumCapital(state.world, getBusinessType('cafe'), home) * 2n;
      state = giveMoney(state, capital * 2n);
      const started = run(state, {
        type: 'startBusiness',
        typeId: 'cafe',
        locationId: home,
        name: 'Test Café',
        capitalMinor: capital.toString(),
      });
      expect(started.outcome.status === 'rejected' ? started.outcome.message : 'applied').toBe(
        'applied',
      );
      state = advanceMonths(started.state, 1);
      const cafe = Object.values(state.world.businesses).find((b) => b.name === 'Test Café');
      return cafe?.statement?.revenue ?? 0n;
    };
    expect(revenue('casual')).toBeGreaterThan(revenue('challenging'));
  }, 240_000);

  it('yearly clean-up removes only long-departed people nobody refers to, keeping the world valid', () => {
    let state = advanceMonths(newState({ seed: 'prune', countryCode: 'GB' }), 12);
    const world = structuredClone(state.world);
    const player = playerOf({ world, pending: null });
    // A stranger who died long ago and an ancestor who died long ago.
    const stranger = createNpc(world, {
      countryCode: 'GB',
      householdId: player.householdId,
      ageYears: 90,
      tier: 'relevant',
    });
    stranger.death = { year: world.clock.year - 40, month: 1 };
    stranger.deathCause = 'oldAge';
    const parentLink = Object.values(world.familyLinks).find((l) => l.childId === player.id);
    const parent = parentLink ? world.characters[parentLink.parentId] : undefined;
    if (!parent) throw new Error('player has no parent');
    world.households[player.householdId]?.memberIds.splice(
      world.households[player.householdId]?.memberIds.indexOf(stranger.id) ?? 0,
      1,
    );
    expect(pruneDeparted(world)).toBeGreaterThanOrEqual(1);
    expect(world.characters[stranger.id]).toBeUndefined();
    expect(world.characters[parent.id]).toBeDefined();
    expect(world.characters[player.id]).toBeDefined();
    expect(checkInvariants(world)).toEqual([]);
    expect(checkLedger(world)).toEqual([]);
    state = advanceMonths({ world, pending: null }, 1);
    expect(checkInvariants(state.world)).toEqual([]);
  });

  it('closes the books of the long dead: lifetime totals move to an archive equity account and the ledger still balances', () => {
    const world = structuredClone(
      advanceMonths(newState({ seed: 'books', countryCode: 'GB' }), 12).world,
    );
    const player = playerOf({ world, pending: null });
    const home = world.households[player.householdId];
    const checking = home?.finance ? world.ledger.accounts[home.finance.checkingId] : undefined;
    if (!home || !checking) throw new Error('no household budget');
    const ghost = createNpc(world, {
      countryCode: 'GB',
      householdId: player.householdId,
      ageYears: 90,
      tier: 'relevant',
    });
    ghost.death = { year: world.clock.year - 50, month: 3 };
    ghost.deathCause = 'natural';
    home.memberIds = home.memberIds.filter((id) => id !== ghost.id);
    // A lifetime of salary that ended up (via the estate) in the family's account.
    const salary =
      world.ledger.accounts[
        categoryAccount(world, ghost.id, 'income', 'salary', checking.currency)
      ];
    if (!salary) throw new Error('no salary account');
    salary.balance += 12_345_00n;
    checking.balance += 12_345_00n;
    expect(checkLedger(world)).toEqual([]);
    pruneDeparted(world);
    expect(world.characters[ghost.id]).toBeUndefined();
    expect(Object.values(world.ledger.accounts).some((a) => a.ownerId === ghost.id)).toBe(false);
    const archive = Object.values(world.ledger.accounts).find(
      (a) => a.ownerId === ARCHIVE_HOUSEHOLD_ID,
    );
    expect(archive).toMatchObject({
      type: 'equity',
      currency: checking.currency,
      balance: 12_345_00n,
    });
    expect(checkLedger(world)).toEqual([]);
    expect(checkInvariants(world)).toEqual([]);
  });
});
