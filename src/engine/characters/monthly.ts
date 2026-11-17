import { ageOf } from '../core/clock';
import { clamp, sortedKeys } from '../core/data';
import { addBiography, addNotification, isAlive, withRng } from '../core/world';
import { getCountry } from '../world/countries';
import { displayName } from './names';
import { monthlyMortalityPpm } from './mortality';
import { changeHabit, changeNeed, changeStat, lifeStage } from './stats';
import {
  HABIT_KEYS,
  NEED_KEYS,
  type Character,
  type WealthTier,
  type World,
} from '../state/schema';

/**
 * Steps 3, 6 and 7 of the monthly tick for characters: birthdays and life stages, needs,
 * energy, stress, health, habits, and mortality. The player gets the detailed model; NPCs
 * use a simplified one (spec §4 NPCs). All values PROPOSED TUNING.
 */

const NUTRITION_TARGET: Record<WealthTier, number> = {
  low: 650,
  'lower-middle': 720,
  middle: 800,
  'upper-middle': 850,
  wealthy: 900,
  'very-wealthy': 920,
  royal: 950,
};

/** [maxAgeYears, rest, social, leisure] restored monthly by family care. PROPOSED TUNING. */
const FAMILY_CARE: readonly [number, number, number, number][] = [
  [3, 115, 95, 90],
  [12, 85, 60, 55],
  [17, 45, 30, 25],
];

function hasLivingCarer(world: World, c: Character): boolean {
  return Object.values(world.familyLinks).some((link) => {
    if (link.childId !== c.id) return false;
    const parent = world.characters[link.parentId];
    return parent?.death === null;
  });
}

function towards(current: number, target: number, divisor: number): number {
  return -Math.trunc((current - target) / divisor);
}

function healthDrift(ageYears: number): number {
  if (ageYears >= 85) return -12;
  if (ageYears >= 70) return -8;
  if (ageYears >= 55) return -4;
  if (ageYears >= 40) return -2;
  return 0;
}

function updatePlayer(world: World, c: Character): void {
  const age = ageOf(c.birth, world.clock);

  if (age.months === 0 && age.totalMonths > 0) {
    addBiography(world, c.id, 'life', 'bio.birthday', { age: age.years });
    addNotification(world, 'life', 'ntf.birthday', { age: age.years }, 'character');
    const stage = lifeStage(age.years);
    if (stage !== lifeStage(age.years - 1)) {
      addBiography(world, c.id, 'life', 'bio.stage', { stage });
      addNotification(world, 'life', 'ntf.stage', { stage }, 'character');
    }
  }

  // Needs.
  changeNeed(c, 'rest', -120);
  changeNeed(c, 'leisure', -120);
  changeNeed(c, 'social', -100);
  const wealth = world.households[c.householdId]?.wealth ?? 'middle';
  changeNeed(c, 'nutrition', towards(c.needs.nutrition, NUTRITION_TARGET[wealth], 2));
  if (c.habits.sleepRoutine >= 30) changeNeed(c, 'rest', 40);
  // Children's needs are largely met by the people caring for them; that care fades
  // with age, so older characters must look after themselves through activities.
  const care = FAMILY_CARE.find(([maxAge]) => age.years <= maxAge);
  if (care && hasLivingCarer(world, c)) {
    changeNeed(c, 'rest', care[1]);
    changeNeed(c, 'social', care[2]);
    changeNeed(c, 'leisure', care[3]);
  }

  let needTotal = 0;
  for (const key of NEED_KEYS) needTotal += c.needs[key];
  const needAverage = Math.floor(needTotal / NEED_KEYS.length);
  if (needAverage < 350) {
    changeStat(world, c, 'happiness', -30, 'needs:unmet');
    changeStat(world, c, 'stress', 30, 'needs:unmet');
  } else if (needAverage > 700) {
    changeStat(world, c, 'happiness', 10, 'needs:met');
  }

  // Health.
  let health = healthDrift(age.years);
  if (age.years < 18 && c.stats.health < 850) health += Math.trunc((850 - c.stats.health) / 20);
  if (c.habits.exercise >= 70) health += 5;
  else if (c.habits.exercise >= 40) health += 3;
  if (c.stats.stress > 700) health -= 5;
  if (c.needs.nutrition < 400) health -= 5;
  changeStat(world, c, 'health', health, 'monthly:health');

  // Mood and stress return slowly towards a baseline.
  changeStat(world, c, 'stress', towards(c.stats.stress, 200, 10), 'monthly:stress');
  changeStat(world, c, 'happiness', towards(c.stats.happiness, 550, 15), 'monthly:mood');
  if (age.years < 18) changeStat(world, c, 'intelligence', 2, 'monthly:growing-up');

  // Energy recovers each month from rest and health, reduced by stress.
  const energy = clamp(
    400 +
      Math.floor((c.needs.rest * 2) / 5) +
      Math.floor(c.stats.health / 5) -
      Math.floor(c.stats.stress / 5),
    0,
    1000,
  );
  changeStat(world, c, 'energy', energy - c.stats.energy, 'monthly:energy');

  // Habits fade unless maintained.
  for (const key of HABIT_KEYS) changeHabit(c, key, -1);
}

