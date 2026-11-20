import { describe, expect, it } from 'vitest';
import { actingRole, workActionBlock } from '@engine/career/workActions';
import { balanceOf, checkLedger } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import { checked, findWork } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

/** An adult re-cast as an actor, rested, with a strong reputation. */
function actor(seed: string): SimState {
  const state = findWork(advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12));
  const world = structuredClone(state.world);
  const p = world.characters[world.activeCharacterId];
  const job = p?.employmentId ? world.employment[p.employmentId] : undefined;
  if (!p || !job) throw new Error('no job');
  job.terms = { ...job.terms, industryId: 'arts', occupationId: 'actor' };
  p.career.reputation = 1000;
  p.stats.energy = 1000;
  return { world, pending: null };
}

describe('acting contracts (Career Expansion)', () => {
  it('roles grow from extra to lead with credits and reputation', () => {
    const p = playerOf(actor('acting-roles'));
    p.career.credits = 0;
    expect(actingRole(p)).toBe('extra');
    p.career.credits = 2;
    expect(actingRole(p)).toBe('supporting');
    p.career.credits = 5;
    expect(actingRole(p)).toBe('lead');
    p.career.reputation = 400;
    expect(actingRole(p)).toBe('supporting');
  });

  it('a successful audition starts a contract and blocks auditions until it wraps', () => {
    let state = actor('acting-cast');
    for (let i = 0; i < 24 && !playerOf(state).career.contract; i++) {
      state = checked(state, { type: 'workAction', actionId: 'audition' }).state;
      if (!playerOf(state).career.contract) {
        state = advanceMonths(state, 1);
        playerOf(state).stats.energy = 1000;
      }
    }
    const k = playerOf(state).career.contract;
    expect(k?.role).toBe('extra');
    expect(workActionBlock(state.world, playerOf(state), 'audition')).toBe('underContract');
    expect(checkLedger(state.world)).toEqual([]);
  }, 60_000);

  it('TV pays every month and a wrapped production adds a credit', () => {
    const state = actor('acting-tv');
    const p = playerOf(state);
    p.career.contract = { kind: 'tv', role: 'supporting', monthlyMinor: 50_000n, monthsLeft: 1 };
    const account = p.finance?.checkingId ?? null;
    const before = balanceOf(state.world, account);
    const next = advanceMonths(state, 1);
    const tv = Object.values(next.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.tvEpisodes');
    expect(tv.length).toBe(1);
    expect(balanceOf(next.world, account)).not.toBe(before);
    expect(playerOf(next).career.contract).toBeUndefined();
    expect(playerOf(next).career.credits).toBe(1);
  });
});
