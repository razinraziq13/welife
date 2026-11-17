import type { CountryProfile } from '../world/countrySchema';
import type { ConcreteScenarioId, Household, ScenarioId, WealthTier } from '../state/schema';

/** Starting scenarios (spec §1). Descriptions live in the UI's localisation table. */
export interface ScenarioDefinition {
  id: ConcreteScenarioId;
  wealth: readonly WealthTier[];
  parents: 'two' | 'single' | 'adoptive';
  flags: Partial<Household['flags']>;
  /** Parent age range at the player's birth. */
  parentAge: readonly [number, number];
}

export const SCENARIOS: readonly ScenarioDefinition[] = [
  { id: 'royal', wealth: ['royal'], parents: 'two', flags: { royal: true }, parentAge: [24, 40] },
  {
    id: 'noble',
    wealth: ['wealthy', 'very-wealthy'],
    parents: 'two',
    flags: { noble: true },
    parentAge: [25, 40],
  },
  {
    id: 'wealthy',
    wealth: ['wealthy', 'very-wealthy'],
    parents: 'two',
    flags: {},
    parentAge: [26, 42],
  },
  {
    id: 'middle',
    wealth: ['middle', 'upper-middle'],
    parents: 'two',
    flags: {},
    parentAge: [24, 40],
  },
  {
    id: 'lowIncome',
    wealth: ['low', 'lower-middle'],
    parents: 'two',
    flags: {},
    parentAge: [19, 36],
  },
  {
    id: 'immigrant',
    wealth: ['low', 'lower-middle', 'middle'],
    parents: 'two',
    flags: { immigrant: true },
    parentAge: [23, 40],
  },
  {
    id: 'singleParent',
    wealth: ['low', 'lower-middle', 'middle'],
    parents: 'single',
    flags: { singleParent: true },
    parentAge: [19, 40],
  },
  {
    id: 'adopted',
    wealth: ['lower-middle', 'middle', 'upper-middle'],
    parents: 'adoptive',
    flags: { adopted: true },
    parentAge: [28, 45],
  },
  {
    id: 'political',
    wealth: ['upper-middle', 'wealthy'],
    parents: 'two',
    flags: { political: true },
    parentAge: [27, 45],
  },
  {
    id: 'businessHeir',
    wealth: ['wealthy', 'very-wealthy'],
    parents: 'two',
    flags: { businessHeir: true },
    parentAge: [27, 45],
  },
  {
    id: 'rural',
    wealth: ['low', 'lower-middle', 'middle'],
    parents: 'two',
    flags: { rural: true },
    parentAge: [20, 38],
  },
];

export const FAMILY_TRADES = [
  'restaurants',
  'textiles',
  'logistics',
  'construction',
  'hotels',
  'electronics',
] as const;

export function getScenario(id: ConcreteScenarioId): ScenarioDefinition {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown scenario ${id}`);
  return scenario;
}

export interface ScenarioAvailability {
  available: boolean;
  /** Localisation key explaining why the scenario is unavailable. */
  reasonKey: string | null;
}

/** Royal/noble/rural options only where real for the country (spec §1, §8; decisions D4/D5). */
export function scenarioAvailability(
  id: ScenarioId,
  country: CountryProfile,
): ScenarioAvailability {
  if (id === 'royal' && !country.monarchy.royalBirthAvailable) {
    return { available: false, reasonKey: 'scenario.unavailable.royal' };
  }
  if (id === 'noble' && !country.monarchy.nobilityAvailable) {
    return { available: false, reasonKey: 'scenario.unavailable.noble' };
  }
  if (id === 'rural' && !country.locations.some((l) => l.kind === 'rural')) {
    return { available: false, reasonKey: 'scenario.unavailable.rural' };
  }
  return { available: true, reasonKey: null };
}

export function availableConcreteScenarios(country: CountryProfile): ConcreteScenarioId[] {
  return SCENARIOS.filter((s) => scenarioAvailability(s.id, country).available).map((s) => s.id);
}
