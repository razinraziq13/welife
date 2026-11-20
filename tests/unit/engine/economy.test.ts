import { describe, expect, it } from 'vitest';
import { ageOf } from '@engine/core/clock';
import { checkInvariants } from '@engine/core/invariants';
import { WorldSchema, type World } from '@engine/state/schema';
import { INDUSTRIES, OCCUPATIONS, getOccupation, jobTitle } from '@engine/career/occupations';
import { endEmployment } from '@engine/career/jobs';
import { checkLedger, monthTotals, netWorthOf, openAccount, post } from '@engine/economy/ledger';
import {
  ensurePlayerAccounts,
  loanPayments,
  payExpense,
  payMedicalCost,
  processFinances,
  receiveIncome,
  repayLoan,
  startStudentLoan,
} from '@engine/economy/finance';
import { convertCurrency, localAccount } from '@engine/economy/fx';
import { projectGame } from '@engine/view';
import { medianWage } from '@engine/economy/economy';
import {
  upgradeWorldV1,
  upgradeWorldV2,
  upgradeWorldV3,
  upgradeWorldV4,
} from '@engine/state/upgrade';
import { execute, type SimState } from '@engine/core/commands';
import { canonicalJson } from '@engine/core/data';
import fixture from '../../fixtures/world-v1.json';
import type { run } from '../../helpers/sim';
import { advanceMonths, cid, newState, playerOf } from '../../helpers/sim';

describe('finance regressions', () => {
  function withChecking() {
    const state = newState();
    const player = playerOf(state);
    player.birth.year -= 20;
    ensurePlayerAccounts(state.world, player);
    const checkingId = player.finance?.checkingId;
    if (!checkingId) throw new Error('Expected a checking account');
    return { state, world: state.world, player, checkingId };
  }

  it('values foreign mortgage obligations in home currency and accepts payment in loan currency', () => {
    const { state, world, player, checkingId } = withChecking();
    const loanId = openAccount(world, player.id, 'loan', 'USD', {
      loan: {
        product: 'mortgage',
        rateBp: 0,
        termMonths: 12,
        paymentMinor: 100n,
        principalMinor: 1_000n,
        firstPaymentTick: world.tick + 1,
        missedPayments: 0,
      },
    });
    const foreignId = localAccount(world, player.id, 'USD');
    post(world, 'test.mortgage', [
      { accountId: foreignId, debit: 1_000n },
      { accountId: loanId, credit: 1_000n },
    ]);
    // Use the proceeds so the repayment must exchange from the home account.
    payExpense(
      world,
      { ownerId: player.id, checkingId: foreignId, savingsId: null },
      'test',
      1_000n,
      'test.purchase',
    );
    const obligation = convertCurrency(world, 100n, 'USD', 'MYR');
    expect(loanPayments(world, player)).toBe(obligation);
    const finance = projectGame(state).finance;
    expect(finance.loans[0]?.currency.code).toBe('USD');
    expect(finance.personal?.liabilities).toBe(convertCurrency(world, 1_000n, 'USD', 'MYR'));
    expect(finance.month.totalExpenses).toBe(convertCurrency(world, 1_000n, 'USD', 'MYR'));
    expect(() => {
      repayLoan(world, player, loanId, 100n);
    }).toThrow('There is not enough money');
    receiveIncome(world, player.id, checkingId, 'test', obligation * 2n, 'test.income');
    repayLoan(world, player, loanId, 100n);
    expect(world.ledger.accounts[loanId]?.balance).toBe(900n);
    expect(checkLedger(world)).toEqual([]);
  });

  it('keeps an undrawn student loan open while enrolled on a full scholarship', () => {
    const { world, player } = withChecking();
    player.education.current = {
      id: 'test-enrollment',
      stage: 'tertiary',
      institution: 'Test university',
      kind: 'public',
      programId: null,
      level: 'bachelor',
      startTick: world.tick,
      yearsCompleted: 0,
      years: 3,
      grade: 500,
      scholarshipPercent: 100,
    };
    const loanId = startStudentLoan(world, player);
    processFinances(world, new Map());
    expect(world.ledger.accounts[loanId]).toMatchObject({ balance: 0n, closedTick: null });
    player.education.current.scholarshipPercent = 0;
    world.tick += 1;
    processFinances(world, new Map());
    expect(world.ledger.accounts[loanId]?.balance).toBeGreaterThan(0n);
  });

  it('settles foreign arrears from home checking when funds become available', () => {
    const { world, player, checkingId } = withChecking();
    const foreignId = localAccount(world, player.id, 'USD');
    payExpense(
      world,
      { ownerId: player.id, checkingId: foreignId, savingsId: null },
      'propertyUpkeep',
      100n,
      'tx.propertyUpkeep',
    );
    const arrears = Object.values(world.ledger.accounts).find(
      (a) => a.ownerId === player.id && a.type === 'arrears',
    );
    expect(arrears?.balance).toBe(100n);
    receiveIncome(world, player.id, checkingId, 'test', 100_000n, 'test.income');
    processFinances(world, new Map());
    expect(arrears?.balance).toBe(0n);
    expect(checkLedger(world)).toEqual([]);
  });
});

