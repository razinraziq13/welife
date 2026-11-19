import { describe, expect, it } from 'vitest';
import { lifeMilestones, lifeSummary, lifeTitle, type LifeFacts } from '@engine/legacy/summary';
import { projectLegacy } from '@engine/viewLegacy';
import type { BiographyEntry } from '@engine/state/schema';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

const base: LifeFacts = {
  ageYears: 70,
  countries: 1,
  children: 0,
  grandchildren: 0,
  jobs: 1,
  degree: 'none',
  businessesFounded: 0,
  heldOffice: false,
  followers: 0,
  friends: 0,
};

function entry(id: string, tick: number, category: string, key: string, params = {}) {
  return { id, tick, characterId: 'c', category, key, params } as BiographyEntry;
}

describe('end-of-life summary (roadmap 04 and 30)', () => {
  it('chooses the title by fixed rules, in a fixed order', () => {
    expect(lifeTitle(base)).toBe('quietLife');
    expect(lifeTitle({ ...base, ageYears: 9, heldOffice: true })).toBe('remembered');
    expect(lifeTitle({ ...base, heldOffice: true, businessesFounded: 2 })).toBe('publicServant');
    expect(lifeTitle({ ...base, businessesFounded: 1, countries: 4 })).toBe('entrepreneur');
    expect(lifeTitle({ ...base, countries: 3 })).toBe('explorer');
    expect(lifeTitle({ ...base, followers: 10_000 })).toBe('publicFigure');
    expect(lifeTitle({ ...base, children: 2, grandchildren: 2 })).toBe('familyAnchor');
    expect(lifeTitle({ ...base, degree: 'bachelor' })).toBe('lifelongLearner');
    expect(lifeTitle({ ...base, jobs: 3 })).toBe('hardWorker');
    expect(lifeTitle({ ...base, friends: 5 })).toBe('goodFriend');
  });

  it('picks up to five defining moments, one of each kind, in the order they happened', () => {
    const picked = lifeMilestones([
      entry('b1', 0, 'life', 'bio.born'),
      entry('a1', 5, 'activity', 'bio.activity'),
      entry('w1', 30, 'work', 'bio.promoted'),
      entry('w2', 40, 'work', 'bio.promoted'),
      entry('s1', 10, 'school', 'bio.graduated'),
      entry('f1', 50, 'family', 'bio.married'),
      entry('e1', 20, 'event', 'bio.event', { eventId: 'first-steps' }),
      entry('x1', 60, 'world', 'bio.emigrated'),
      entry('p1', 70, 'property', 'bio.propertyBought'),
    ]);
    expect(picked.map((e) => e.id)).toEqual(['s1', 'w1', 'f1', 'x1', 'p1']);
  });

  it('a life that ends gets the same summary every time, and appears in the legacy view', () => {
    const state = advanceMonths(newState({ seed: 'summary', countryCode: 'GB' }), 30 * 12);
    const world = structuredClone(state.world);
    const player = playerOf({ world, pending: null });
    expect(projectLegacy(world, player).lifeSummary).toBeNull();
    player.death = { ...world.clock };
    world.lifeStatus = 'ended';
    const first = lifeSummary(world, player);
    expect(lifeSummary(structuredClone(world), player)).toEqual(first);
    expect(first.facts.ageYears).toBe(30);
    expect(first.milestones.length).toBeGreaterThan(0);
    expect(first.milestones.length).toBeLessThanOrEqual(5);
    const view = projectLegacy(world, player).lifeSummary;
    expect(view?.title).toBe(first.title);
    expect(view?.name).toBeTruthy();
  });
});
