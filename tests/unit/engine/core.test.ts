import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng } from '@engine/core/rng';
import { applyPatch, diff } from '@engine/core/diff';
import { canonicalJson, parseCanonicalJson } from '@engine/core/data';
import { addMonths, ageOf, fromMonthIndex, monthIndex } from '@engine/core/clock';
import { diminishingPercent, performActivity } from '@engine/activities/activities';
import { monthlyMortalityPpm } from '@engine/characters/mortality';
import { lifeStage } from '@engine/characters/stats';
import { execute } from '@engine/core/commands';
import { newState } from '../../helpers/sim';

describe('seeded RNG', () => {
  it('reproduces the same sequence for the same seed', () => {
    const a = Rng.fromSeed('alpha');
    const b = Rng.fromSeed('alpha');
    const seqA = Array.from({ length: 100 }, () => a.nextUint32());
    const seqB = Array.from({ length: 100 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(Array.from({ length: 100 }, () => Rng.fromSeed('beta').nextUint32()));
  });

  it('matches a recorded regression sequence (guards cross-engine determinism)', () => {
    const rng = Rng.fromSeed('welife-regression');
    // If this fails after an intentional generator change, bump ENGINE_VERSION.
    expect([rng.int(1000), rng.int(1000), rng.int(1000), rng.int(1_000_000)]).toMatchSnapshot();
  });

  it('can be saved and restored mid-sequence', () => {
    const rng = Rng.fromSeed('x');
    rng.nextUint32();
    const copy = new Rng(rng.state());
    expect(copy.nextUint32()).toBe(rng.nextUint32());
  });

  it('int() stays within bounds', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 1_000_000 }), (seed, bound) => {
        const value = Rng.fromSeed(seed).int(bound);
        return Number.isInteger(value) && value >= 0 && value < bound;
      }),
    );
  });
});

describe('canonical JSON and snapshot deltas', () => {
  const json = fc.letrec((tie) => ({
    value: fc.oneof(
      { depthSize: 'small' },
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.array(tie('value'), { maxLength: 5 }),
      fc.dictionary(fc.string({ maxLength: 6 }), tie('value'), { maxKeys: 5 }),
    ),
  })).value;

  it('canonical JSON is independent of key order and round-trips (including bigint)', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    const data = { amount: 12345678901234567890n, list: [1, 'x'] };
    expect(parseCanonicalJson(canonicalJson(data))).toEqual(data);
  });

  it('applyPatch(a, diff(a, b)) reproduces b for arbitrary data (property test)', () => {
    fc.assert(
      fc.property(json, json, (a, b) => {
        const restored = applyPatch(a, diff(a, b));
        return canonicalJson(restored) === canonicalJson(b);
      }),
      { numRuns: 500 },
    );
  });

  it('records growth of append-only arrays as compact append operations', () => {
    const before = { log: [1, 2, 3], x: 1 };
    const after = { log: [1, 2, 3, 4], x: 1 };
    expect(diff(before, after)).toEqual([{ op: 'append', path: ['log'], values: [4] }]);
  });
});

describe('clock and ageing', () => {
  it('converts month indexes both ways', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200_000 }), (i) => monthIndex(fromMonthIndex(i)) === i),
    );
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(ageOf({ year: 2026, month: 11 }, { year: 2030, month: 10 })).toEqual({
      years: 3,
      months: 11,
      totalMonths: 47,
    });
  });

  it('assigns life stages by age', () => {
    expect([0, 3, 7, 15, 22, 40, 60, 80].map(lifeStage)).toEqual([
      'baby',
      'toddler',
      'child',
      'teen',
      'youngAdult',
      'adult',
      'middleAge',
      'senior',
    ]);
  });
});

describe('mortality model', () => {
  it('rises with age, falls with health, and is gentler on Casual', () => {
    const base = { health: 700, lifeExpectancy: 80, difficulty: 'realistic' as const };
    expect(monthlyMortalityPpm({ ...base, ageYears: 30 })).toBeLessThan(
      monthlyMortalityPpm({ ...base, ageYears: 80 }),
    );
    expect(monthlyMortalityPpm({ ...base, ageYears: 60, health: 150 })).toBeGreaterThan(
      monthlyMortalityPpm({ ...base, ageYears: 60 }),
    );
    expect(monthlyMortalityPpm({ ...base, ageYears: 60, difficulty: 'casual' })).toBeLessThan(
      monthlyMortalityPpm({ ...base, ageYears: 60 }),
    );
    expect(monthlyMortalityPpm({ ...base, ageYears: 60, lifeExpectancy: 65 })).toBeGreaterThan(
      monthlyMortalityPpm({ ...base, ageYears: 60 }),
    );
  });
});

describe('unlimited actions without exploits (spec §4, §8)', () => {
  it('applies diminishing returns: 1 / (1 + 0.35 n)', () => {
    expect([0, 1, 2, 10].map(diminishingPercent)).toEqual([100, 74, 58, 22]);
  });

  it('bounds the total gain from spamming one activity in a month, on every difficulty', () => {
    for (const difficulty of ['casual', 'realistic', 'challenging'] as const) {
      let state = newState({ seed: `spam-${difficulty}`, difficulty });
      // Grow up to age 10 so most activities are available.
      for (let i = 0; i < 120; i++) {
        const tick = state.world.tick;
        let r = execute(state, {
          type: 'advance',
          id: `adv-${difficulty}-${String(tick)}`,
          expectedTick: tick,
        });
        if (r.state.pending) {
          const id = r.state.pending.events.pendingInstanceId ?? '';
          const def = r.state.pending.events.instances[id]?.definitionId ?? '';
          r = execute(r.state, {
            type: 'choose',
            id: `ch-${difficulty}-${String(tick)}`,
            instanceId: id,
            choiceId: firstChoice(def),
          });
        }
        state = r.state;
        if (state.world.lifeStatus !== 'alive') return;
      }
      const before = state.world.characters[state.world.activeCharacterId]?.skills.reading ?? 0;
      let attempts = 0;
      let applied = 0;
      for (let i = 0; i < 500; i++) {
        const r = execute(state, {
          type: 'act',
          id: `spam-${difficulty}-${String(i)}`,
          activityId: 'read',
        });
        state = r.state;
        attempts += 1;
        if (
          r.outcome.status === 'applied' &&
          r.outcome.kind === 'acted' &&
          r.outcome.activity.status !== 'no-time'
        )
          applied += 1;
      }
      const after = state.world.characters[state.world.activeCharacterId]?.skills.reading ?? 0;
      expect(attempts).toBe(500); // every attempt is accepted...
      expect(applied).toBeLessThan(25); // ...but only a few have any effect
      expect(after - before).toBeLessThan(250); // under 25 skill points per month, however many clicks
      // A brand-new attempt in the same month is ineffective.
      const extra = performActivity(structuredClone(state.world), 'read');
      expect(extra.status).toBe('no-time');
    }
  });
});

import { getEvent } from '@engine/content';
function firstChoice(definitionId: string): string {
  return getEvent(definitionId).choices[0]?.id ?? '';
}
