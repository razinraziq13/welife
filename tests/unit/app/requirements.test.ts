import { describe, expect, it } from 'vitest';
import { requirementText } from '@app/i18n/requirements';
import { firstUnmet } from '@engine/events/runtime';
import type { Predicate } from '@engine/events/schema';
import { newState, playerOf } from '../../helpers/sim';

describe('why a choice is closed', () => {
  it('explains common conditions in plain English', () => {
    expect(requirementText({ kind: 'cmp', fact: 'age.years', op: 'gte', value: 18 })).toBe(
      'You need to be at least 18 years old.',
    );
    // Stats are stored in tenths: 600 is shown as 60.
    expect(
      requirementText({ kind: 'cmp', fact: 'stats.intelligence', op: 'gte', value: 600 }),
    ).toBe('Needs Intelligence of at least 60.');
    expect(requirementText({ kind: 'cmp', fact: 'job.employed', op: 'eq', value: true })).toBe(
      'You need a job.',
    );
    expect(requirementText({ kind: 'cmp', fact: 'social.married', op: 'ne', value: true })).toBe(
      'Not while you are married.',
    );
  });

  it('always says something, even for unusual conditions', () => {
    expect(requirementText({ kind: 'cmp', fact: 'flags.secret', op: 'eq', value: true })).toBe(
      'Your situation right now doesn’t allow this.',
    );
    expect(requirementText(null)).toBe('');
  });

  it('the engine reports the first unmet part of a combined condition', () => {
    const world = newState({ seed: 'unmet' }).world;
    const player = playerOf({ world, pending: null });
    const adult: Predicate = { kind: 'cmp', fact: 'age.years', op: 'gte', value: 18 };
    const always: Predicate = { kind: 'cmp', fact: 'age.years', op: 'gte', value: 0 };
    expect(firstUnmet({ kind: 'all', of: [always, adult] }, world, player)).toEqual(adult);
    expect(firstUnmet(always, world, player)).toBeNull();
    const either: Predicate = { kind: 'any', of: [adult, adult] };
    expect(firstUnmet(either, world, player)).toEqual(either);
  });
});
