import { z } from 'zod';
import { Rng } from '../core/rng';
import { addMonths, monthIndex } from '../core/clock';
import { addBiography, addNotification, nextId, withRng } from '../core/world';
import { assertInvariants } from '../core/invariants';
import { CONTENT_VERSION } from '../content';
import { COUNTRIES, findCountry, findLocation } from '../world/countries';
import type { CountryProfile, Location } from '../world/countrySchema';
import {
  AppearanceSchema,
  DIFFICULTIES,
  GENDERS,
  NEED_KEYS,
  RNG_STREAMS,
  SCENARIO_IDS,
  SKILL_KEYS,
  WORLD_SCHEMA_VERSION,
  YearMonthSchema,
  type Appearance,
  type Character,
  type ConcreteScenarioId,
  type Gender,
  type Household,
  type Identity,
  type Needs,
  type Relationship,
  type Skills,
  type Stats,
  type Traits,
  type WealthTier,
  type World,
  type YearMonth,
} from '../state/schema';
import { inheritAppearance, inheritTraits, randomAppearance, randomTraits } from './genetics';
import { addCharacter as addCharacterRecord, adultSkills, npcStats, zeroRecord } from './factory';
import { initializeSystems } from '../core/setup';
import { linkPair, randomInterests } from '../social/relationships';
import { birthCivic, religionFor } from '../civics/status';
import { initLegacy } from '../legacy/legacy';
import {
  FAMILY_TRADES,
  availableConcreteScenarios,
  getScenario,
  scenarioAvailability,
} from './scenarios';

export const NewLifeInputSchema = z
  .object({
    seed: z.string().trim().min(1).max(64),
    start: YearMonthSchema.refine((ym) => ym.year >= 2026 && ym.year <= 2200, {
      message: 'Lives start in the present day (2026 or later).',
    }),
    countryCode: z.string().length(2),
    locationId: z.string().min(1).max(40).nullable(),
    scenario: z.enum(SCENARIO_IDS),
    originCountryCode: z.string().length(2).nullable(),
    difficulty: z.enum(DIFFICULTIES),
    easyMigration: z.boolean(),
    identity: z
      .object({
        firstName: z.string().trim().min(1).max(40).nullable(),
        lastName: z.string().trim().min(1).max(40).nullable(),
        gender: z.enum(GENDERS).nullable(),
      })
      .strict(),
    appearance: AppearanceSchema.nullable(),
  })
  .strict();
export type NewLifeInput = z.infer<typeof NewLifeInputSchema>;

export type CreationErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_COUNTRY'
  | 'UNKNOWN_LOCATION'
  | 'SCENARIO_UNAVAILABLE'
  | 'INVALID_ORIGIN';

export class CreationError extends Error {
  readonly code: CreationErrorCode;
  constructor(code: CreationErrorCode, message: string) {
    super(message);
    this.name = 'CreationError';
    this.code = code;
  }
}

const REPUTATION_BY_WEALTH: Record<WealthTier, number> = {
  low: 400,
  'lower-middle': 420,
  middle: 450,
  'upper-middle': 500,
  wealthy: 550,
  'very-wealthy': 600,
  royal: 750,
};

interface NewCharacterInput {
  identity: Identity;
  birth: YearMonth;
  location: Location;
  country: CountryProfile;
  householdId: string;
  tier: Character['tier'];
  stats: Stats;
  skills: Skills;
  traits: Traits;
  appearance: Appearance;
  needs?: Needs;
}

function addCharacter(world: World, input: NewCharacterInput): Character {
  return addCharacterRecord(world, {
    identity: input.identity,
    birth: input.birth,
    location: input.location,
    countryCode: input.country.code,
    householdId: input.householdId,
    tier: input.tier,
    stats: input.stats,
    skills: input.skills,
    traits: input.traits,
    appearance: input.appearance,
    interests: randomInterests(world),
    ...(input.needs ? { needs: input.needs } : {}),
  });
}

function addRelationshipPair(
  world: World,
  a: Character,
  b: Character,
  typeOfB: Relationship['type'],
  typeOfA: Relationship['type'],
  closeness: number,
): void {
  linkPair(world, a, b, typeOfB, typeOfA, { closeness, respect: 60 });
}

