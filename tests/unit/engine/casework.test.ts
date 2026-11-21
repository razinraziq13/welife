import { describe, expect, it } from 'vitest';
import { endEmployment, jobEligibility, makeTerms, startEmployment } from '@engine/career/jobs';
import { getOccupation } from '@engine/career/occupations';
import { trainingRequired } from '@engine/career/casework';
import { checkLedger } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** An adult (no job) with the given qualifications and strong core skills, in Malaysia. */
function adult(seed: string, qualifications: string[]): SimState {
  const state = giveMoney(
    advanceMonths(newState({ seed, countryCode: 'MY', scenario: 'wealthy' }), 24 * 12),
    50_000_000n,
  );
  const p = playerOf(state);
  if (p.employmentId) endEmployment(state.world, p, 'quit');
  p.education.current = null;
  p.education.qualifications = ['upperSecondary', ...qualifications];
  for (const k of ['reading', 'logic', 'socializing', 'science', 'care'] as const)
    p.skills[k] = 700;
  p.stats.energy = 1000;
  return state;
}
/** Puts the player straight into a role (as if hired), bypassing the job board. */
function hire(state: SimState, occupationId: string): SimState {
  const p = playerOf(state);
  const terms = makeTerms(state.world, getOccupation(occupationId), 0, 'permanent', p.locationId);
  startEmployment(state.world, p, terms, terms.salaryMinMinor);
  return state;
}
const cases = (s: SimState) => projectGame(s).work.career.casework;
const terms = (s: SimState, id: string) =>
  makeTerms(s.world, getOccupation(id), 0, 'permanent', playerOf(s).locationId);

describe('lawyer: degree, admission and casework (E93)', () => {
  it('a law diploma gives paralegal work but never practice', () => {
    const state = hire(adult('law-diploma', ['diploma:law']), 'paralegal');
    expect(jobEligibility(state.world, playerOf(state), terms(state, 'lawyer'))).toBe(
      'notQualified',
    );
    const view = cases(advanceMonths(state, 1));
    expect(view?.block).toMatch(/law degree and admission/);
    expect(view?.cases).toHaveLength(0);
  }, 120_000);

  it('a law degree without admission cannot be hired as a lawyer', () => {
    const state = adult('law-degree', ['bachelor:law']);
    expect(jobEligibility(state.world, playerOf(state), terms(state, 'lawyer'))).toBe(
      'notLicensed',
    );
    expect(jobEligibility(state.world, playerOf(state), terms(state, 'trainee-lawyer'))).toBeNull();
  }, 120_000);

  it('a trainee qualifies through supervised months and the exam, then practises', () => {
    let state = hire(adult('law-trainee', ['bachelor:law']), 'trainee-lawyer');
    expect(run(state, { type: 'takeLicenceExam', profession: 'law' }).outcome.status).toBe(
      'rejected',
    );
    state = advanceMonths(state, trainingRequired('law', 'MY'));
    for (let i = 0; i < 6 && playerOf(state).flags['licence.law'] !== true; i++) {
      state = run(state, { type: 'takeLicenceExam', profession: 'law' }).state;
      if (playerOf(state).flags['licence.law'] !== true) state = advanceMonths(state, 6);
    }
    expect(playerOf(state).flags['licence.law']).toBe(true);
    expect(jobEligibility(state.world, playerOf(state), terms(state, 'lawyer'))).toBeNull();
    expect(checkLedger(state.world)).toEqual([]);
  }, 180_000);

  it('a licensed lawyer takes a case, works it month by month and resolves it', () => {
    let state = adult('law-practice', ['bachelor:law']);
    playerOf(state).flags['licence.law'] = true;
    state = advanceMonths(hire(state, 'lawyer'), 1);
    const offer = cases(state)?.cases.find((k) => k.status === 'offer' && k.takeReason === null);
    if (!offer) throw new Error('no case offer');
    // The hidden truth of each item is not in the view.
    expect(Object.keys(offer.items[0] ?? {})).toEqual(['label', 'status']);
    state = run(state, { type: 'takeCase', caseId: offer.id }).state;
    for (const action of ['examine', 'clarify', 'prepare'] as const)
      expect(run(state, { type: 'workOnCase', caseId: offer.id, action }).outcome.status).toBe(
        'applied',
      );
    state = run(state, { type: 'workOnCase', caseId: offer.id, action: 'examine' }).state;
    state = run(state, { type: 'workOnCase', caseId: offer.id, action: 'prepare' }).state;
    expect(
      run(state, { type: 'workOnCase', caseId: offer.id, action: 'prepare' }).outcome.status,
    ).toBe('rejected');
    const resolved = run(state, { type: 'resolveCase', caseId: offer.id, optionId: 'settle' });
    expect(resolved.outcome.status).toBe('applied');
    expect(cases(resolved.state)?.record[0]?.title).toBe(offer.title);
  }, 120_000);

  it('a serious unspent conviction suspends practice', () => {
    const state = adult('law-suspended', ['bachelor:law']);
    playerOf(state).flags['licence.law'] = true;
    hire(state, 'lawyer');
    expect(cases(state)?.block).toBeNull();
    // Only the fields the suspension rule reads: a fraud conviction that is not yet spent.
    state.world.civics.cases.case_x = {
      characterId: playerOf(state).id,
      convicted: true,
      spentTick: null,
      kind: 'fraud',
      outcome: 'fine',
    } as never;
    expect(cases(state)?.block).toMatch(/suspended/);
    expect(jobEligibility(state.world, playerOf(state), terms(state, 'lawyer'))).toBe(
      'notLicensed',
    );
  }, 120_000);
});

