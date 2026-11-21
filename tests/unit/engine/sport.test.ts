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

describe('sport depth: injuries, transfers, national team (E101)', () => {
  it('playing tired brings injuries that keep you out, and rest gets you back', () => {
    let state = checked(adult('sport-injury'), { type: 'chooseSport', sport: 'tennis' }).state;
    let injured = false;
    for (let m = 0; m < 24 && !injured; m++) {
      const s = playerOf(state).career.sport;
      if (s) s.readiness = 0;
      state = advanceMonths(state, 1);
      injured = (playerOf(state).career.sport?.injuredMonths ?? 0) > 0;
    }
    expect(injured).toBe(true);
    // Rested (full readiness), the injury heals within a few months.
    let healed = false;
    for (let m = 0; m < 6 && !healed; m++) {
      const s = playerOf(state).career.sport;
      if (s) s.readiness = 100;
      state = advanceMonths(state, 1);
      healed = (playerOf(state).career.sport?.injuredMonths ?? 0) === 0;
    }
    expect(healed).toBe(true);
  }, 120_000);

  it('a transfer bid moves you to the bidding club on a better contract', () => {
    let state = checked(adult('sport-transfer'), { type: 'chooseSport', sport: 'football' }).state;
    const s = playerOf(state).career.sport;
    if (!s) throw new Error('no sport');
    s.transferOffer = {
      club: 'Northport United',
      payPercent: 300,
      expiresTick: state.world.tick + 2,
    };
    state = checked(state, { type: 'answerTransfer', accept: true }).state;
    expect(playerOf(state).career.sport?.club).toBe('Northport United');
    const job = state.world.employment[playerOf(state).employmentId ?? ''];
    expect(job?.terms.employer).toBe('Northport United');
    expect(run(state, { type: 'answerTransfer', accept: true }).outcome.status).toBe('rejected');
    expect(checkLedger(state.world)).toEqual([]);
  }, 120_000);

  it('the fittest, in-form players are called up to the national team once a year', () => {
    let state = checked(adult('sport-national', 900), {
      type: 'chooseSport',
      sport: 'tennis',
    }).state;
    for (let m = 0; m < 13; m++) {
      const s = playerOf(state).career.sport;
      if (s) {
        s.form = 90;
        s.readiness = 100;
        s.injuredMonths = 0;
      }
      state = advanceMonths(state, 1);
    }
    expect(playerOf(state).career.sport?.caps ?? 0).toBeGreaterThan(0);
  }, 120_000);
});
