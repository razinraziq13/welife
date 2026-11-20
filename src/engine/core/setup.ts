import { clamp, sortedKeys } from './data';
import { ageYears, withRng } from './world';
import { assignNpcJob } from '../career/jobs';
import { LEVEL_PAY, OCCUPATIONS, meetsEducation } from '../career/occupations';
import { ensureEconomy } from '../economy/economy';
import { ensurePlayerAccounts, trackHousehold } from '../economy/finance';
import { assignAdultEducation, generateCommunity } from '../social/npcs';
import { rebalancePopulation } from '../social/population';
import { parentsOf } from '../social/relationships';
import { getRules } from '../world/rules';
import type { Character, WealthTier, World } from '../state/schema';

/**
 * Sets up the systems added in Milestones 3-4 for a world: the country economy, the
 * extended family and neighbourhood, parents' and NPCs' jobs, the household ledger and the
 * player's first savings account. Used both when a world is created and when an older save
 * is upgraded, so both paths produce the same kind of world (deterministic).
 */

/** Main earner's pay by family circumstances, percent of the median wage. */
const PARENT_PAY: Record<WealthTier, number> = {
  low: 60,
  'lower-middle': 85,
  middle: 115,
  'upper-middle': 175,
  wealthy: 380,
  'very-wealthy': 900,
  royal: 1500,
};

function giveParentJob(world: World, parent: Character, targetPercent: number): void {
  const age = ageYears(world, parent);
  const level = clamp(Math.floor((age - 22) / 7), 0, 4);
  const scored = OCCUPATIONS.filter((o) => !o.hidden && o.minExperienceMonths === 0)
    .map((o) => {
      const lvl = Math.min(level, o.maxLevel);
      return {
        o,
        lvl,
        gap: Math.abs(Math.floor((o.pay * (LEVEL_PAY[lvl] ?? 100)) / 100) - targetPercent),
      };
    })
    .sort((a, b) => a.gap - b.gap || (a.o.id < b.o.id ? -1 : 1))
    .slice(0, 6);
  const pick = withRng(world, 'career', (rng) => rng.pick(scored));
  if (!meetsEducation(pick.o, parent.education.qualifications)) {
    const quals = new Set(parent.education.qualifications);
    quals.add('upperSecondary');
    if (pick.o.education !== 'none' && pick.o.education !== 'upperSecondary')
      quals.add(`${pick.o.education}:${pick.o.field ?? 'business'}`);
    parent.education.qualifications = [...quals];
  }
  assignNpcJob(world, parent, { occupationId: pick.o.id, level: pick.lvl });
}

export function initializeSystems(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (!player) throw new Error('No player');
  const home = world.households[player.householdId];
  if (!home) throw new Error('No household');
  ensureEconomy(world, player.countryCode);

  // Parents: education and jobs that match the family's circumstances.
  const parents = parentsOf(world, player.id)
    .map((id) => world.characters[id])
    .filter((c): c is Character => c?.death === null && c.householdId === home.id);
  parents.forEach((parent, index) => {
    if (parent.education.qualifications.length === 0)
      assignAdultEducation(world, parent, home.wealth);
    if (parent.employmentId) return;
    const stateAge = getRules(parent.countryCode).pension.stateAge;
    if (ageYears(world, parent) >= stateAge) return;
    if (index === 0) {
      if (home.flags.royal) assignNpcJob(world, parent, { occupationId: 'royal-duties', level: 0 });
      else if (home.flags.businessHeir)
        assignNpcJob(world, parent, { occupationId: 'family-executive', level: 0 });
      else if (home.flags.political)
        assignNpcJob(world, parent, { occupationId: 'public-official', level: 0 });
      else giveParentJob(world, parent, PARENT_PAY[home.wealth]);
      return;
    }
    const works = withRng(
      world,
      'career',
      (rng) => rng.int(100) < (home.wealth === 'low' ? 60 : 80),
    );
    if (works) giveParentJob(world, parent, Math.floor((PARENT_PAY[home.wealth] * 75) / 100));
  });
  if (parents.length === 2) {
    const [a, b] = parents as [Character, Character];
    if (!a.partnership && !b.partnership) {
      a.partnership = { partnerId: b.id, status: 'married', since: 0, planningFamily: false };
      b.partnership = { partnerId: a.id, status: 'married', since: 0, planningFamily: false };
    }
  }

  generateCommunity(world);

  // Other adults: most have work; those past pension age are retired.
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (c?.death !== null || c.employmentId || id === player.id || c.householdId === home.id)
      continue;
    const age = ageYears(world, c);
    if (age < 18) continue;
    if (age >= getRules(c.countryCode).pension.stateAge) continue;
    if (withRng(world, 'career', (rng) => rng.int(100) < 85)) assignNpcJob(world, c);
  }

  const head = parents[0] ?? player;
  trackHousehold(world, home, head.id);
  ensurePlayerAccounts(world, player);
  rebalancePopulation(world);
}