describe('occupation catalogue (decision D8)', () => {
  it('has at least 150 advertised occupations across 25 industries', () => {
    const advertised = OCCUPATIONS.filter((o) => !o.hidden);
    expect(advertised.length).toBeGreaterThanOrEqual(150);
    expect(INDUSTRIES).toHaveLength(25);
    for (const industry of INDUSTRIES) {
      expect(advertised.filter((o) => o.industryId === industry.id).length).toBeGreaterThanOrEqual(
        5,
      );
    }
    expect(new Set(OCCUPATIONS.map((o) => o.id)).size).toBe(OCCUPATIONS.length);
  });

  it('builds sensible titles by seniority', () => {
    expect(jobTitle(getOccupation('ux-designer'), 0)).toBe('Junior UX designer');
    expect(jobTitle(getOccupation('nurse'), 2)).toBe('Senior nurse');
    expect(jobTitle(getOccupation('cashier'), 0)).toBe('Cashier');
  });
});

/** Owners whose books the player sees: themselves and any household they run. */
function owners(world: World): string[] {
  const player = world.activeCharacterId;
  return [
    player,
    ...Object.values(world.households)
      .filter((h) => h.finance?.headId === player)
      .map((h) => h.id),
  ];
}

function netWorth(world: World, ids: string[]): bigint {
  return ids.reduce((sum, id) => sum + netWorthOf(world, id), 0n);
}

function net(world: World, ids: string[], tick = world.tick): bigint {
  return ids.reduce((sum, id) => {
    const t = monthTotals(world, id, tick);
    return sum + t.income - t.expenses;
  }, 0n);
}

/** Every change in net worth is explained by booked income and expenses (spec §4 Finance). */
function step(state: SimState, body: Parameters<typeof run>[1]): SimState {
  const before = state.world;
  const result = execute(state, { ...body, id: cid(body.type) });
  const after = result.state.pending ?? result.state.world;
  const ids = [...new Set([...owners(before), ...owners(after)])];
  const change = netWorth(after, ids) - netWorth(before, ids);
  const booked = after.tick === before.tick ? net(after, ids) - net(before, ids) : net(after, ids);
  expect(change).toBe(booked);
  expect(checkLedger(after)).toEqual([]);
  return result.state;
}

function settleChecked(state: SimState, prefer?: (id: string) => string | null): SimState {
  let current = state;
  while (current.pending) {
    const instanceId = current.pending.events.pendingInstanceId ?? '';
    const def = current.pending.events.instances[instanceId]?.definitionId ?? '';
    const before = current.world;
    const choice = prefer?.(def) ?? null;
    const result = execute(current, {
      type: 'choose',
      id: cid('choose'),
      instanceId,
      choiceId: choice ?? firstChoice(def),
    });
    // The last choice of the month commits it: compare with the month-start world. (If
    // another decision is due the same month, nothing is committed yet.)
    if (!result.state.pending) {
      const ids = [...new Set([...owners(before), ...owners(result.state.world)])];
      const change = netWorth(result.state.world, ids) - netWorth(before, ids);
      expect(change).toBe(net(result.state.world, ids));
    }
    current = result.state;
  }
  return current;
}

