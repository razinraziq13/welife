import { addMonths } from '../core/clock';
import { clamp } from '../core/data';
import { Rng } from '../core/rng';
import { nextId, withRng } from '../core/world';
import {
  inheritAppearance,
  inheritTraits,
  randomAppearance,
  randomTraits,
} from '../characters/genetics';
import {
  addCharacter,
  addHousehold,
  adultSkills,
  childSkills,
  npcStats,
} from '../characters/factory';
import { getCountry, getLocation } from '../world/countries';
import type {
  Character,
  Gender,
  Household,
  Identity,
  RelationType,
  Tier,
  WealthTier,
  World,
} from '../state/schema';
import { birthCivic } from '../civics/status';
import { linkPair, parentsOf, randomInterests } from './relationships';

/**
 * Individually modelled people (spec §4 NPCs): the player's extended family, neighbours,
 * classmates, teachers, club members, colleagues and partners. Background population
 * beyond these is aggregate (`economy/economy.ts`).
 */

const REPUTATION: Record<WealthTier, number> = {
  low: 400,
  'lower-middle': 420,
  middle: 450,
  'upper-middle': 500,
  wealthy: 550,
  'very-wealthy': 600,
  royal: 750,
};

export interface NpcSpec {
  countryCode: string;
  householdId: string;
  /** Age now, whole years. */
  ageYears: number;
  gender?: Gender;
  lastName?: string;
  tier: Tier;
  /** Biological parents (for inherited looks and personality). */
  parents?: readonly Character[];
  wealth?: WealthTier;
  /** Born `ageYears` ago but already deceased (e.g. a grandparent). */
  diedYearsAgo?: number;
}

/** Creates an NPC with a name, stats and skills fitting their age and country. */
export function createNpc(world: World, spec: NpcSpec): Character {
  const household = world.households[spec.householdId];
  if (!household) throw new Error(`Unknown household ${spec.householdId}`);
  const { location } = getLocation(household.locationId);
  const country = getCountry(spec.countryCode);
  const rng = new Rng(world.rng.npc);
  const genetics = new Rng(world.rng.genetics);
  const gender: Gender = spec.gender ?? (rng.int(2) === 0 ? 'female' : 'male');
  const names = country.names;
  const list =
    gender === 'female'
      ? names.female
      : gender === 'male'
        ? names.male
        : [...names.female, ...names.male];
  const identity: Identity = {
    firstName: rng.pick(list),
    lastName: spec.lastName ?? rng.pick(names.family),
    gender,
    title: null,
    nameOrder: names.order,
  };
  const months =
    spec.ageYears * 12 +
    (spec.ageYears === 0 ? rng.int(Math.max(1, Math.min(12, world.tick + 1))) : rng.int(12));
  const birth = addMonths(world.clock, -months);
  const parents = spec.parents ?? [];
  const adult = spec.ageYears >= 18;
  const stats = npcStats(rng, REPUTATION[spec.wealth ?? household.wealth]);
  const skills = adult ? adultSkills(rng) : childSkills(rng, spec.ageYears);
  const traits =
    parents.length > 0
      ? inheritTraits(
          genetics,
          parents.map((p) => p.traits),
        )
      : randomTraits(genetics);
  const appearance =
    parents.length > 0
      ? inheritAppearance(
          genetics,
          parents.map((p) => p.appearance),
        )
      : randomAppearance(genetics);
  world.rng.npc = rng.state();
  world.rng.genetics = genetics.state();
  const death =
    spec.diedYearsAgo !== undefined ? addMonths(world.clock, -spec.diedYearsAgo * 12) : null;
  const character = addCharacter(world, {
    identity,
    birth,
    location,
    countryCode: country.code,
    householdId: household.id,
    tier: death ? 'archived' : spec.tier,
    stats,
    skills,
    traits,
    appearance,
    interests: randomInterests(world),
    death,
  });
  household.memberIds.push(character.id);
  if (parents.length > 0) birthCivic(world, character, parents, country.code);
  for (const parent of parents) {
    const id = nextId(world, 'fam');
    world.familyLinks[id] = { id, parentId: parent.id, childId: character.id, type: 'biological' };
  }
  return character;
}

