import { expect } from 'vitest';
import { execute, type Command, type SimState } from '@engine/core/commands';
import { getEvent } from '@engine/content';
import { checkLedger, monthTotals, netWorthOf } from '@engine/economy/ledger';
import type { World } from '@engine/state/schema';
import { cid } from './sim';

/**
 * Reconciliation checks (spec §4 Finance, §8): after every command, the change in the
 * player's net worth equals the income minus expenses booked for it, and the ledger
 * balances. Owners are the player and any household they run.
 */

type Body = Command extends infer C ? (C extends { id: string } ? Omit<C, 'id'> : never) : never;

export function owners(world: World): string[] {
  const player = world.activeCharacterId;
  return [
    player,
    ...Object.values(world.households)
      .filter((h) => h.finance?.headId === player)
      .map((h) => h.id),
  ];
}

export function netWorth(world: World, ids: string[]): bigint {
  return ids.reduce((sum, id) => sum + netWorthOf(world, id), 0n);
}

export function booked(world: World, ids: string[], tick = world.tick): bigint {
  return ids.reduce((sum, id) => {
    const t = monthTotals(world, id, tick);
    return sum + t.income - t.expenses;
  }, 0n);
}

function check(before: World, after: World): void {
  const ids = [...new Set([...owners(before), ...owners(after)])];
  const change = netWorth(after, ids) - netWorth(before, ids);
  const expected =
    after.tick === before.tick ? booked(after, ids) - booked(before, ids) : booked(after, ids);
  expect(change).toBe(expected);
  expect(checkLedger(after)).toEqual([]);
}

/** Runs a command and checks reconciliation; returns the new state and outcome. */
export function checked(state: SimState, body: Body) {
  const result = execute(state, { ...body, id: cid(body.type) });
  if (!result.state.pending) check(state.world, result.state.world);
  return result;
}

/** Advances one month, answering decisions, and checks reconciliation when it commits. */
export function monthChecked(
  state: SimState,
  prefer?: (definitionId: string) => string | null,
): SimState {
  if (state.world.lifeStatus !== 'alive') return state;
  const start = state.world;
  let current = execute(state, { type: 'advance', id: cid('adv'), expectedTick: start.tick }).state;
  while (current.pending) {
    const instanceId = current.pending.events.pendingInstanceId ?? '';
    const def = getEvent(current.pending.events.instances[instanceId]?.definitionId ?? '');
    const choiceId = prefer?.(def.id) ?? def.choices[0]?.id ?? '';
    current = execute(current, { type: 'choose', id: cid('choose'), instanceId, choiceId }).state;
  }
  check(start, current.world);
  return current;
}

/** Gives the player money (booked as a gift so the books still balance). */
export function giveMoney(state: SimState, amount: bigint): SimState {
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  const checking = player?.finance?.checkingId;
  const account = checking ? world.ledger.accounts[checking] : undefined;
  if (!player || !account) throw new Error('no current account');
  const equity = `${player.id}~equity~testGift`;
  const existing = world.ledger.accounts[equity];
  const gift = existing ?? {
    ...account,
    id: equity,
    type: 'equity' as const,
    category: 'testGift',
    balance: 0n,
    loan: null,
  };
  world.ledger.accounts[equity] = gift;
  gift.balance += amount;
  account.balance += amount;
  return { world, pending: null };
}

/** Applies for every job the player qualifies for, accepting the first offer (bounded). */
export function findWork(state: SimState, months = 36): SimState {
  let current = state;
  const player = () => current.world.characters[current.world.activeCharacterId];
  for (let m = 0; m < months && !player()?.employmentId; m++) {
    for (const app of Object.values(current.world.jobs.applications)) {
      if (app.characterId === player()?.id && app.status === 'offered') {
        current = checked(current, {
          type: 'respondOffer',
          applicationId: app.id,
          response: 'accept',
        }).state;
        if (player()?.employmentId) return current;
      }
    }
    for (const posting of Object.values(current.world.jobs.postings)) {
      const res = execute(current, { type: 'applyJob', id: cid('apply'), postingId: posting.id });
      if (res.outcome.status === 'applied') current = res.state;
    }
    current = monthChecked(current, (id) => (id === 'job-interview' ? 'confident' : null));
  }
  return current;
}
