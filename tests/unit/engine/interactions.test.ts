import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { interactionBlock, INTERACTION_IDS } from '@engine/social/interactions';
import { CONTEXTUAL_IDS, INTERACTION_GROUPS, askMoneyAmount } from '@engine/social/contextual';
import { adjustPair, findRelationship } from '@engine/social/relationships';
import type { SimState } from '@engine/core/commands';
import type { World } from '@engine/state/schema';
import { en } from '../../../src/app/i18n/en';
import { checked, findWork, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

function parentOf(world: World): string {
  const player = world.characters[world.activeCharacterId];
  const link = Object.values(world.familyLinks).find((l) => l.childId === player?.id);
  if (!link) throw new Error('no parent');
  return link.parentId;
}

function block(state: SimState, personId: string, id: (typeof INTERACTION_IDS)[number]) {
  const w = state.world;
  return interactionBlock(w, playerOf(state), w.characters[personId], id);
}

describe('contextual interactions (gameplay expansion, feature 2)', () => {
  it('every interaction belongs to a group and has a label and outcome text', () => {
    for (const id of INTERACTION_IDS) {
      expect(INTERACTION_GROUPS[id], id).toBeDefined();
      expect(en[`interaction.${id}`], id).toBeDefined();
    }
    const source = readFileSync('src/engine/social/contextual.ts', 'utf8');
    const keys = [...source.matchAll(/'(int\.[a-zA-Z]+\.[a-zA-Z]+)'/g)].map((m) => m[1] ?? '');
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) expect(en[key], key).toBeDefined();
  });

  it('explains why an interaction is unavailable', () => {
    const state = advanceMonths(newState({ seed: 'ctx-young' }), 9 * 12);
    const parent = parentOf(state.world);
    // Too young for money of their own? No: children ask parents, but need somewhere to put it.
    expect(block(state, parent, 'askPermission')).toBeNull();
    expect(block(state, parent, 'discussFuture')).toBe('tooYoung');
    expect(block(state, parent, 'askPromotion')).toBe('tooYoung');
    expect(block(state, parent, 'talkItThrough')).toBe('nothingToResolve');
    expect(block(state, parent, 'reconcile')).toBe('noRift');
    expect(block(state, parent, 'collaborate')).toBe('notFriends');
  });

  it('a teenager asking a parent for money moves real money through the ledger, then must wait', () => {
    let state = advanceMonths(newState({ seed: 'ctx-money', scenario: 'wealthy' }), 16 * 12 + 1);
    const parent = parentOf(state.world);
    state = { world: structuredClone(state.world), pending: null };
    // A close relationship, so the parent is likely to say yes.
    adjustPair(state.world, playerOf(state).id, parent, { closeness: 100 });
    expect(block(state, parent, 'askMoney')).toBeNull();
    const before = playerOf(state);
    const account = before.finance?.checkingId ?? before.finance?.savingsId ?? '';
    const startBalance = state.world.ledger.accounts[account]?.balance ?? 0n;
    let outcome = '';
    for (let tries = 0; tries < 4 && outcome !== 'int.askMoney.yes'; tries++) {
      const result = checked(state, {
        type: 'interact',
        personId: parent,
        interactionId: 'askMoney',
      });
      state = result.state;
      if (result.outcome.status === 'applied' && result.outcome.kind === 'interacted')
        outcome = result.outcome.interaction.key;
      else break;
    }
    expect(outcome).toBe('int.askMoney.yes');
    const amount = askMoneyAmount(state.world, playerOf(state));
    expect(state.world.ledger.accounts[account]?.balance).toBe(startBalance + amount);
    expect(checkLedger(state.world)).toEqual([]);
    expect(checkInvariants(state.world)).toEqual([]);
    expect(block(state, parent, 'askMoney')).toBe('tooSoon');
  });

  it('outcomes are deterministic: the same state and choice give the same result', () => {
    const base = advanceMonths(newState({ seed: 'ctx-det' }), 12 * 12);
    const parent = parentOf(base.world);
    const world = structuredClone(base.world);
    adjustPair(world, playerOf(base).id, parent, { closeness: 80 });
    const state: SimState = { world, pending: null };
    const a = run(state, { type: 'interact', personId: parent, interactionId: 'shareSecret' });
    const b = run(state, { type: 'interact', personId: parent, interactionId: 'shareSecret' });
    expect(a.outcome).toEqual(b.outcome);
    expect(a.state.world.relationships).toEqual(b.state.world.relationships);
  });

  it('work interactions need the right person and a strong enough record', () => {
    let state = advanceMonths(newState({ seed: 'ctx-work', scenario: 'wealthy' }), 22 * 12);
    state = findWork(state);
    const player = playerOf(state);
    const job = player.employmentId ? state.world.employment[player.employmentId] : undefined;
    if (!job?.managerId) throw new Error('no job with a manager');
    const manager = job.managerId;
    // A new starter cannot ask for a promotion yet.
    expect(block(state, manager, 'askPromotion')).toBe('notLongEnough');
    // Negotiating a salary only works with your manager, then waits a year.
    const parent = parentOf(state.world);
    expect(block(state, parent, 'negotiateSalary')).toBe('notYourManager');
    expect(block(state, manager, 'negotiateSalary')).toBeNull();
    state = giveMoney(state, 0n);
    const result = checked(state, {
      type: 'interact',
      personId: manager,
      interactionId: 'negotiateSalary',
    });
    expect(result.outcome.status).toBe('applied');
    expect(block(result.state, manager, 'negotiateSalary')).toBe('tooSoon');
    // Networking with a colleague raises professional reputation.
    const rep = playerOf(result.state).career.reputation;
    const net = checked(result.state, {
      type: 'interact',
      personId: manager,
      interactionId: 'network',
    });
    expect(playerOf(net.state).career.reputation).toBeGreaterThan(rep);
    expect(findRelationship(net.state.world, player.id, manager)).toBeDefined();
  });

  it('every new interaction id is registered with a time cost', () => {
    for (const id of CONTEXTUAL_IDS) expect(INTERACTION_IDS).toContain(id);
  });
});