import { getEvent } from '@engine/content';
function firstChoice(definitionId: string): string {
  return getEvent(definitionId).choices[0]?.id ?? '';
}

function monthChecked(state: SimState, prefer?: (id: string) => string | null): SimState {
  if (state.world.lifeStatus !== 'alive') return state;
  return settleChecked(step(state, { type: 'advance', expectedTick: state.world.tick }), prefer);
}

/** Applies for every job the player qualifies for until hired (bounded). */
function findWork(state: SimState, months = 30): SimState {
  let current = state;
  for (let m = 0; m < months && !playerOf(current).employmentId; m++) {
    for (const app of Object.values(current.world.jobs.applications)) {
      if (app.characterId === playerOf(current).id && app.status === 'offered') {
        current = step(current, {
          type: 'respondOffer',
          applicationId: app.id,
          response: 'accept',
        });
      }
    }
    if (playerOf(current).employmentId) break;
    for (const posting of Object.values(current.world.jobs.postings)) {
      const res = execute(current, { type: 'applyJob', id: cid('apply'), postingId: posting.id });
      if (res.outcome.status === 'applied') current = res.state;
    }
    current = monthChecked(current, (id) => (id === 'job-interview' ? 'confident' : null));
  }
  return current;
}

describe('careers and the household economy reconcile (M4 exit)', () => {
  it('an adult life with jobs, a move, a loan, insurance, a layoff and a new job always reconciles', () => {
    let state = advanceMonths(newState({ seed: 'reconcile', countryCode: 'GB' }), 18 * 12 + 2);
    expect(ageOf(playerOf(state).birth, state.world.clock).years).toBeGreaterThanOrEqual(18);
    if (playerOf(state).education.current) state = step(state, { type: 'leaveSchool' });
    state = findWork(state);
    const job = playerOf(state).employmentId;
    expect(job).not.toBeNull();
    for (let m = 0; m < 6; m++) state = monthChecked(state);
    // Wages are paid through the ledger with tax withheld.
    const salaryTx = Object.values(state.world.ledger.journal)
      .flat()
      .filter((t) => t.kind === 'tx.salary');
    expect(salaryTx.length).toBeGreaterThan(0);
    const taxed = salaryTx.some((t) =>
      t.entries.some((e) => e.accountId.endsWith('~expense~tax') && e.debit > 0n),
    );
    const gross = playerOf(state).finance?.taxYear.gross ?? 0n;
    expect(taxed || gross < 12_570_00n).toBe(true);

    state = step(state, { type: 'transfer', from: 'checking', amountMinor: '100' });
    const loan = execute(state, {
      type: 'takeLoan',
      id: cid('loan'),
      amountMinor: '100000',
      termMonths: 24,
    });
    if (loan.outcome.status === 'applied')
      state = step(state, { type: 'takeLoan', amountMinor: '100000', termMonths: 24 });
    state = step(state, { type: 'buyInsurance', policyType: 'health', coverageMinor: '0' });
    state = step(state, { type: 'setPension', bp: 500 });
    const moved = execute(state, { type: 'moveOut', id: cid('move'), size: 'room' });
    if (moved.outcome.status === 'applied') state = step(state, { type: 'moveOut', size: 'room' });
    for (let m = 0; m < 12; m++) state = monthChecked(state);

    // A layoff: benefits replace part of the wage, then a new job.
    const world = structuredClone(state.world);
    const player = world.characters[world.activeCharacterId];
    if (!player) throw new Error('no player');
    endEmployment(world, player, 'laidOff');
    state = { world, pending: null };
    for (let m = 0; m < 3; m++) state = monthChecked(state);
    const benefit = Object.values(state.world.ledger.journal)
      .flat()
      .some((t) => t.kind === 'tx.benefit');
    expect(benefit).toBe(true);
    state = findWork(state);
    for (let m = 0; m < 12; m++) state = monthChecked(state);
    expect(checkInvariants(state.world)).toEqual([]);
    expect(WorldSchema.safeParse(state.world).success).toBe(true);
  }, 120_000);

  it('medical costs fall on the patient only after public coverage and insurance', () => {
    const state = advanceMonths(newState({ seed: 'medical', countryCode: 'US' }), 20 * 12);
    const world = structuredClone(state.world);
    const player = world.characters[world.activeCharacterId];
    if (!player) throw new Error('no player');
    const bill = medianWage(world, 'US') * 2n;
    const uninsured = payMedicalCost(structuredClone(world), structuredClone(player), bill, 'test');
    const insured = structuredClone(world);
    const insuredPlayer = insured.characters[insured.activeCharacterId];
    if (!insuredPlayer) throw new Error('no player');
    insured.insurance.pol_t = {
      id: 'pol_t',
      holderId: insuredPlayer.id,
      type: 'health',
      premiumMinor: 1n,
      coverageMinor: 0n,
      startTick: 0,
      status: 'active',
    };
    const insuredCost = payMedicalCost(insured, insuredPlayer, bill, 'test');
    expect(uninsured > 0n).toBe(true);
    expect(insuredCost < uninsured).toBe(true);
  }, 60_000);

  it('households, NPC careers and the economy stay consistent over 60 years', () => {
    const state = advanceMonths(
      newState({ seed: 'long-economy', countryCode: 'BR', scenario: 'lowIncome' }),
      720,
    );
    const w = state.world;
    expect(checkLedger(w)).toEqual([]);
    const economy = w.economy.BR;
    expect(economy).toBeDefined();
    if (economy) {
      // Today's prices: 60 years on, prices have drifted, not multiplied (E87).
      expect(economy.priceIndexBp).toBeGreaterThan(5_000);
      expect(economy.priceIndexBp).toBeLessThan(20_000);
      expect(economy.wageIndexBp).toBeLessThan(30_000);
      expect(economy.unemploymentBp).toBeGreaterThanOrEqual(100);
    }
    // Journal stays bounded (snapshots keep the full record).
    expect(Object.keys(w.ledger.journal).length).toBeLessThanOrEqual(4);
    for (const list of Object.values(w.ledger.history))
      expect(list.length).toBeLessThanOrEqual(24 + 61);
  }, 120_000);
});