describe('journalist: diploma or degree, verification and integrity (E93)', () => {
  it('a relevant diploma or degree qualifies; an unrelated one does not', () => {
    for (const q of ['diploma:media', 'bachelor:media'])
      expect(
        jobEligibility(
          adult(`media-${q}`, [q]).world,
          playerOf(adult(`media-${q}`, [q])),
          terms(adult(`media-${q}`, [q]), 'journalist'),
        ),
      ).not.toBe('notQualified');
    const other = adult('media-other', ['diploma:business']);
    expect(jobEligibility(other.world, playerOf(other), terms(other, 'journalist'))).toBe(
      'notQualified',
    );
  }, 180_000);

  it('publishing with unverified claims brings a correction and costs integrity', () => {
    let state = advanceMonths(hire(adult('media-story', ['diploma:media']), 'journalist'), 1);
    const story = cases(state)?.cases.find((k) => k.status === 'offer' && k.takeReason === null);
    if (!story) throw new Error('no story');
    state = run(state, { type: 'takeCase', caseId: story.id }).state;
    const before = cases(state)?.integrity ?? 0;
    state = run(state, { type: 'resolveCase', caseId: story.id, optionId: 'brief' }).state;
    expect(cases(state)?.record[0]?.unverified).toBe(true);
    expect(cases(state)?.integrity).toBeLessThan(before);
    expect(state.world.notifications.at(-1)?.messageKey).toBe('ntf.storyCorrection');
  }, 120_000);

  it('a video editor sees why professional reporting is not open to them', () => {
    const state = advanceMonths(hire(adult('media-support', ['diploma:media']), 'video-editor'), 1);
    expect(cases(state)?.block).toMatch(/relevant diploma or degree/);
  }, 120_000);
});