/** Ages (years) of everyone in the household, for building cohorts. */
function ageYearsOf(world: World, c: Character): number {
  return Math.floor(
    (world.clock.year * 12 + world.clock.month - (c.birth.year * 12 + c.birth.month)) / 12,
  );
}

/** Qualifications an adult NPC plausibly holds (by intelligence and family circumstances). */
export function assignAdultEducation(world: World, npc: Character, wealth: WealthTier): void {
  withRng(world, 'npc', (rng) => {
    const boost =
      wealth === 'low' ? -15 : wealth === 'lower-middle' ? -5 : wealth === 'middle' ? 5 : 15;
    const smart = Math.floor(npc.stats.intelligence / 10) + boost;
    const q: string[] = ['primary', 'lowerSecondary'];
    if (rng.int(100) < clamp(55 + smart / 2, 40, 98)) q.push('upperSecondary');
    if (q.includes('upperSecondary')) {
      const roll = rng.int(100);
      const fields = [
        'computing',
        'engineering',
        'nursing',
        'law',
        'business',
        'economics',
        'education',
        'arts',
        'design',
        'media',
        'sciences',
        'humanities',
        'hospitality',
        'socialwork',
        'sport',
        'psychology',
      ];
      const field = rng.pick(fields);
      if (roll < clamp(smart - 15, 5, 70)) {
        q.push(`bachelor:${field}`);
        if (rng.int(100) < 25) q.push(`master:${field}`);
      } else if (roll < clamp(smart + 10, 20, 85)) {
        q.push(
          `diploma:${rng.pick(['trades', 'hospitality', 'business', 'nursing', 'computing', 'design'])}`,
        );
      }
    }
    npc.education.qualifications = q;
  });
}

export interface CommunityResult {
  created: Character[];
}

/** Links a new person to the player with a relationship pair. */
function relate(
  world: World,
  player: Character,
  other: Character,
  typeOfOther: RelationType,
  typeOfPlayer: RelationType,
  closeness: number,
): void {
  if (other.death !== null) return;
  linkPair(world, player, other, typeOfOther, typeOfPlayer, { closeness });
}

/**
 * Generates the player's extended family (grandparents, aunts and uncles with partners,
 * cousins) and neighbourhood (families with children of a similar age). Deterministic:
 * uses the world's "npc", "genetics" and "social" streams.
 */
