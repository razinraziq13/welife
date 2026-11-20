import { describe, expect, it } from 'vitest';
import { ensurePlayerAccounts } from '@engine/economy/finance';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, giveMoney } from '../../helpers/reconcile';
import { newState, playerOf } from '../../helpers/sim';

/** A 30-year-old in New Zealand (local elections), not at school. */
function adult(seed: string): SimState {
  const state = newState({ seed, countryCode: 'NZ' });
  const world = structuredClone(state.world);
  const player = world.characters[world.activeCharacterId];
  if (!player) throw new Error('no player');
  player.birth = { year: world.clock.year - 30, month: world.clock.month };
  player.education.current = null;
  player.stats.energy = 1000;
  ensurePlayerAccounts(world, player);
  return giveMoney({ world, pending: null }, 50_000_00n);
}

function campaignSupport(state: SimState): number {
  return Object.values(state.world.civics.politics)[0]?.campaign?.support ?? -1;
}

describe('volunteering and community standing (Career Expansion)', () => {
  it('volunteering raises standing, shown on the Politics view', () => {
    let state = adult('volunteer');
    expect(playerOf(state).career.community ?? 0).toBe(0);
    state = checked(state, { type: 'act', activityId: 'food-bank' }).state;
    state = checked(state, { type: 'act', activityId: 'clinic-volunteer' }).state;
    state = checked(state, { type: 'act', activityId: 'neighbourhood-cleanup' }).state;
    const standing = playerOf(state).career.community ?? 0;
    expect(standing).toBeGreaterThanOrEqual(40 + 30 + 15);
    expect(projectGame(state).civic.politics.communityStanding).toBe(standing);
  });

  it('standing gives a campaign a head start', () => {
    const plain = adult('volunteer-run');
    const known = structuredClone(plain.world);
    const p = known.characters[known.activeCharacterId];
    if (!p) throw new Error('no player');
    p.career.community = 1000;
    const run = (s: SimState) => {
      const joined = checked(s, { type: 'joinParty', partyId: 'unity' }).state;
      return checked(joined, { type: 'seekOffice', level: 'local' }).state;
    };
    expect(campaignSupport(run({ world: known, pending: null }))).toBe(
      campaignSupport(run(plain)) + 100,
    );
  });
});
