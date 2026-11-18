import type { Rng } from '../core/rng';
import { nextId } from '../core/world';
import type { Location } from '../world/countrySchema';
import {
  HABIT_KEYS,
  NEED_KEYS,
  SKILL_KEYS,
  type Appearance,
  type Character,
  type CharacterFinance,
  type EducationState,
  type Habits,
  type Household,
  type Identity,
  type Needs,
  type Skills,
  type Stats,
  type Traits,
  type World,
  type YearMonth,
} from '../state/schema';

/** Shared builders for characters and households (player, family and NPCs). */

export function zeroRecord<K extends string>(keys: readonly K[], value: number): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = value;
  return out;
}

export function emptyEducation(): EducationState {
  return {
    current: null,
    history: [],
    effort: 'steady',
    clubs: [],
    qualifications: [],
    awards: [],
    applications: [],
    reports: [],
  };
}

export function emptyFinance(tick: number): CharacterFinance {
  return {
    checkingId: null,
    savingsId: null,
    retirementId: null,
    creditScore: 600,
    pensionBp: 0,
    retired: false,
    contributionMonths: 0,
    pensionableEarnings: 0n,
    taxYear: { startTick: tick, gross: 0n, withheld: 0n, social: 0n },
    cleanMonths: 0,
    benefitMonths: 0,
    benefitMinor: 0n,
  };
}

export function adultSkills(rng: Rng): Skills {
  const skills = zeroRecord(SKILL_KEYS, 0);
  for (const key of SKILL_KEYS) skills[key] = rng.range(100, 550);
  return skills;
}

/** Skills for a child of the given age (grows roughly with age). */
export function childSkills(rng: Rng, ageYears: number): Skills {
  const skills = zeroRecord(SKILL_KEYS, 0);
  const cap = Math.min(450, Math.max(0, ageYears * 25));
  for (const key of SKILL_KEYS) skills[key] = cap === 0 ? 0 : rng.range(0, cap);
  return skills;
}

export function npcStats(rng: Rng, reputation: number): Stats {
  return {
    health: rng.range(600, 900),
    happiness: rng.range(450, 750),
    intelligence: rng.range(350, 700),
    energy: rng.range(550, 800),
    stress: rng.range(200, 500),
    socialSkill: rng.range(350, 700),
    discipline: rng.range(350, 700),
    reputation: Math.max(0, Math.min(1000, reputation + rng.range(-50, 50))),
    confidence: rng.range(350, 700),
    creativity: rng.range(300, 700),
  };
}

export interface NewCharacterInput {
  identity: Identity;
  birth: YearMonth;
  location: Location;
  countryCode: string;
  householdId: string;
  tier: Character['tier'];
  stats: Stats;
  skills: Skills;
  traits: Traits;
  appearance: Appearance;
  interests: Character['interests'];
  needs?: Needs;
  habits?: Habits;
  death?: YearMonth | null;
}

export function addCharacter(world: World, input: NewCharacterInput): Character {
  const character: Character = {
    id: nextId(world, 'chr'),
    identity: input.identity,
    birth: input.birth,
    death: input.death ?? null,
    deathCause: input.death ? 'natural' : null,
    locationId: input.location.id,
    countryCode: input.countryCode,
    householdId: input.householdId,
    tier: input.tier,
    stats: input.stats,
    needs: input.needs ?? zeroRecord(NEED_KEYS, 750),
    skills: input.skills,
    traits: input.traits,
    habits: input.habits ?? zeroRecord(HABIT_KEYS, 0),
    interests: input.interests,
    appearance: input.appearance,
    flags: {},
    partnership: null,
    education: emptyEducation(),
    employmentId: null,
    finance: null,
    statLog: [],
  };
  world.characters[character.id] = character;
  return character;
}

export const NO_HOUSEHOLD_FLAGS: Household['flags'] = {
  royal: false,
  noble: false,
  political: false,
  businessHeir: false,
  immigrant: false,
  rural: false,
  singleParent: false,
  adopted: false,
};

/** A household for NPCs whose money is not tracked individually. */
export function addHousehold(
  world: World,
  locationId: string,
  wealth: Household['wealth'],
  rural: boolean,
): Household {
  const household: Household = {
    id: nextId(world, 'hh'),
    locationId,
    memberIds: [],
    wealth,
    scenario:
      wealth === 'low' || wealth === 'lower-middle'
        ? 'lowIncome'
        : wealth === 'middle'
          ? 'middle'
          : 'wealthy',
    originCountryCode: null,
    flags: { ...NO_HOUSEHOLD_FLAGS, rural },
    familyTrade: null,
    finance: null,
  };
  world.households[household.id] = household;
  return household;
}

/** Moves a character to another household (both member lists stay consistent). */
export function moveToHousehold(world: World, character: Character, householdId: string): void {
  const from = world.households[character.householdId];
  if (from) from.memberIds = from.memberIds.filter((id) => id !== character.id);
  const to = world.households[householdId];
  if (!to) throw new Error(`Unknown household ${householdId}`);
  if (!to.memberIds.includes(character.id)) to.memberIds.push(character.id);
  character.householdId = householdId;
  character.locationId = to.locationId;
}

/** Deletes households nobody lives in (except tracked ones still owning accounts). */
export function removeEmptyHouseholds(world: World): void {
  for (const id of Object.keys(world.households).sort()) {
    const h = world.households[id];
    if (!h || h.memberIds.length > 0) continue;
    const owns = Object.values(world.ledger.accounts).some((a) => a.ownerId === id);
    if (!owns) Reflect.deleteProperty(world.households, id);
  }
}