function updateNpc(world: World, c: Character): void {
  const age = ageOf(c.birth, world.clock);
  const s = c.stats;
  s.stress = clamp(s.stress + towards(s.stress, 300, 10), 0, 1000);
  s.happiness = clamp(s.happiness + towards(s.happiness, 550, 15), 0, 1000);
  s.health = clamp(
    s.health + healthDrift(age.years) + (age.years < 18 && s.health < 850 ? 3 : 0),
    0,
    1000,
  );
  s.energy = clamp(500 + Math.floor(s.health / 4) - Math.floor(s.stress / 5), 0, 1000);
}

export function updateCharactersMonthly(world: World): void {
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (!c || !isAlive(c)) continue;
    if (id === world.activeCharacterId) updatePlayer(world, c);
    else updateNpc(world, c);
  }
}

function deathCause(world: World, c: Character, ageYears: number): string {
  if (c.stats.health < 350) return 'illness';
  if (ageYears >= 70) return 'natural';
  return withRng(world, 'mortality', (rng) => (rng.int(3) === 0 ? 'accident' : 'illness'));
}

/** Monthly mortality roll for every living character, in id order. */
export function processMortality(world: World): string[] {
  const deaths: string[] = [];
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (!c || !isAlive(c)) continue;
    const age = ageOf(c.birth, world.clock);
    const ppm = monthlyMortalityPpm({
      ageYears: age.years,
      health: c.stats.health,
      lifeExpectancy: getCountry(c.countryCode).lifeExpectancy,
      difficulty: world.rules.difficulty,
    });
    const dies = withRng(world, 'mortality', (rng) => rng.chancePpm(ppm));
    if (!dies) continue;
    c.death = { ...world.clock };
    c.deathCause = deathCause(world, c, age.years);
    deaths.push(id);
  }
  const player = world.characters[world.activeCharacterId];
  for (const id of deaths) {
    const c = world.characters[id];
    if (!c || !player) continue;
    const age = ageOf(c.birth, world.clock).years;
    if (id === player.id) {
      world.lifeStatus = 'ended';
      world.events.pendingInstanceId = null;
      addBiography(world, id, 'life', 'bio.died', { age, cause: c.deathCause ?? 'natural' });
      addNotification(world, 'life', 'ntf.lifeEnded', { age }, 'life');
      continue;
    }
    if (!isAlive(player)) continue;
    const relation = Object.values(world.relationships).find(
      (r) => r.aId === player.id && r.bId === id,
    );
    if (!relation) continue;
    addBiography(world, player.id, 'family', 'bio.familyDeath', {
      name: displayName(c.identity, false),
      relation: relation.type,
      age,
    });
    addNotification(
      world,
      'family',
      'ntf.familyDeath',
      { name: displayName(c.identity, false), relation: relation.type },
      'social',
    );
    const grief = relation.type === 'parent' ? 200 : 150;
    changeStat(world, player, 'happiness', -grief, `loss:${relation.type}`);
    changeStat(world, player, 'stress', grief, `loss:${relation.type}`);
  }
  return deaths;
}

/** Family relationships drift slowly; time together keeps them close (spec §4 Relationships). */
export function driftRelationships(world: World): void {
  for (const id of sortedKeys(world.relationships)) {
    const rel = world.relationships[id];
    if (!rel) continue;
    const a = world.characters[rel.aId];
    const b = world.characters[rel.bId];
    if (!a || !b || !isAlive(a) || !isAlive(b)) continue;
    const sameHome = a.householdId === b.householdId;
    const target = sameHome ? 70 : 50;
    if (world.tick % 6 === 0 && rel.closeness !== target)
      rel.closeness += rel.closeness < target ? 1 : -1;
    if (rel.conflict > 0 && world.tick % 3 === 0) rel.conflict -= 1;
  }
}
