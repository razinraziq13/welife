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
import { projectGame, projectPerson } from '@engine/view';
import { memoriesAbout } from '@engine/social/memories';
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

  it('looking for love introduces someone single and interested, shown on the Dating card', () => {
    const teen = advanceMonths(newState({ seed: 'love-teen' }), 16 * 12);
    expect(run(teen, { type: 'lookForLove' }).outcome).toMatchObject({ status: 'rejected' });
    let state = advanceMonths(newState({ seed: 'meet33', countryCode: 'MY' }), 33 * 12);
    const r = checked(state, { type: 'lookForLove' });
    state = r.state;
    const id =
      r.outcome.status === 'applied' && r.outcome.kind === 'done'
        ? String(r.outcome.params.personId)
        : '';
    expect(id).not.toBe('');
    const rel = findRelationship(state.world, playerOf(state).id, id);
    expect(rel?.closeness).toBeGreaterThanOrEqual(38);
    expect(rel?.chemistry).toBeGreaterThanOrEqual(65);
    expect(
      memoriesAbout(state.world, id, playerOf(state).id).some((m) => m.key === 'interestedInYou'),
    ).toBe(true);
    const dating = projectGame(state).social.dating;
    expect(dating?.candidates.some((c) => c.id === id && c.interested)).toBe(true);
    expect(dating?.profiles.map((profile) => profile.id)).toContain(id);

    const passed = checked(state, {
      type: 'respondToDatingProfile',
      personId: id,
      response: 'pass',
    });
    expect(passed.outcome.status).toBe('applied');
    expect(projectGame(passed.state).social.dating?.profiles.map((p) => p.id)).not.toContain(id);
    expect(
      run(passed.state, { type: 'respondToDatingProfile', personId: id, response: 'like' }).outcome
        .status,
    ).toBe('rejected');

    const liked = checked(state, {
      type: 'respondToDatingProfile',
      personId: id,
      response: 'like',
    });
    expect(liked.outcome.status).toBe('applied');
    const matched = projectGame(liked.state).social;
    expect(matched.dating?.profiles.map((p) => p.id)).not.toContain(id);
    expect(matched.dating?.matches.map((p) => p.id)).toContain(id);
    expect(matched.partner).toBeNull();
    expect(projectGame(liked.state).time).toEqual(projectGame(state).time);
  });

  it('says exactly how much closer you need to be to ask someone out', () => {
    let state = advanceMonths(newState({ seed: 'meet33', countryCode: 'MY' }), 33 * 12);
    let id = '';
    for (let tries = 0; tries < 5 && id === ''; tries++) {
      const r = checked(state, { type: 'meetPeople' });
      state = r.state;
      if (r.outcome.status === 'applied' && r.outcome.kind === 'done')
        id = String(r.outcome.params.personId ?? '');
    }
    expect(id).not.toBe('');
    const world = structuredClone(state.world);
    adjustPair(world, playerOf(state).id, id, { closeness: -100 });
    adjustPair(world, playerOf(state).id, id, { closeness: 20 });
    const ask = projectPerson({ world, pending: null }, id)?.interactions.find(
      (i) => i.id === 'askOut',
    );
    expect(ask?.reason).toBe('You need to be closer first: closeness 45 needed, you are at 20.');
  });

  it('someone you are getting close to does not go off with someone else meanwhile', () => {
    let state = advanceMonths(newState({ seed: 'meet33', countryCode: 'MY' }), 33 * 12);
    const met: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = checked(state, { type: 'meetPeople' });
      state = r.state;
      if (r.outcome.status === 'applied' && r.outcome.kind === 'done' && r.outcome.params.personId)
        met.push(String(r.outcome.params.personId));
    }
    const world = structuredClone(state.world);
    for (const id of met) adjustPair(world, playerOf(state).id, id, { closeness: 40 });
    state = { world, pending: null };
    for (let m = 0; m < 12; m++) {
      for (const id of met) {
        const r = run(state, { type: 'interact', personId: id, interactionId: 'chat' });
        if (r.outcome.status === 'applied') state = r.state;
      }
      state = advanceMonths(state, 1);
    }
    for (const id of met) expect(state.world.characters[id]?.partnership, id).toBeNull();
  });
});
