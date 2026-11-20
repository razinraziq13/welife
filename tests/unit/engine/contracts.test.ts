import { describe, expect, it } from 'vitest';
import { minimumCapital } from '@engine/business/business';
import { getBusinessType } from '@engine/business/catalog';
import { checkLedger } from '@engine/economy/ledger';
import type { Business } from '@engine/state/schema';
import type { SimState } from '@engine/core/commands';
import { checked, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf, run } from '../../helpers/sim';

/** A wealthy adult who owns a consultancy (a project firm) with a few staff. */
function consultancy(seed: string): SimState {
  let state = advanceMonths(newState({ seed, countryCode: 'MY', scenario: 'wealthy' }), 24 * 12);
  const locationId = playerOf(state).locationId;
  const capital = minimumCapital(state.world, getBusinessType('consultancy'), locationId) * 3n;
  state = giveMoney(state, capital * 2n);
  state = checked(state, {
    type: 'startBusiness',
    typeId: 'consultancy',
    locationId,
    name: 'Bright Path Advisers',
    capitalMinor: capital.toString(),
  }).state;
  const business = Object.values(state.world.businesses)[0];
  const branch = business?.branches[0];
  if (branch) branch.staff = 6;
  return state;
}
const firm = (s: SimState): Business => {
  const b = Object.values(s.world.businesses)[0];
  if (!b) throw new Error('no business');
  return b;
};

describe('client contracts for project firms (E91)', () => {
  it('signing pays an advance and ties up staff; delivery pays the rest once', () => {
    let state = advanceMonths(consultancy('contracts-deliver'), 1);
    const offer = firm(state).contracts?.offers[0];
    if (!offer) throw new Error('no brief');
    state = checked(state, {
      type: 'answerClient',
      businessId: firm(state).id,
      offerId: offer.id,
      accept: true,
      scope: 'lean',
    }).state;
    const job = firm(state).contracts?.active[0];
    expect(job?.paidMinor).toBe((offer.feeMinor * 30n + 50n) / 100n);
    for (let i = 0; i < 8 && firm(state).contracts?.active.some((j) => j.id === offer.id); i++)
      state = advanceMonths(state, 1);
    const c = firm(state).contracts;
    expect(c?.delivered).toBeGreaterThanOrEqual(1);
    const payments = Object.values(state.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.clientPayment' && t.params.client === offer.client);
    expect(payments.length).toBeLessThanOrEqual(1);
    expect(checkLedger(state.world)).toEqual([]);
  }, 120_000);

  it('refuses work needing more free staff than you have', () => {
    const state = advanceMonths(consultancy('contracts-staff'), 1);
    const b = firm(state);
    const branch = b.branches[0];
    const offer = b.contracts?.offers[0];
    if (!branch || !offer) throw new Error('no brief');
    branch.staff = offer.team - 1;
    expect(
      run(state, {
        type: 'answerClient',
        businessId: b.id,
        offerId: offer.id,
        accept: true,
        scope: 'lean',
      }).outcome.status,
    ).toBe('rejected');
  }, 120_000);

  it('work three months late is cancelled, with no final payment', () => {
    let state = advanceMonths(consultancy('contracts-late'), 1);
    const b = firm(state);
    const offer = b.contracts?.offers[0];
    if (!offer) throw new Error('no brief');
    state = checked(state, {
      type: 'answerClient',
      businessId: b.id,
      offerId: offer.id,
      accept: true,
      scope: 'thorough',
    }).state;
    const job = firm(state).contracts?.active[0];
    if (!job) throw new Error('no job');
    job.workLeft = 100;
    job.deadlineTick = state.world.tick;
    state = advanceMonths(state, 3);
    expect(firm(state).contracts?.cancelled).toBe(1);
    expect(firm(state).contracts?.active.some((j) => j.id === job.id)).toBe(false);
    expect(checkLedger(state.world)).toEqual([]);
  }, 120_000);
});

describe('market research (E92)', () => {
  it('a paid survey gives demand ranges that fall as the price rises, once a month', () => {
    const state = advanceMonths(consultancy('research-survey'), 1);
    const b = firm(state);
    const cashBefore = state.world.ledger.accounts[b.cashAccountId]?.balance ?? 0n;
    const done = checked(state, { type: 'researchMarket', businessId: b.id }).state;
    const r = firm(done).research;
    if (!r) throw new Error('no research');
    expect(r.demand[0]).toBeLessThanOrEqual(r.demand[1]);
    expect(r.cheaper[1]).toBeGreaterThanOrEqual(r.dearer[1]);
    expect(done.world.ledger.accounts[b.cashAccountId]?.balance).toBeLessThan(cashBefore);
    expect(run(done, { type: 'researchMarket', businessId: b.id }).outcome.status).toBe('rejected');
    expect(checkLedger(done.world)).toEqual([]);
  }, 120_000);
});
