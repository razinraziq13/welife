import { describe, expect, it } from 'vitest';
import { projectGame } from '@engine/view';
import { findWork, giveMoney } from '../../helpers/reconcile';
import { advanceMonths, newState, run } from '../../helpers/sim';

describe('moving from Johor Bahru to Singapore', () => {
  it('converts money, shows only local jobs at once, and family wealth adds everyone', () => {
    let state = findWork(
      advanceMonths(
        newState({ seed: 'repro-sg', countryCode: 'MY', easyMigration: true }),
        24 * 12,
      ),
    );
    state = giveMoney(state, 20_000_000n);
    state = run(state, {
      type: 'applyVisa',
      countryCode: 'SG',
      route: 'work',
      renounce: false,
    }).state;
    let moved = false;
    for (let i = 0; i < 12 && !moved; i++) {
      state = advanceMonths(state, 1);
      const res = run(state, { type: 'relocate', locationId: 'sg-central-area' });
      if (res.outcome.status === 'applied') {
        state = res.state;
        moved = true;
      }
    }
    expect(moved).toBe(true);
    const view = projectGame(state);
    expect(view.country.currency.code).toBe('SGD');
    expect(view.work.postings.length).toBeGreaterThan(0);
    for (const p of Object.values(state.world.jobs.postings))
      expect(p.terms.locationId).toBe('sg-central-area');
    expect(view.legacy.familyWealth.minor).toBeGreaterThanOrEqual(
      view.finance.personal?.netWorth ?? 0n,
    );
    expect(view.legacy.familyWealth.people).toBeGreaterThan(1);
  }, 120_000);
});
