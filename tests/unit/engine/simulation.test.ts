import { describe, expect, it } from 'vitest';
import { createWorld, CreationError } from '@engine/characters/create';
import { SCENARIOS, scenarioAvailability } from '@engine/characters/scenarios';
import { execute, replay } from '@engine/core/commands';
import { getEvent } from '@engine/content';
import { checkInvariants } from '@engine/core/invariants';
import { WorldSchema, SCENARIO_IDS } from '@engine/state/schema';
import { COUNTRIES, getCountry } from '@engine/world/countries';
import { projectGame } from '@engine/view';
import { hashState, newLifeInput, newState, scriptedCommands } from '../../helpers/sim';

describe('world creation (M2 exit: every scenario x country)', () => {
  for (const country of COUNTRIES) {
    it(`creates a valid life for every available scenario in ${country.name}`, () => {
      for (const scenario of SCENARIO_IDS) {
        const availability = scenarioAvailability(scenario, country);
        const input = newLifeInput({
          countryCode: country.code,
          scenario,
          seed: `seed-${country.code}-${scenario}`,
        });
        if (!availability.available) {
          expect(() => createWorld('w', input)).toThrow(CreationError);
          continue;
        }
        const world = createWorld('w', input);
        expect(WorldSchema.safeParse(world).success).toBe(true);
        expect(checkInvariants(world)).toEqual([]);
        expect(world.tick).toBe(0); // creation does not advance the month
        const view = projectGame({ world, pending: null });
        expect(view.character.age.totalMonths).toBe(0);
        expect(view.character.countryCode).toBe(country.code);
        if (scenario !== 'random') expect(view.household.scenario).toBe(scenario);
        if (scenario === 'rural') expect(view.character.location.kind).toBe('rural');
        if (scenario === 'singleParent')
          expect(view.household.members.filter((m) => m.relation === 'parent')).toHaveLength(1);
        if (scenario === 'immigrant') {
          expect(view.household.originCountryCode).not.toBeNull();
          expect(view.household.originCountryCode).not.toBe(country.code);
        }
      }
    });
  }

  it('offers royal births only where realistic (D4/D5)', () => {
    const royal = COUNTRIES.filter((c) => scenarioAvailability('royal', c).available)
      .map((c) => c.code)
      .sort();
    expect(royal).toEqual(['AE', 'ID', 'MY', 'SA', 'TH', 'ZA']);
    for (const code of ['GB', 'JP', 'US', 'AU', 'CA', 'NZ', 'FR', 'DE']) {
      expect(scenarioAvailability('royal', getCountry(code)).available).toBe(false);
    }
  });

  it('uses the chosen name, gender and appearance', () => {
    const world = createWorld(
      'w',
      newLifeInput({
        identity: { firstName: 'Aria', lastName: 'Tan', gender: 'nonbinary' },
        appearance: {
          skinTone: 3,
          hairColor: 2,
          hairStyle: 5,
          eyeColor: 1,
          faceShape: 2,
          freckles: true,
        },
      }),
    );
    const view = projectGame({ world, pending: null });
    expect(view.character.identity.firstName).toBe('Aria');
    expect(view.character.identity.lastName).toBe('Tan');
    expect(view.character.identity.gender).toBe('nonbinary');
    expect(view.character.appearance.hairStyle).toBe(5);
  });

  it('rejects invalid input with a clear error', () => {
    expect(() => createWorld('w', newLifeInput({ countryCode: 'XX' }))).toThrow(/Unknown country/);
    expect(() => createWorld('w', newLifeInput({ locationId: 'us-houston' }))).toThrow(
      CreationError,
    );
    expect(() => createWorld('w', { ...newLifeInput(), start: { year: 1990, month: 1 } })).toThrow(
      /present day/,
    );
    expect(() => createWorld('w', newLifeInput({ scenario: 'rural', countryCode: 'SG' }))).toThrow(
      CreationError,
    );
  });

  it('is deterministic for the same seed and different for another seed', () => {
    expect(hashState(newState({ seed: 'abc' }))).toBe(hashState(newState({ seed: 'abc' })));
    expect(hashState(newState({ seed: 'abc' }))).not.toBe(hashState(newState({ seed: 'abd' })));
  });

  it('defines every scenario', () => {
    expect(SCENARIOS.map((s) => s.id).sort()).toEqual(
      SCENARIO_IDS.filter((s) => s !== 'random').sort(),
    );
  });
});

