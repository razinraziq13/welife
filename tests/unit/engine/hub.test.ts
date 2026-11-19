import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { projectHub } from '@engine/activities/hub';
import { HAIR_STYLES_BY_GENDER } from '@engine/characters/genetics';
import {
  HUB_CATEGORIES,
  LIFESTYLE,
  findLifestyle,
  lifestyleBlock,
  lifestyleCost,
} from '@engine/activities/lifestyle';
import type { SimState } from '@engine/core/commands';
import { en } from '../../../src/app/i18n/en';
import { checked, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

function adult(seed: string): SimState {
  const state = advanceMonths(newState({ seed, scenario: 'wealthy' }), 20 * 12);
  const world = structuredClone(state.world);
  const p = playerOf({ world, pending: null });
  p.stats.energy = 1000;
  return giveMoney({ world, pending: null }, 5_000_000n);
}

function balanceOf(state: SimState): bigint {
  const p = playerOf(state);
  const ids = [p.finance?.checkingId, p.finance?.savingsId].filter((x): x is string => Boolean(x));
  return ids.reduce((s, id) => s + (state.world.ledger.accounts[id]?.balance ?? 0n), 0n);
}

describe('Activities Hub (gameplay expansion, feature 8)', () => {
  it('lists every activity in a category, each with a name and the new ones with a hint', () => {
    const hub = projectHub(newState({ seed: 'hub-list' }).world);
    expect(hub.items.length).toBeGreaterThanOrEqual(17 + LIFESTYLE.length);
    for (const item of hub.items) {
      expect(HUB_CATEGORIES).toContain(item.category);
      expect(en[`activity.${item.id}`], item.id).toBeDefined();
      if (item.kind === 'lifestyle') expect(en[`activityHint.${item.id}`], item.id).toBeDefined();
      if (!item.available) expect(item.reason, item.id).toBeTruthy();
    }
    for (const c of HUB_CATEGORIES) expect(en[`hubCategory.${c}`]).toBeDefined();
  });

  it('explains why an activity is unavailable, and refuses it with a translated reason', () => {
    const child = advanceMonths(newState({ seed: 'hub-child' }), 5 * 12);
    expect(lifestyleBlock(child.world, playerOf(child), 'holiday-abroad')).toBe('tooYoung');
    const refused = run(child, { type: 'act', activityId: 'holiday-abroad' });
    expect(refused.outcome).toMatchObject({
      status: 'rejected',
      key: 'err.LifestyleError.tooYoung',
    });
    const key = refused.outcome.status === 'rejected' ? (refused.outcome.key ?? '') : '';
    expect(en[key]).toBe('You are too young for this.');
  });

  it('paid activities go through the ledger; appointments are once a month', () => {
    let state = adult('hub-pay');
    const doctor = findLifestyle('doctor-visit');
    if (!doctor) throw new Error('missing activity');
    const cost = lifestyleCost(state.world, playerOf(state), doctor);
    const before = balanceOf(state);
    const result = checked(state, { type: 'act', activityId: 'doctor-visit' });
    expect(result.outcome).toMatchObject({ status: 'applied', key: 'life.doctor-visit' });
    state = result.state;
    expect(balanceOf(state)).toBe(before - cost);
    expect(checkLedger(state.world)).toEqual([]);
    expect(checkInvariants(state.world)).toEqual([]);
    expect(lifestyleBlock(state.world, playerOf(state), 'doctor-visit')).toBe('doneThisMonth');
  });

  it('a personal project builds over sessions and finishes with a real result', () => {
    const base = adult('hub-novel');
    const world = structuredClone(base.world);
    const p = playerOf({ world, pending: null });
    p.skills.reading = 600;
    p.projects['write-novel'] = 97;
    const before = balanceOf({ world, pending: null });
    const done = checked({ world, pending: null }, { type: 'act', activityId: 'write-novel' });
    expect(done.outcome).toMatchObject({ key: 'life.project.novelPublished' });
    const after = playerOf(done.state);
    expect(after.projects['write-novel']).toBeUndefined();
    expect(balanceOf(done.state)).toBeGreaterThan(before);
    expect(done.state.world.biography.some((b) => b.key === 'bio.projectDone')).toBe(true);
    expect(checkLedger(done.state.world)).toEqual([]);
  });

  it('a project in progress is suggested, with how far along it is', () => {
    const base = adult('hub-suggest');
    const world = structuredClone(base.world);
    playerOf({ world, pending: null }).projects['grow-garden'] = 40;
    const hub = projectHub(world);
    expect(hub.recommendations[0]).toEqual({ id: 'grow-garden', reason: 'projectInProgress:40' });
    const open = new Set(hub.items.filter((i) => i.available).map((i) => i.id));
    for (const r of hub.recommendations) expect(open.has(r.id)).toBe(true);
  });

  it('a lifestyle activity can be a monthly plan, and the plan runs (and pays) each month', () => {
    let state = adult('hub-plan');
    state = checked(state, { type: 'planActivity', activityId: 'cinema', timesPerMonth: 1 }).state;
    expect(projectHub(state.world).items.find((i) => i.id === 'cinema')?.planned).toBe(true);
    const before = balanceOf(state);
    state = advanceMonths(state, 1);
    expect(balanceOf(state)).toBeLessThan(before);
    expect(checkLedger(state.world)).toEqual([]);
  });

  it('outcomes are deterministic', () => {
    const state = adult('hub-det');
    const a = run(state, { type: 'act', activityId: 'driving-licence' });
    const b = run(state, { type: 'act', activityId: 'driving-licence' });
    expect(a.outcome).toEqual(b.outcome);
  });

  it('people start with a hairstyle typical for their gender (players and everyone around them)', () => {
    for (let i = 0; i < 12; i++) {
      const state = newState({
        seed: 'hair-' + String(i),
        identity: { firstName: null, lastName: null, gender: 'male' },
      });
      expect(HAIR_STYLES_BY_GENDER.male, 'player').toContain(playerOf(state).appearance.hairStyle);
      for (const c of Object.values(state.world.characters)) {
        const g = c.identity.gender;
        expect(HAIR_STYLES_BY_GENDER[g], c.id).toContain(c.appearance.hairStyle);
      }
    }
  });

  it('the barber or salon changes your hair, through the ledger, once a month', () => {
    let state = adult('hub-salon');
    const p = playerOf(state);
    const style = p.appearance.hairStyle === 0 ? 1 : 0;
    const colour = p.appearance.hairColor === 0 ? 1 : 0;
    const refused = run(state, {
      type: 'visitSalon',
      hairStyle: p.appearance.hairStyle,
      hairColor: null,
    });
    expect(refused.outcome).toMatchObject({
      status: 'rejected',
      key: 'err.LifestyleError.noChange',
    });
    const before = balanceOf(state);
    const prices = projectHub(state.world).salon;
    const result = checked(state, { type: 'visitSalon', hairStyle: style, hairColor: colour });
    expect(result.outcome).toMatchObject({ status: 'applied', key: 'life.salon.changed' });
    state = result.state;
    expect(playerOf(state).appearance).toMatchObject({ hairStyle: style, hairColor: colour });
    expect(balanceOf(state)).toBe(before - prices.cutMinor - prices.colourMinor);
    expect(checkLedger(state.world)).toEqual([]);
    expect(lifestyleBlock(state.world, playerOf(state), 'salon')).toBe('doneThisMonth');
  });

  it('children can get a haircut (the household pays) but not colour their hair', () => {
    const child = advanceMonths(newState({ seed: 'hub-kid-hair' }), 8 * 12);
    const p = playerOf(child);
    const colour = run(child, {
      type: 'visitSalon',
      hairStyle: p.appearance.hairStyle,
      hairColor: (p.appearance.hairColor + 1) % 8,
    });
    expect(colour.outcome).toMatchObject({
      status: 'rejected',
      key: 'err.LifestyleError.tooYoungToColour',
    });
    const cut = checked(child, {
      type: 'visitSalon',
      hairStyle: (p.appearance.hairStyle + 1) % 8,
      hairColor: null,
    });
    expect(cut.outcome.status).toBe('applied');
    expect(checkLedger(cut.state.world)).toEqual([]);
  });
});
