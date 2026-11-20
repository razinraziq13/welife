import { describe, expect, it } from 'vitest';
import { projectGame } from '@engine/view';
import { checked, findWork } from '../../helpers/reconcile';
import { advanceMonths, newState, playerOf } from '../../helpers/sim';

describe('Money this month: debt repaid', () => {
  it('shows the principal repaid on a loan (payment minus interest)', () => {
    let state = findWork(
      advanceMonths(newState({ seed: 'month-money', scenario: 'wealthy' }), 23 * 12),
    );
    const world = structuredClone(state.world);
    const me = world.characters[world.activeCharacterId];
    if (me?.finance) me.finance.creditScore = 900;
    state = { world, pending: null };
    const took = checked(state, { type: 'takeLoan', amountMinor: '100000', termMonths: 24 });
    expect(took.outcome).toMatchObject({ status: 'applied' });
    state = took.state;
    state = advanceMonths(state, 2);
    const loan = Object.values(state.world.ledger.accounts).find(
      (a) => a.ownerId === playerOf(state).id && a.type === 'loan',
    );
    if (!loan?.loan) throw new Error('no loan');
    const month = projectGame(state).finance.month;
    const repaid = month.repaid.find((r) => r.product === loan.loan?.product)?.amount ?? 0n;
    const interest = Object.values(state.world.ledger.journal[String(state.world.tick)] ?? [])
      .filter((t) => t.kind === 'tx.loanInterest')
      .flatMap((t) => t.entries)
      .filter((e) => e.accountId === loan.id)
      .reduce((s, e) => s + e.credit, 0n);
    expect(repaid).toBeGreaterThan(0n);
    expect(repaid + interest).toBe(loan.loan.paymentMinor);
  }, 60_000);
});
