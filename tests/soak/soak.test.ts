import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@engine/core/invariants';
import { checkLedger } from '@engine/economy/ledger';
import { canonicalJson } from '@engine/core/data';
import { createNpc } from '@engine/social/npcs';
import { expect as expectChild, formPartnership } from '@engine/social/family';
import { linkPair } from '@engine/social/relationships';
import { moveToHousehold } from '@engine/characters/factory';
import type { SimState } from '@engine/core/commands';
import type { World } from '@engine/state/schema';
import { advanceMonths, newState, playerOf, run } from '../helpers/sim';

/**
 * Spec §8: "Test 10 generations and 10,000 simulated months without unbounded memory growth
 * or integrity violations." The player starts a family at 18 when they have none; when they
 * die an heir is chosen as the game asks.
 *
 * Live state (people, relationships, accounts, events, notifications) must level off. Family
 * records (biography, lineage ledger history, ancestors) grow with each generation by design,
 * so total size may grow, but only slowly.
 */

function sizes(world: World) {
  return {
    json: canonicalJson(world).length,
    characters: Object.keys(world.characters).length,
    living: Object.values(world.characters).filter((c) => c.death === null).length,
    households: Object.keys(world.households).length,
    relationships: Object.keys(world.relationships).length,
    memories: Object.keys(world.memories).length,
    accounts: Object.keys(world.ledger.accounts).length,
    openAccounts: Object.values(world.ledger.accounts).filter((a) => a.closedTick === null).length,
    instances: Object.keys(world.events.instances).length,
    biography: world.biography.length,
    notifications: world.notifications.length,
    history: Object.values(world.ledger.history).reduce((s, l) => s + l.length, 0),
    employment: Object.keys(world.employment).length,
  };
}

function family(state: SimState): SimState {
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  if (!player) return state;
  const age = world.clock.year - player.birth.year;
  const existing = player.partnership ? world.characters[player.partnership.partnerId] : undefined;
  const partner =
    existing?.death === null
      ? existing
      : createNpc(world, {
          countryCode: player.countryCode,
          householdId: player.householdId,
          ageYears: age,
          gender: player.identity.gender === 'female' ? 'male' : 'female',
          tier: 'close',
        });
  moveToHousehold(world, partner, player.householdId);
  formPartnership(world, player, partner, 'married');
  linkPair(world, player, partner, 'partner', 'partner', { closeness: 85 });
  expectChild(world, 'birth', [player.id, partner.id], player.householdId, 1);
  expectChild(world, 'birth', [player.id, partner.id], player.householdId, 13);
  return { world, pending: null };
}

describe('long-run soak (spec §8)', () => {
  it('runs 10,000 months across generations without unbounded growth or violations', () => {
    let state = newState({ seed: 'soak', countryCode: 'GB' });
    const samples: { tick: number; s: ReturnType<typeof sizes> }[] = [];
    let ended = 0;
    while (state.world.tick < 10_000) {
      if (state.world.lifeStatus === 'succession') {
        const heir = state.world.legacy.succession?.candidates[0] ?? '';
        state = run(state, { type: 'continueAs', characterId: heir }).state;
        continue;
      }
      if (state.world.lifeStatus === 'ended') {
        ended += 1;
        break;
      }
      const player = playerOf(state);
      const age = state.world.clock.year - player.birth.year;
      const hasChildren = Object.values(state.world.familyLinks).some(
        (l) => l.parentId === player.id,
      );
      if (age >= 18 && !hasChildren) state = family(state);
      state = advanceMonths(state, 12);
      if (state.world.tick % 1000 < 12) {
        samples.push({ tick: state.world.tick, s: sizes(state.world) });
        expect(checkInvariants(state.world)).toEqual([]);
        expect(checkLedger(state.world)).toEqual([]);
      }
    }
    expect(ended).toBe(0);
    expect(state.world.tick).toBeGreaterThanOrEqual(10_000);
    expect(state.world.legacy.lineage.length).toBeGreaterThanOrEqual(10);
    for (const { tick, s } of samples) {
      const at = `month ${String(tick)}`;
      expect(s.living, at).toBeLessThanOrEqual(500);
      expect(s.characters, at).toBeLessThanOrEqual(1_000);
      expect(s.households, at).toBeLessThanOrEqual(400);
      expect(s.relationships, at).toBeLessThanOrEqual(600);
      expect(s.openAccounts, at).toBeLessThanOrEqual(700);
      expect(s.instances, at).toBeLessThanOrEqual(700);
      expect(s.notifications, at).toBeLessThanOrEqual(500);
      expect(s.memories, at).toBeLessThanOrEqual(500);
      expect(s.json, at).toBeLessThanOrEqual(5_000_000);
    }
    // Growth slows: the second half of the run adds far less than the first.
    const mid = samples.find((x) => x.tick >= 5_000)?.s.json ?? 0;
    const last = samples.at(-1)?.s.json ?? 0;
    expect(last - mid).toBeLessThan(mid / 2);
    // Size report for the progress notes (console.warn is the allowed channel in tests).
    console.warn(samples.map((x) => `${String(x.tick)} ${JSON.stringify(x.s)}`).join('\n'));
  }, 1_200_000);
});