export function generateCommunity(world: World): CommunityResult {
  const player = world.characters[world.activeCharacterId];
  if (!player) throw new Error('No player');
  const home = world.households[player.householdId];
  if (!home) throw new Error('No household');
  const created: Character[] = [];
  const playerAge = ageYearsOf(world, player);
  const parentIds = parentsOf(world, player.id);
  const parents = parentIds
    .map((id) => world.characters[id])
    .filter((c): c is Character => c !== undefined);
  const origin = home.originCountryCode;

  for (const parent of parents) {
    const parentAge = ageYearsOf(world, parent);
    const country = origin ?? parent.countryCode;
    const gpLocation = origin ? getCountry(origin).locations.find((l) => l.kind === 'city') : null;
    const gpHousehold = addHousehold(world, gpLocation?.id ?? home.locationId, home.wealth, false);
    // Married mothers in most countries share the family name; their parents do not.
    const keepsOwn = country === 'KR' || country === 'CN';
    const familyName =
      parent.identity.gender === 'female' && !keepsOwn
        ? withRng(world, 'npc', (rng) => rng.pick(getCountry(country).names.family))
        : parent.identity.lastName.replace(/^(von|de|di) /, '');
    const grandparents: Character[] = [];
    for (const gender of ['female', 'male'] as const) {
      const age = parentAge + withRng(world, 'npc', (rng) => rng.range(22, 36));
      const expectancy = getCountry(country).lifeExpectancy;
      const dead =
        age > expectancy + 8 ||
        withRng(world, 'npc', (rng) => age > expectancy - 6 && rng.int(3) === 0);
      const gp = createNpc(world, {
        countryCode: country,
        householdId: gpHousehold.id,
        ageYears: age,
        gender,
        lastName: familyName,
        tier: 'close',
        wealth: home.wealth,
        ...(dead
          ? {
              diedYearsAgo: withRng(world, 'npc', (rng) =>
                rng.range(1, Math.max(1, Math.min(20, age - 50))),
              ),
            }
          : {}),
      });
      assignAdultEducation(world, gp, home.wealth);
      grandparents.push(gp);
      created.push(gp);
    }
    // The parent is the grandparents' child.
    for (const gp of grandparents) {
      const id = nextId(world, 'fam');
      world.familyLinks[id] = { id, parentId: gp.id, childId: parent.id, type: 'biological' };
      relate(
        world,
        player,
        gp,
        'grandparent',
        'grandchild',
        withRng(world, 'social', (rng) => rng.range(55, 85)),
      );
    }
    const living = grandparents.filter((g) => g.death === null);
    if (living.length === 2) {
      const [a, b] = living as [Character, Character];
      a.partnership = { partnerId: b.id, status: 'married', since: 0, planningFamily: false };
      b.partnership = { partnerId: a.id, status: 'married', since: 0, planningFamily: false };
    }

    // Aunts and uncles, their partners and children (cousins).
    const siblingCount = withRng(world, 'npc', (rng) =>
      rng.weighted([
        { value: 0, weight: 30 },
        { value: 1, weight: 45 },
        { value: 2, weight: 25 },
      ]),
    );
    for (let i = 0; i < siblingCount; i++) {
      const age = Math.max(18, parentAge + withRng(world, 'npc', (rng) => rng.range(-8, 8)));
      const auntUncleHousehold = addHousehold(
        world,
        home.locationId,
        home.wealth,
        home.flags.rural,
      );
      const auntUncle = createNpc(world, {
        countryCode: parent.countryCode,
        householdId: auntUncleHousehold.id,
        ageYears: age,
        lastName: familyName,
        tier: 'relevant',
        parents: grandparents,
        wealth: home.wealth,
      });
      assignAdultEducation(world, auntUncle, home.wealth);
      created.push(auntUncle);
      relate(
        world,
        player,
        auntUncle,
        'auntUncle',
        'nieceNephew',
        withRng(world, 'social', (rng) => rng.range(35, 70)),
      );
      const hasFamily = withRng(world, 'npc', (rng) => rng.int(100) < 70);
      if (!hasFamily) continue;
      const partner = createNpc(world, {
        countryCode: parent.countryCode,
        householdId: auntUncleHousehold.id,
        ageYears: Math.max(18, age + withRng(world, 'npc', (rng) => rng.range(-4, 4))),
        gender: auntUncle.identity.gender === 'female' ? 'male' : 'female',
        tier: 'relevant',
        wealth: home.wealth,
      });
      assignAdultEducation(world, partner, home.wealth);
      auntUncle.partnership = {
        partnerId: partner.id,
        status: 'married',
        since: 0,
        planningFamily: false,
      };
      partner.partnership = {
        partnerId: auntUncle.id,
        status: 'married',
        since: 0,
        planningFamily: false,
      };
      created.push(partner);
      const cousins = withRng(world, 'npc', (rng) => rng.range(0, 2));
      for (let c = 0; c < cousins; c++) {
        const cousinAge = clamp(
          playerAge + withRng(world, 'npc', (rng) => rng.range(-6, 6)),
          0,
          Math.max(0, age - 18),
        );
        const cousin = createNpc(world, {
          countryCode: parent.countryCode,
          householdId: auntUncleHousehold.id,
          ageYears: cousinAge,
          lastName:
            auntUncle.identity.gender === 'female' && !keepsOwn
              ? partner.identity.lastName
              : familyName,
          tier: 'relevant',
          parents: [auntUncle, partner],
          wealth: home.wealth,
        });
        if (cousinAge >= 18) assignAdultEducation(world, cousin, home.wealth);
        created.push(cousin);
        relate(
          world,
          player,
          cousin,
          'cousin',
          'cousin',
          withRng(world, 'social', (rng) => rng.range(30, 65)),
        );
      }
    }
  }

  // Neighbours: families nearby, several with children close to the player's age.
  for (let n = 0; n < 8; n++) {
    const wealth = withRng(world, 'npc', (rng) => rng.pick(neighbourWealth(home.wealth)));
    const household = addHousehold(world, home.locationId, wealth, home.flags.rural);
    const adults = withRng(world, 'npc', (rng) => (rng.int(4) === 0 ? 1 : 2));
    const adultAge = withRng(world, 'npc', (rng) => rng.range(26, 62));
    const grownUps: Character[] = [];
    for (let a = 0; a < adults; a++) {
      const npc = createNpc(world, {
        countryCode: player.countryCode,
        householdId: household.id,
        ageYears: adultAge + (a === 0 ? 0 : withRng(world, 'npc', (rng) => rng.range(-4, 4))),
        gender: a === 0 ? undefined : grownUps[0]?.identity.gender === 'female' ? 'male' : 'female',
        lastName: grownUps[0]?.identity.lastName,
        tier: 'relevant',
        wealth,
      } as NpcSpec);
      assignAdultEducation(world, npc, wealth);
      grownUps.push(npc);
      created.push(npc);
      relate(
        world,
        player,
        npc,
        'neighbour',
        'neighbour',
        withRng(world, 'social', (rng) => rng.range(15, 40)),
      );
    }
    if (grownUps.length === 2) {
      const [a, b] = grownUps as [Character, Character];
      a.partnership = { partnerId: b.id, status: 'married', since: 0, planningFamily: false };
      b.partnership = { partnerId: a.id, status: 'married', since: 0, planningFamily: false };
    }
    if (adultAge > 50) continue;
    const kids = withRng(world, 'npc', (rng) => rng.range(0, 2));
    for (let k = 0; k < kids; k++) {
      const kidAge = clamp(
        playerAge + withRng(world, 'npc', (rng) => rng.range(-2, 4)),
        0,
        adultAge - 20,
      );
      const kid = createNpc(world, {
        countryCode: player.countryCode,
        householdId: household.id,
        ageYears: kidAge,
        lastName: grownUps[0]?.identity.lastName,
        tier: 'relevant',
        parents: grownUps,
        wealth,
      } as NpcSpec);
      created.push(kid);
      relate(
        world,
        player,
        kid,
        'neighbour',
        'neighbour',
        withRng(world, 'social', (rng) => rng.range(15, 45)),
      );
    }
  }
  return { created };
}

