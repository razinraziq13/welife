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