function titleFor(
  country: CountryProfile,
  scenario: ConcreteScenarioId,
  gender: Gender,
): string | null {
  const titles =
    scenario === 'royal'
      ? country.monarchy.royalTitle
      : scenario === 'noble'
        ? country.monarchy.nobleTitle
        : null;
  if (!titles) return null;
  if (gender === 'nonbinary') return titles.female === titles.male ? titles.female : null;
  return titles[gender];
}

/** Creates a new world with the player born in its first month (spec §4: no advance on creation). */
export function createWorld(worldId: string, rawInput: unknown): World {
  const parsed = NewLifeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new CreationError(
      'INVALID_INPUT',
      first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input.',
    );
  }
  const input = parsed.data;

  const country = findCountry(input.countryCode);
  if (!country) throw new CreationError('UNKNOWN_COUNTRY', `Unknown country ${input.countryCode}.`);

  const rng: World['rng'] = {} as World['rng'];
  for (const stream of RNG_STREAMS) rng[stream] = Rng.fromSeed(`${input.seed}::${stream}`).state();

  const world: World = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    id: worldId,
    seed: input.seed,
    contentVersion: CONTENT_VERSION,
    startIndex: monthIndex(input.start),
    clock: { ...input.start },
    tick: 0,
    rng,
    nextId: 1,
    rules: { difficulty: input.difficulty, easyMigration: input.easyMigration },
    ruleChanges: [],
    activeCharacterId: '',
    lifeStatus: 'alive',
    characters: {},
    households: {},
    familyLinks: {},
    relationships: {},
    memories: {},
    events: {
      instances: {},
      lastFiredTick: {},
      firedCount: {},
      scheduled: [],
      pendingInstanceId: null,
    },
    activity: { tick: 0, counts: {}, hoursUsed: 0 },
    employment: {},
    jobs: { postings: {}, applications: {}, refreshedTick: 0 },
    ledger: { accounts: {}, journal: {}, history: {} },
    insurance: {},
    economy: {},
    calendar: { plans: [], items: [] },
    expecting: [],
    businesses: {},
    competitors: {},
    properties: {},
    propertyListings: {},
    civics: { applications: {}, conditions: {}, cases: {}, service: {}, politics: {}, royal: {} },
    legacy: { generation: 1, lineage: [], wills: {}, estates: [], succession: null },
    media: { profiles: {}, trends: {} },
    achievements: {},
    contentPacks: [],
    notifications: [],
    biography: [],
    recentCommandIds: [],
  };

  // Scenario.
  let scenarioId: ConcreteScenarioId;
  if (input.scenario === 'random') {
    const options = availableConcreteScenarios(country);
    scenarioId = withRng(world, 'creation', (r) => r.pick(options));
  } else {
    if (!scenarioAvailability(input.scenario, country).available) {
      throw new CreationError(
        'SCENARIO_UNAVAILABLE',
        `The ${input.scenario} scenario is not available in ${country.name}.`,
      );
    }
    scenarioId = input.scenario;
  }
  const scenario = getScenario(scenarioId);

  // Location.
  let location: Location;
  if (input.locationId !== null) {
    const found = findLocation(input.locationId);
    if (found?.country.code !== country.code) {
      throw new CreationError('UNKNOWN_LOCATION', `Unknown location for ${country.name}.`);
    }
    location = found.location;
  } else {
    const candidates = country.locations.filter((l) =>
      scenarioId === 'rural' ? l.kind === 'rural' : l.kind === 'city',
    );
    location = withRng(world, 'creation', (r) => r.pick(candidates));
  }
  if (scenarioId === 'rural' && location.kind !== 'rural') {
    throw new CreationError('UNKNOWN_LOCATION', 'The rural scenario needs a rural location.');
  }

  // Origin (immigrant families).
  let origin: CountryProfile | null = null;
  if (scenarioId === 'immigrant') {
    if (input.originCountryCode !== null) {
      origin = findCountry(input.originCountryCode) ?? null;
      if (!origin || origin.code === country.code) {
        throw new CreationError('INVALID_ORIGIN', 'Choose a different country of origin.');
      }
    } else {
      const others = COUNTRIES.filter((c) => c.code !== country.code);
      origin = withRng(world, 'creation', (r) => r.pick(others));
    }
  }
  const nameSource = origin ?? country;

  const creation = new Rng(world.rng.creation);
  const genetics = new Rng(world.rng.genetics);

  const wealth = creation.pick(scenario.wealth);
  const familyTrade = scenarioId === 'businessHeir' ? creation.pick(FAMILY_TRADES) : null;
  const particle = scenarioId === 'noble' ? country.monarchy.nobleParticle : null;
  const baseFamilyName = input.identity.lastName ?? creation.pick(nameSource.names.family);
  const familyName =
    particle && input.identity.lastName === null ? `${particle} ${baseFamilyName}` : baseFamilyName;
  const keepsOwnSurname = nameSource.code === 'KR' || nameSource.code === 'CN';

  const householdId = nextId(world, 'hh');
  const reputation =
    REPUTATION_BY_WEALTH[wealth] +
    (scenarioId === 'political' ? 100 : 0) +
    (scenarioId === 'noble' ? 50 : 0);

  const makeIdentity = (gender: Gender, firstName: string, lastName: string): Identity => ({
    firstName,
    lastName,
    gender,
    title: null,
    nameOrder: nameSource.names.order,
  });

  // Parents.
  const parentGenders: Gender[] =
    scenario.parents === 'single' ? [creation.int(10) < 8 ? 'female' : 'male'] : ['female', 'male'];
  const parents: Character[] = parentGenders.map((gender) => {
    const ageYears = creation.range(scenario.parentAge[0], scenario.parentAge[1]);
    const birth = addMonths(input.start, -(ageYears * 12 + creation.int(12)));
    const list = gender === 'female' ? nameSource.names.female : nameSource.names.male;
    const lastName =
      keepsOwnSurname && gender === 'female' ? creation.pick(nameSource.names.family) : familyName;
    return addCharacter(world, {
      identity: makeIdentity(gender, creation.pick(list), lastName),
      birth,
      location,
      country,
      householdId,
      tier: 'close',
      stats: npcStats(creation, reputation),
      skills: adultSkills(creation),
      traits: randomTraits(genetics),
      appearance: randomAppearance(genetics),
    });
  });

  // Older siblings.
  const youngestParentYears = Math.min(
    ...parents.map((p) => Math.floor((monthIndex(input.start) - monthIndex(p.birth)) / 12)),
  );
  const maxSiblingAge = Math.min(10, youngestParentYears - 18);
  const siblingCount =
    maxSiblingAge >= 1
      ? creation.weighted([
          { value: 0, weight: 45 },
          { value: 1, weight: 35 },
          { value: 2, weight: 20 },
        ])
      : 0;
  const biologicalParents = scenario.parents === 'adoptive' ? [] : parents;
  const siblings: Character[] = [];
  for (let i = 0; i < siblingCount; i++) {
    const ageYears = creation.range(1, maxSiblingAge);
    const gender: Gender = creation.int(2) === 0 ? 'female' : 'male';
    const list = gender === 'female' ? nameSource.names.female : nameSource.names.male;
    const siblingStats = npcStats(creation, reputation);
    siblings.push(
      addCharacter(world, {
        identity: makeIdentity(gender, creation.pick(list), familyName),
        birth: addMonths(input.start, -(ageYears * 12 + creation.int(12))),
        location,
        country,
        householdId,
        tier: 'close',
        stats: { ...siblingStats, stress: creation.range(100, 300) },
        skills: zeroRecord(SKILL_KEYS, 0),
        traits: inheritTraits(
          genetics,
          parents.map((p) => p.traits),
        ),
        appearance: inheritAppearance(
          genetics,
          parents.map((p) => p.appearance),
        ),
      }),
    );
  }

  // The player, born this month.
  const gender: Gender = input.identity.gender ?? (creation.int(2) === 0 ? 'female' : 'male');
  const givenList =
    gender === 'female'
      ? nameSource.names.female
      : gender === 'male'
        ? nameSource.names.male
        : [...nameSource.names.female, ...nameSource.names.male];
  const firstSource = origin && creation.int(2) === 0 ? country : nameSource;
  const firstList =
    firstSource === nameSource
      ? givenList
      : gender === 'female'
        ? firstSource.names.female
        : gender === 'male'
          ? firstSource.names.male
          : [...firstSource.names.female, ...firstSource.names.male];
  const identity: Identity = {
    firstName: input.identity.firstName ?? creation.pick(firstList),
    lastName: familyName,
    gender,
    title: titleFor(country, scenarioId, gender),
    nameOrder: nameSource.names.order,
  };
  const bioParentTraits = biologicalParents.map((p) => p.traits);
  const playerTraits =
    bioParentTraits.length > 0 ? inheritTraits(genetics, bioParentTraits) : randomTraits(genetics);
  const appearance =
    input.appearance ??
    (biologicalParents.length > 0
      ? inheritAppearance(
          genetics,
          biologicalParents.map((p) => p.appearance),
        )
      : randomAppearance(genetics));
  const parentIntelligence =
    biologicalParents.length > 0
      ? Math.floor(
          biologicalParents.reduce((sum, p) => sum + p.stats.intelligence, 0) /
            biologicalParents.length,
        )
      : 500;

  const player = addCharacter(world, {
    identity,
    birth: { ...input.start },
    location,
    country,
    householdId,
    tier: 'close',
    stats: {
      health: creation.range(750, 950),
      happiness: creation.range(650, 850),
      intelligence: Math.min(1000, Math.floor((parentIntelligence + creation.range(350, 650)) / 2)),
      energy: 800,
      stress: creation.range(100, 250),
      socialSkill: creation.range(300, 500),
      discipline: creation.range(300, 500),
      reputation: Math.min(1000, reputation),
      confidence: creation.range(450, 600),
      creativity: creation.range(350, 650),
    },
    skills: zeroRecord(SKILL_KEYS, 0),
    traits: playerTraits,
    appearance,
    needs: zeroRecord(NEED_KEYS, 800),
  });
  world.activeCharacterId = player.id;

  world.rng.creation = creation.state();
  world.rng.genetics = genetics.state();

  // Household.
  const flags: Household['flags'] = {
    royal: false,
    noble: false,
    political: false,
    businessHeir: false,
    immigrant: false,
    rural: location.kind === 'rural',
    singleParent: false,
    adopted: false,
    ...scenario.flags,
  };
  world.households[householdId] = {
    id: householdId,
    locationId: location.id,
    memberIds: [...parents.map((p) => p.id), ...siblings.map((s) => s.id), player.id],
    wealth,
    scenario: scenarioId,
    originCountryCode: origin?.code ?? null,
    flags,
    familyTrade,
    finance: null,
  };

  // Citizenship and belief (Milestone 6): immigrant parents keep their citizenship and are
  // permanent residents; children follow the birth country's rules.
  if (origin) {
    for (const parent of parents) {
      parent.civic = {
        ...parent.civic,
        citizenships: [origin.code],
        residence: {
          countryCode: country.code,
          status: 'permanent',
          route: null,
          sinceTick: 0,
          expiresTick: null,
        },
        religion: religionFor(householdId, origin.code),
      };
      parent.civic.participation = parent.civic.religion === 'none' ? 'none' : 'occasional';
    }
  }
  for (const child of [...siblings, player]) birthCivic(world, child, parents, country.code);

  // Family links and relationships.
  const linkType = scenario.parents === 'adoptive' ? 'adoptive' : 'biological';
  for (const parent of parents) {
    for (const child of [...siblings, player]) {
      const id = nextId(world, 'fam');
      const type = child === player ? linkType : 'biological';
      world.familyLinks[id] = { id, parentId: parent.id, childId: child.id, type };
    }
    addRelationshipPair(
      world,
      player,
      parent,
      'parent',
      'child',
      withRng(world, 'creation', (r) => r.range(70, 90)),
    );
  }
  for (const sibling of siblings) {
    addRelationshipPair(
      world,
      player,
      sibling,
      'sibling',
      'sibling',
      withRng(world, 'creation', (r) => r.range(50, 80)),
    );
  }

  addBiography(world, player.id, 'life', 'bio.born', {
    location: location.name,
    country: country.name,
  });
  addBiography(world, player.id, 'family', `bio.scenario.${scenarioId}`, {
    origin: origin?.name ?? '',
    trade: familyTrade ?? '',
  });
  addNotification(world, 'life', 'ntf.welcome', { name: identity.firstName }, 'life');

  initializeSystems(world);
  initLegacy(world);
  assertInvariants(world);
  return world;
}