function neighbourWealth(wealth: WealthTier): WealthTier[] {
  switch (wealth) {
    case 'low':
    case 'lower-middle':
      return ['low', 'lower-middle', 'lower-middle', 'middle'];
    case 'middle':
      return ['lower-middle', 'middle', 'middle', 'upper-middle'];
    case 'upper-middle':
      return ['middle', 'upper-middle', 'upper-middle', 'wealthy'];
    default:
      return ['upper-middle', 'wealthy', 'wealthy', 'very-wealthy'];
  }
}

/** An NPC household of its own (for classmates, colleagues and new partners). */
export function newNpcHousehold(world: World, locationId: string, wealth: WealthTier): Household {
  const { location } = getLocation(locationId);
  return addHousehold(world, locationId, wealth, location.kind === 'rural');
}

/**
 * Classmates for a new school stage: local children of about the same age who already
 * exist are reused first; the rest are new (their families are background population).
 */
export function schoolCohort(
  world: World,
  student: Character,
  size: number,
  teacherLabel: string,
): Character[] {
  const age = ageYearsOf(world, student);
  const existing = Object.keys(world.characters)
    .sort()
    .map((id) => world.characters[id] as Character)
    .filter(
      (c) =>
        c.id !== student.id &&
        c.death === null &&
        c.tier !== 'archived' &&
        c.locationId === student.locationId &&
        Math.abs(ageYearsOf(world, c) - age) <= 1 &&
        c.householdId !== student.householdId,
    );
  const cohort = existing.slice(0, size);
  const home = world.households[student.householdId];
  while (cohort.length < size) {
    const household = newNpcHousehold(
      world,
      student.locationId,
      withRng(world, 'npc', (rng) => rng.pick(neighbourWealth(home?.wealth ?? 'middle'))),
    );
    const kid = createNpc(world, {
      countryCode: student.countryCode,
      householdId: household.id,
      ageYears: Math.max(0, age + withRng(world, 'npc', (rng) => rng.range(-1, 0))),
      tier: 'relevant',
    });
    cohort.push(kid);
  }
  for (const kid of cohort) {
    const rel = world.relationships;
    const known = Object.values(rel).some((r) => r.aId === student.id && r.bId === kid.id);
    if (known) {
      const r = Object.values(rel).find((x) => x.aId === student.id && x.bId === kid.id);
      if (r && (r.type === 'neighbour' || r.type === 'acquaintance')) {
        r.type = 'classmate';
        const back = Object.values(rel).find((x) => x.aId === kid.id && x.bId === student.id);
        if (back) back.type = 'classmate';
      }
    } else {
      linkPair(world, student, kid, 'classmate', 'classmate', {
        closeness: withRng(world, 'social', (rng) => rng.range(10, 35)),
      });
    }
  }
  // A teacher for the stage.
  const teacherHousehold = newNpcHousehold(world, student.locationId, 'middle');
  const teacher = createNpc(world, {
    countryCode: student.countryCode,
    householdId: teacherHousehold.id,
    ageYears: withRng(world, 'npc', (rng) => rng.range(26, 60)),
    tier: 'relevant',
  });
  teacher.education.qualifications = ['upperSecondary', `bachelor:${teacherLabel}`];
  teacher.flags['role.teacher'] = true;
  linkPair(world, student, teacher, 'teacher', 'acquaintance', { closeness: 30, respect: 60 });
  return cohort;
}

