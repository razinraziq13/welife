import { describe, expect, it } from 'vitest';
import { checkLedger } from '@engine/economy/ledger';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

function adult(seed: string, fitness = 800): SimState {
  const state = giveMoney(
    advanceMonths(newState({ seed, scenario: 'wealthy' }), 20 * 12),
    1_000_000n,
  );
  const p = playerOf(state);
  p.skills.fitness = fitness;
  p.stats.energy = 1000;
  return state;
}
const sport = (s: SimState) => projectGame(s).work.career.sport.state;

describe('athlete career (E98)', () => {
  it('is closed to under-16s, with the reason', () => {
    const child = newState({ seed: 'sport-child' });
    expect(projectGame(child).work.career.sport.choose[0]?.reason).toMatch(/16/);
    expect(run(child, { type: 'chooseSport', sport: 'football' }).outcome.status).toBe('rejected');
  });

  it('a footballer trials into a club, plays a full season and is on the record', () => {
    let state = checked(adult('sport-football'), { type: 'chooseSport', sport: 'football' }).state;
    for (let i = 0; i < 8 && !sport(state)?.club; i++) {
      if (!sport(state)?.trialReason) state = checked(state, { type: 'sportTrial' }).state;
      if (!sport(state)?.club) state = advanceMonths(state, 3);
    }
    expect(sport(state)?.club).not.toBeNull();
    const job = playerOf(state).employmentId
      ? state.world.employment[playerOf(state).employmentId ?? '']
      : undefined;
    expect(job?.terms.occupationId).toBe('professional-athlete');
    for (let m = 0; m < 9; m++) {
      state = advanceMonths(state, 1);
      playerOf(state).stats.energy = 1000;
    }
    const s = sport(state);
    expect(s?.record.at(-1)?.sport).toBe('football');
    // A league table's points always reconcile with results.
    for (const t of s?.table ?? []) expect(t.points).toBe(t.won * 3 + t.drawn);
    expect(checkLedger(state.world)).toEqual([]);
  }, 180_000);

  it('basketball has no draws; tennis pays prize money and moves the ranking', () => {
    let state = checked(adult('sport-basket'), { type: 'chooseSport', sport: 'basketball' }).state;
    const bball = playerOf(state).career.sport;
    if (bball) bball.club = 'Harbour Hawks';
    state = advanceMonths(state, 2);
    for (const t of sport(state)?.table ?? []) expect(t.drawn).toBe(0);
    let tennis = checked(adult('sport-tennis'), { type: 'chooseSport', sport: 'tennis' }).state;
    expect(run(tennis, { type: 'sportTrial' }).outcome.status).toBe('rejected');
    tennis = advanceMonths(tennis, 6);
    expect(sport(tennis)?.rankingPoints).toBeGreaterThan(0);
    const prizes = Object.values(tennis.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.prizeMoney');
    expect(prizes.length).toBeGreaterThan(0);
    expect(checkLedger(tennis.world)).toEqual([]);
  }, 180_000);

  it('athlete jobs never appear on the job board', () => {
    let state = adult('sport-board');
    for (let m = 0; m < 6; m++) {
      state = advanceMonths(state, 1);
      for (const p of Object.values(state.world.jobs.postings))
        expect(p.terms.occupationId).not.toBe('professional-athlete');
    }
  }, 120_000);
});