describe('monthly turn', () => {
  it('advances exactly one month per successful Advance, and only once per expected tick', () => {
    let state = newState();
    expect(state.world.clock).toEqual({ year: 2026, month: 11 });
    let result = execute(state, { type: 'advance', id: 'adv-00000001', expectedTick: 0 });
    state = result.state;
    if (state.pending) {
      const instanceId = state.pending.events.pendingInstanceId ?? '';
      const def = getEvent(state.pending.events.instances[instanceId]?.definitionId ?? '');
      state = execute(state, {
        type: 'choose',
        id: 'choose-0001',
        instanceId,
        choiceId: def.choices[0]?.id ?? '',
      }).state;
    }
    expect(state.pending).toBeNull();
    expect(state.world.tick).toBe(1);
    expect(state.world.clock).toEqual({ year: 2026, month: 12 });
    // Double click: a second Advance issued for the same month is rejected as stale.
    result = execute(state, { type: 'advance', id: 'adv-00000002', expectedTick: 0 });
    expect(result.outcome).toMatchObject({ status: 'rejected', reason: 'stale' });
    expect(result.state.world.tick).toBe(1);
    // The year rolls over correctly.
    result = execute(state, { type: 'advance', id: 'adv-00000003', expectedTick: 1 });
    const next = result.state.pending ?? result.state.world;
    expect(next.clock).toEqual({ year: 2027, month: 1 });
  });

  it('rejects a repeated command id (retry after a crash)', () => {
    const state = newState();
    const first = execute(state, { type: 'act', id: 'act-00000001', activityId: 'play-toys' });
    const again = execute(first.state, {
      type: 'act',
      id: 'act-00000001',
      activityId: 'play-toys',
    });
    expect(again.outcome).toMatchObject({ status: 'rejected', reason: 'duplicate' });
    expect(hashState(again.state)).toBe(hashState(first.state));
  });

  it('holds a pending decision without committing the new month', () => {
    // Find a seed whose first months produce a decision.
    for (let i = 0; i < 400; i++) {
      const { state } = scriptedCommands(newState({ seed: `pending-${String(i)}` }), 0);
      let s = state;
      for (let m = 0; m < 60 && s.world.lifeStatus === 'alive'; m++) {
        const tick = s.world.tick;
        const r = execute(s, {
          type: 'advance',
          id: `adv-${String(i)}-${String(tick)}`,
          expectedTick: tick,
        });
        s = r.state;
        if (s.pending) {
          expect(s.world.tick).toBe(tick); // committed world still on the old month
          expect(s.pending.tick).toBe(tick + 1);
          const blocked = execute(s, {
            type: 'advance',
            id: `adv-blocked-${String(i)}`,
            expectedTick: tick,
          });
          expect(blocked.outcome).toMatchObject({ status: 'rejected', reason: 'pendingChoice' });
          return;
        }
      }
    }
    throw new Error('No decision occurred in 400 seeds');
  });

  it('runs 1,000 months deterministically with invariants holding (M1 exit)', () => {
    const a = scriptedCommands(newState({ seed: 'long-run' }), 1000, 'run');
    const b = replay(newState({ seed: 'long-run' }), a.commands);
    expect(hashState(b.state)).toBe(hashState(a.state));
    expect(checkInvariants(a.state.world)).toEqual([]);
    expect(WorldSchema.safeParse(a.state.world).success).toBe(true);
    // Either the life is still going after 1,000 months or it ended naturally.
    const months = a.state.world.tick;
    expect(months > 0).toBe(true);
    expect(a.state.world.notifications.length).toBeLessThanOrEqual(400);
  }, 120_000);

  it('refuses to advance after the life has ended, with a non-graphic biography entry', () => {
    let state = newState({ seed: 'mortal', difficulty: 'challenging' });
    const result = scriptedCommands(state, 1300, 'mortal');
    state = result.state;
    if (state.world.lifeStatus === 'ended') {
      const r = execute(state, {
        type: 'advance',
        id: 'adv-after-death',
        expectedTick: state.world.tick,
      });
      expect(r.outcome).toMatchObject({ status: 'rejected', reason: 'lifeEnded' });
      expect(state.world.biography.some((b) => b.key === 'bio.died')).toBe(true);
    } else {
      // Over 108 years most lives end; if this one did not, it must be very old and alive.
      expect(projectGame(state).character.age.years).toBeGreaterThan(100);
    }
  }, 120_000);
});