/** New acquaintances of a given age range (club members, classmates, colleagues). */
export function meetPeople(
  world: World,
  person: Character,
  count: number,
  type: RelationType,
  ageRange: [number, number],
): Character[] {
  const out: Character[] = [];
  for (let i = 0; i < count; i++) {
    const household = newNpcHousehold(
      world,
      person.locationId,
      withRng(world, 'npc', (rng) => rng.pick(neighbourWealth('middle'))),
    );
    const npc = createNpc(world, {
      countryCode: person.countryCode,
      householdId: household.id,
      ageYears: withRng(world, 'npc', (rng) => rng.range(ageRange[0], ageRange[1])),
      tier: 'relevant',
    });
    if (ageYearsOf(world, npc) >= 18) assignAdultEducation(world, npc, household.wealth);
    linkPair(world, person, npc, type, type === 'manager' ? 'colleague' : type, {
      closeness: withRng(world, 'social', (rng) => rng.range(15, 40)),
    });
    out.push(npc);
  }
  return out;
}

/** A potential partner for an adult: of compatible age, single, in the same city. */
export function createPotentialPartner(world: World, person: Character): Character {
  const age = ageYearsOf(world, person);
  const household = newNpcHousehold(
    world,
    person.locationId,
    world.households[person.householdId]?.wealth ?? 'middle',
  );
  const gender: Gender | undefined =
    person.identity.gender === 'nonbinary'
      ? undefined
      : withRng(world, 'social', (rng) =>
          rng.int(10) < 9
            ? person.identity.gender === 'female'
              ? 'male'
              : 'female'
            : person.identity.gender,
        );
  const partner = createNpc(world, {
    countryCode: person.countryCode,
    householdId: household.id,
    ageYears: Math.max(18, age + withRng(world, 'social', (rng) => rng.range(-5, 5))),
    tier: 'relevant',
    ...(gender ? { gender } : {}),
  });
  assignAdultEducation(world, partner, household.wealth);
  return partner;
}

export { ageYearsOf };
