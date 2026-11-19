import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { applyPercent } from '@engine/core/money';
import {
  careerMonth,
  careerTrack,
  jobSatisfaction,
  overtimePay,
  workActionBlock,
} from '@engine/career/workActions';
import { WorldSchema, type Employment } from '@engine/state/schema';
import { migrateWorld } from '@persistence/migrations';
import type { SimState } from '@engine/core/commands';
import { checked, findWork } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** An adult with a job, re-cast into the given industry and occupation for the test. */
function workerIn(industryId: string, occupationId: string, seed = 'career'): SimState {
  let state = advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12);
  state = findWork(state);
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  const job = player?.employmentId ? world.employment[player.employmentId] : undefined;
  if (!player || !job) throw new Error('no job');
  job.terms = { ...job.terms, industryId, occupationId };
  player.stats.energy = 1000;
  return { world, pending: null };
}

function jobOf(state: SimState): Employment {
  const p = playerOf(state);
  const e = p.employmentId ? state.world.employment[p.employmentId] : undefined;
  if (!e) throw new Error('no job');
  return e;
}

describe('career simulation (gameplay expansion, feature 6)', () => {
  it('each career has its own track', () => {
    const e = (industryId: string, occupationId = 'x') =>
      ({ terms: { industryId, occupationId } }) as Employment;
    expect(careerTrack(e('education'))).toBe('teaching');
    expect(careerTrack(e('healthcare'))).toBe('medicine');
    expect(careerTrack(e('arts'))).toBe('performing');
    expect(careerTrack(e('banking'))).toBe('office');
  });

  it('explains why a work action is unavailable', () => {
    const young = newState({ seed: 'career-none' });
    expect(workActionBlock(young.world, playerOf(young), 'extraShift')).toBe('noJob');
    const teacher = workerIn('education', 'primary-teacher');
    expect(workActionBlock(teacher.world, playerOf(teacher), 'extraShift')).toBe('otherTrack');
    expect(workActionBlock(teacher.world, playerOf(teacher), 'prepareLessons')).toBeNull();
    const after = checked(teacher, { type: 'workAction', actionId: 'prepareLessons' }).state;
    expect(workActionBlock(after.world, playerOf(after), 'prepareLessons')).toBe('doneThisMonth');
    expect(jobOf(after).performance).toBeGreaterThan(jobOf(teacher).performance);
  });

  it('an extra shift pays overtime through the ledger', () => {
    const doctor = workerIn('healthcare', 'doctor', 'career-doc');
    const player = playerOf(doctor);
    const account = player.finance?.checkingId ?? '';
    const before = doctor.world.ledger.accounts[account]?.balance ?? 0n;
    const pay = overtimePay(player, jobOf(doctor), 8);
    expect(pay).toBeGreaterThan(0n);
    const after = checked(doctor, { type: 'workAction', actionId: 'extraShift' }).state;
    expect(after.world.ledger.accounts[account]?.balance).toBe(before + pay);
    expect(checkLedger(after.world)).toEqual([]);
    expect(checkInvariants(after.world)).toEqual([]);
  });

  it('finishing a specialism raises pay by 10% and is recorded', () => {
    const doctor = workerIn('healthcare', 'doctor', 'career-spec');
    const world = structuredClone(doctor.world);
    const player = playerOf({ world, pending: null });
    player.career.specialtyProgress = 95;
    const salary = jobOf({ world, pending: null }).salaryMinor;
    const after = checked(
      { world, pending: null },
      { type: 'workAction', actionId: 'studySpecialty' },
    ).state;
    const p = playerOf(after);
    expect(p.career.specialty).not.toBeNull();
    expect(jobOf(after).salaryMinor).toBe(salary + applyPercent(salary, 10));
    expect(after.world.biography.some((b) => b.key === 'bio.specialised')).toBe(true);
    expect(workActionBlock(after.world, p, 'studySpecialty')).toBe('doneThisMonth');
  });

  it('satisfaction stays between 0 and 100 and good work builds reputation', () => {
    const worker = workerIn('banking', 'bank-teller', 'career-sat');
    const world = structuredClone(worker.world);
    const player = playerOf({ world, pending: null });
    const job = jobOf({ world, pending: null });
    job.performance = 900;
    const s = jobSatisfaction(world, player, job);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    const rep = player.career.reputation;
    careerMonth(world, player, job);
    expect(player.career.reputation).toBe(rep + 5);
  });

  it('work outcomes are deterministic', () => {
    const teacher = workerIn('education', 'primary-teacher', 'career-det');
    const a = run(teacher, { type: 'workAction', actionId: 'tryNewMethod' });
    const b = run(teacher, { type: 'workAction', actionId: 'tryNewMethod' });
    expect(a.outcome).toEqual(b.outcome);
  });

  it('older saves without the new career fields still load, with defaults', () => {
    const state = advanceMonths(newState({ seed: 'career-old' }), 3);
    const raw = JSON.parse(
      JSON.stringify(state.world, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v)),
    ) as { characters: Record<string, Record<string, unknown>> };
    for (const c of Object.values(raw.characters)) {
      delete c.career;
      delete c.projects;
    }
    const revive = JSON.parse(JSON.stringify(raw), (_k, v: unknown) =>
      typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v,
    ) as unknown;
    const parsed = WorldSchema.parse(revive);
    const player = parsed.characters[parsed.activeCharacterId];
    expect(player?.career).toEqual({ reputation: 200, specialty: null, specialtyProgress: 0 });
    expect(player?.projects).toEqual({});
    // Snapshots are rebuilt without a schema parse: the migration step fills the defaults too.
    const migrated = migrateWorld(revive) as {
      characters: Record<string, Record<string, unknown>>;
    };
    for (const c of Object.values(migrated.characters)) {
      expect(c.career).toEqual({ reputation: 200, specialty: null, specialtyProgress: 0 });
      expect(c.projects).toEqual({});
    }
  });
});