describe('doctor: medical degree, registration and patient cases (E95)', () => {
  it('a nursing or health diploma never makes you a doctor', () => {
    const nurse = hire(adult('med-nurse', ['bachelor:nursing']), 'nurse');
    expect(jobEligibility(nurse.world, playerOf(nurse), terms(nurse, 'doctor'))).toBe(
      'notQualified',
    );
    expect(cases(advanceMonths(nurse, 1))?.block).toMatch(/medical degree and registration/);
  }, 120_000);

  it('a medical degree without registration cannot be hired as a doctor', () => {
    const state = adult('med-degree', ['bachelor:medicine']);
    expect(jobEligibility(state.world, playerOf(state), terms(state, 'doctor'))).toBe(
      'notLicensed',
    );
    expect(
      jobEligibility(state.world, playerOf(state), terms(state, 'resident-doctor')),
    ).toBeNull();
  }, 120_000);

  it('a resident only takes routine patients until registered', () => {
    const state = advanceMonths(
      hire(adult('med-resident', ['bachelor:medicine']), 'resident-doctor'),
      3,
    );
    const view = cases(state);
    expect(view?.supervised).toBe(true);
    for (const k of view?.cases ?? [])
      if (!k.routine && k.status === 'offer') expect(k.takeReason).toMatch(/routine/);
    expect(view?.exam?.trainingNeeded).toBe(trainingRequired('medicine', 'MY'));
  }, 120_000);

  it('a registered doctor sees a patient case through to follow-up care', () => {
    let state = adult('med-practice', ['bachelor:medicine']);
    playerOf(state).flags['licence.medicine'] = true;
    state = advanceMonths(hire(state, 'doctor'), 1);
    const patient = cases(state)?.cases.find((k) => k.status === 'offer' && k.takeReason === null);
    if (!patient) throw new Error('no patient');
    state = run(state, { type: 'takeCase', caseId: patient.id }).state;
    state = run(state, { type: 'workOnCase', caseId: patient.id, action: 'examine' }).state;
    const r = run(state, { type: 'resolveCase', caseId: patient.id, optionId: 'followUp' });
    expect(r.outcome.status).toBe('applied');
    expect(cases(r.state)?.record[0]?.profession).toBe('medicine');
    expect(checkLedger(r.state.world)).toEqual([]);
  }, 120_000);
});

describe('professions start from Career, Paths (not the job board)', () => {
  it('law starts as a trainee until admitted, then as a lawyer; no degree, no start', () => {
    const none = adult('path-none', []);
    expect(run(none, { type: 'startProfessionPath', path: 'law' }).outcome.status).toBe('rejected');
    let state = adult('path-law', ['bachelor:law']);
    state = run(state, { type: 'startProfessionPath', path: 'law' }).state;
    const job = () => state.world.employment[playerOf(state).employmentId ?? ''];
    expect(job()?.terms.occupationId).toBe('trainee-lawyer');
    playerOf(state).flags['licence.law'] = true;
    state = run(state, { type: 'startProfessionPath', path: 'law' }).state;
    expect(job()?.terms.occupationId).toBe('lawyer');
  }, 120_000);

  it('the board never posts these roles, and posts several senior roles a month', () => {
    let state = adult('path-board', ['bachelor:law']);
    const banned = [
      'trainee-lawyer',
      'lawyer',
      'corporate-lawyer',
      'law-firm-partner',
      'journalist',
      'resident-doctor',
      'doctor',
    ];
    for (let m = 0; m < 4; m++) {
      state = advanceMonths(state, 1);
      const postings = Object.values(state.world.jobs.postings);
      for (const p of postings) expect(banned).not.toContain(p.terms.occupationId);
      expect(
        postings.filter((p) => p.id.startsWith('job_senior_') && p.postedTick === state.world.tick)
          .length,
      ).toBe(3);
    }
  }, 120_000);
});

describe('the view never changes the game', () => {
  it('projecting the game leaves the world (including its random state) untouched', () => {
    const state = adult('view-pure', ['bachelor:law', 'diploma:media', 'bachelor:medicine']);
    const before = JSON.stringify(state.world, (_k, v: unknown) =>
      typeof v === 'bigint' ? String(v) : v,
    );
    projectGame(state);
    projectGame(state);
    const after = JSON.stringify(state.world, (_k, v: unknown) =>
      typeof v === 'bigint' ? String(v) : v,
    );
    expect(after).toBe(before);
  }, 120_000);
});