describe('older saves are upgraded (schema 1 -> 2 -> 3 -> 4)', () => {
  const raw = (fixture as { world: Record<string, unknown> }).world;

  it('the real Milestone 2 world upgrades into a valid world, keeping history and status', () => {
    const upgraded = upgradeWorldV4(
      upgradeWorldV3(upgradeWorldV2(upgradeWorldV1(structuredClone(raw)))),
    ) as World;
    const parsed = WorldSchema.safeParse(upgraded);
    expect(parsed.success).toBe(true);
    expect(checkInvariants(upgraded)).toEqual([]);
    const before = raw as {
      biography: unknown[];
      tick: number;
      activeCharacterId: string;
      characters: Record<string, { identity: { firstName: string } }>;
    };
    expect(upgraded.tick).toBe(before.tick);
    expect(upgraded.biography.length).toBe(before.biography.length);
    expect(upgraded.characters[before.activeCharacterId]?.identity.firstName).toBe('Ada');
    expect(Object.keys(upgraded.ledger.accounts).length).toBeGreaterThan(0);
  });

  it('is deterministic and the upgraded life plays on', () => {
    const a = upgradeWorldV4(upgradeWorldV3(upgradeWorldV2(upgradeWorldV1(structuredClone(raw)))));
    const b = upgradeWorldV4(upgradeWorldV3(upgradeWorldV2(upgradeWorldV1(structuredClone(raw)))));
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    const state = advanceMonths({ world: a as World, pending: null }, 24);
    expect(state.world.tick).toBe((a as World).tick + 24);
    expect(checkInvariants(state.world)).toEqual([]);
  }, 60_000);
});
