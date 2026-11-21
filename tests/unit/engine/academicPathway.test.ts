import { describe, expect, it } from 'vitest';
import { applicationEligibility } from '@engine/education/school';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

describe('course-locked education progression', () => {
  it('requires a diploma before bachelor and a same-course bachelor before master', () => {
    const state = newState({ seed: 'academic-pathway' });
    const player = playerOf(state);
    player.education.qualifications = ['upperSecondary'];
    expect(applicationEligibility(player, 'computing', 'diploma')).toBeNull();
    expect(applicationEligibility(player, 'computing', 'bachelor')).toBe('missingPrerequisite');
    expect(applicationEligibility(player, 'computing', 'master')).toBe('missingPrerequisite');

    player.education.qualifications.push('diploma:business');
    expect(applicationEligibility(player, 'computing', 'bachelor')).toBe('missingPrerequisite');
    player.education.qualifications.push('diploma:computing');
    expect(applicationEligibility(player, 'computing', 'bachelor')).toBeNull();
    player.education.qualifications.push('bachelor:computing');
    expect(applicationEligibility(player, 'computing', 'master')).toBeNull();
    expect(applicationEligibility(player, 'business', 'master')).toBe('missingPrerequisite');
    expect(applicationEligibility(player, 'computing', 'bachelor')).toBe('alreadyQualified');
  });

  it('never allows a direct bachelor application through the command handler', () => {
    const state = newState({ seed: 'academic-gates' });
    const c = playerOf(state);
    c.education.qualifications = ['upperSecondary'];
    expect(
      run(state, { type: 'applyStudy', programId: 'medicine', level: 'bachelor' }).outcome.status,
    ).toBe('rejected');
    expect(
      run(state, { type: 'applyStudy', programId: 'medicine', level: 'diploma' }).outcome.status,
    ).toBe('applied');
  });

  it('completes academic activities, limits them monthly and retains progress in the world', () => {
    let state = advanceMonths(newState({ seed: 'academic-activities' }), 1);
    const c = playerOf(state);
    c.birth.year -= 20;
    c.stats.energy = 1000;
    c.education.qualifications = ['upperSecondary'];
    c.education.current = {
      id: 'edu_academic_test',
      stage: 'tertiary',
      institution: 'Example University',
      kind: 'public',
      programId: 'computing',
      level: 'diploma',
      startTick: state.world.tick,
      yearsCompleted: 0,
      years: 2,
      grade: 600,
      scholarshipPercent: 0,
    };
    state = run(state, { type: 'academicAction', action: 'coursework' }).state;
    expect(playerOf(state).education.current?.academic?.coursework).toBeGreaterThan(300);
    expect(run(state, { type: 'academicAction', action: 'groupProject' }).outcome.status).toBe(
      'rejected',
    );
    expect(run(state, { type: 'academicAction', action: 'research' }).outcome.status).toBe(
      'rejected',
    );
  });
});
