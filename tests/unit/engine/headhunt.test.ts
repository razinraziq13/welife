import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { HEADHUNT_COOLDOWN, headhuntChance } from '@engine/career/jobs';
import type { JobApplication } from '@engine/state/schema';
import type { CommandOutcome, SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { findWork } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** An employed adult whom rivals would want: strong reputation, a specialism, good work. */
function starWorker(seed: string): SimState {
  let state = advanceMonths(newState({ seed, scenario: 'wealthy' }), 22 * 12);
  state = findWork(state);
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  const job = player?.employmentId ? world.employment[player.employmentId] : undefined;
  if (!player || !job) throw new Error('no job');
  job.terms = { ...job.terms, contract: 'permanent' };
  job.startTick = Math.max(0, world.tick - 24);
  job.performance = 850;
  player.career.reputation = 1000;
  player.career.specialty = 'Specialist';
  return { world, pending: null };
}

/** The message key of an outcome (applied or rejected). */
function keyOf(o: CommandOutcome): string | undefined {
  return 'key' in o ? o.key : undefined;
}

function rivalOffer(state: SimState): JobApplication | undefined {
  return Object.values(state.world.jobs.applications).find(
    (a) => a.headhunted === true && a.status === 'offered',
  );
}

/** Advances month by month (keeping the worker a star) until a rival approaches. */
function untilApproached(start: SimState, limit = 60): SimState {
  let state = start;
  for (let i = 0; i < limit; i++) {
    state = advanceMonths(state, 1);
    if (rivalOffer(state)) return state;
    const world = structuredClone(state.world);
    const player = world.characters[world.activeCharacterId];
    const job = player?.employmentId ? world.employment[player.employmentId] : undefined;
    if (!player || !job) throw new Error('lost the job');
    job.performance = 850;
    player.career.reputation = 1000;
    state = { world, pending: null };
  }
  throw new Error('no rival approached');
}

function salary(state: SimState): bigint {
  const p = playerOf(state);
  const e = p.employmentId ? state.world.employment[p.employmentId] : undefined;
  if (!e) throw new Error('no job');
  return e.salaryMinor;
}

describe('rival job offers (headhunting)', () => {
  it('no approach for new starters, interns or weak performers', () => {
    const star = starWorker('hh-elig');
    const p = playerOf(star);
    const job = star.world.employment[p.employmentId ?? ''];
    if (!job) throw new Error('no job');
    expect(headhuntChance(star.world, p, job)).toBe(8);
    expect(headhuntChance(star.world, p, { ...job, startTick: star.world.tick - 2 })).toBe(0);
    expect(
      headhuntChance(star.world, p, { ...job, terms: { ...job.terms, contract: 'internship' } }),
    ).toBe(0);
    expect(headhuntChance(star.world, p, { ...job, performance: 300 })).toBe(0);
  });

  it('a rival offers more money, and accepting moves you there', () => {
    const state = untilApproached(starWorker('hh-accept'));
    const offer = rivalOffer(state);
    if (!offer?.offerSalaryMinor) throw new Error('no offer');
    const p = playerOf(state);
    const job = state.world.employment[p.employmentId ?? ''];
    expect(offer.terms.employer).not.toBe(job?.terms.employer);
    expect(offer.offerSalaryMinor).toBeGreaterThan(salary(state));
    expect(state.world.notifications.some((n) => n.messageKey === 'ntf.headhunted')).toBe(true);
    const view = projectGame(state).work.applications.find((a) => a.id === offer.id);
    expect(view?.headhunted).toBe(true);
    expect(view?.counterChance).toBeGreaterThanOrEqual(10);

    const hired = run(state, { type: 'respondOffer', applicationId: offer.id, response: 'accept' });
    expect(keyOf(hired.outcome)).toBe('out.offer.hired');
    const after = playerOf(hired.state);
    const newJob = hired.state.world.employment[after.employmentId ?? ''];
    expect(newJob?.terms.employer).toBe(offer.terms.employer);
    expect(newJob?.salaryMinor).toBe(offer.offerSalaryMinor);
    expect(checkInvariants(hired.state.world)).toEqual([]);
  });

  it('asking your employer to match: a raise, or the offer stays open (once)', () => {
    const state = untilApproached(starWorker('hh-counter'));
    const offer = rivalOffer(state);
    if (!offer?.offerSalaryMinor) throw new Error('no offer');
    const before = salary(state);
    const res = run(state, { type: 'respondOffer', applicationId: offer.id, response: 'counter' });
    const app = res.state.world.jobs.applications[offer.id];
    if (keyOf(res.outcome) === 'out.offer.matched') {
      expect(salary(res.state)).toBe(offer.offerSalaryMinor);
      expect(app?.status).toBe('declined');
    } else {
      expect(keyOf(res.outcome)).toBe('out.offer.notMatched');
      expect(salary(res.state)).toBe(before);
      expect(app?.status).toBe('offered');
      const again = run(res.state, {
        type: 'respondOffer',
        applicationId: offer.id,
        response: 'counter',
      });
      expect(again.outcome.status).toBe('rejected');
      expect(keyOf(again.outcome)).toBe('err.JobError.alreadyCountered');
    }
    // The same answer every time from the same state.
    const replay = run(state, {
      type: 'respondOffer',
      applicationId: offer.id,
      response: 'counter',
    });
    expect(keyOf(replay.outcome)).toBe(keyOf(res.outcome));
    expect(checkInvariants(res.state.world)).toEqual([]);
  });

  it('only one approach at a time, with a cooldown afterwards', () => {
    const state = untilApproached(starWorker('hh-cool'));
    const p = playerOf(state);
    const job = state.world.employment[p.employmentId ?? ''];
    if (!job) throw new Error('no job');
    expect(headhuntChance(state.world, p, job)).toBe(0);
    const offer = rivalOffer(state);
    const declined = run(state, {
      type: 'respondOffer',
      applicationId: offer?.id ?? '',
      response: 'decline',
    }).state;
    const dp = playerOf(declined);
    const djob = declined.world.employment[dp.employmentId ?? ''];
    if (!djob) throw new Error('no job');
    expect(headhuntChance(declined.world, dp, djob)).toBe(0);
    const later = structuredClone(declined.world);
    later.tick += HEADHUNT_COOLDOWN;
    const lp = later.characters[later.activeCharacterId];
    const ljob = later.employment[lp?.employmentId ?? ''];
    if (!lp || !ljob) throw new Error('no job');
    expect(headhuntChance(later, lp, ljob)).toBeGreaterThan(0);
  });

  it('an offer you applied for cannot be used to ask for a match', () => {
    const state = untilApproached(starWorker('hh-applied'));
    const world = structuredClone(state.world);
    const offer = Object.values(world.jobs.applications).find(
      (a) => a.headhunted === true && a.status === 'offered',
    );
    if (!offer) throw new Error('no offer');
    offer.headhunted = false;
    const res = run(
      { world, pending: null },
      { type: 'respondOffer', applicationId: offer.id, response: 'counter' },
    );
    expect(res.outcome.status).toBe('rejected');
    expect(keyOf(res.outcome)).toBe('err.JobError.notHeadhunted');
  });
});
