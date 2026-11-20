import { describe, expect, it } from 'vitest';
import { ensurePlayerAccounts } from '@engine/economy/finance';
import { monthlyPay, promotionChance } from '@engine/civics/military';
import type { SimState } from '@engine/core/commands';
import { projectGame } from '@engine/view';
import { checked, monthChecked } from '../../helpers/reconcile';
import { newState, playerOf, run } from '../../helpers/sim';

/** A 20-year-old in Britain who has enlisted and is serving. */
function soldier(seed: string): SimState {
  const base = newState({ seed, countryCode: 'GB' });
  const world = structuredClone(base.world);
  const player = world.characters[world.activeCharacterId];
  if (!player) throw new Error('no player');
  player.birth = { year: world.clock.year - 20, month: world.clock.month };
  player.education.current = null;
  ensurePlayerAccounts(world, player);
  let state = checked(
    { world, pending: null },
    { type: 'enlist', branch: 'army', track: 'enlisted' },
  ).state;
  for (let i = 0; i < 4; i++) state = monthChecked(state);
  return state;
}

const record = (s: SimState) => Object.values(s.world.civics.service)[0];

describe('military specialty and posting (Career Expansion)', () => {
  it('overseas pays 25% more and raises promotion odds; the specialty trains its skill', () => {
    const state = soldier('posting');
    const home = record(state);
    if (!home) throw new Error('no service');
    const homePay = monthlyPay(state.world, home);
    const homeChance = promotionChance(playerOf(state), home);

    const set = checked(state, {
      type: 'setServiceRole',
      specialty: 'medical',
      posting: 'overseas',
    }).state;
    const away = record(set);
    if (!away) throw new Error('no service');
    expect(monthlyPay(set.world, away)).toBeGreaterThan(homePay);
    expect(promotionChance(playerOf(set), away)).toBe(homeChance + 15);
    expect(projectGame(set).civic.military.current).toMatchObject({
      specialty: 'medical',
      posting: 'overseas',
    });

    const care = playerOf(set).skills.care;
    const stress = playerOf(set).stats.stress;
    const later = monthChecked(set);
    expect(playerOf(later).skills.care).toBeGreaterThan(care);
    expect(playerOf(later).stats.stress).toBeGreaterThan(stress - 1);
  }, 60_000);

  it('only serving volunteers choose a role', () => {
    const civilian = newState({ seed: 'no-role', countryCode: 'GB' });
    const res = run(civilian, { type: 'setServiceRole', specialty: 'logistics', posting: 'home' });
    expect(res.outcome.status).toBe('rejected');
  });
});
