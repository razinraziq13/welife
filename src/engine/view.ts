import { ageOf, monthsUntilBirthday, type Age } from './core/clock';
import { activeCharacter, isAlive } from './core/world';
import { listActivities, timeBudget, type ActivityAvailability } from './activities/activities';
import { displayName } from './characters/names';
import { lifeStage, type LifeStage } from './characters/stats';
import { getEvent } from './content';
import { choiceAvailability } from './events/runtime';
import { getCountry, getLocation } from './world/countries';
import type { SimState } from './core/commands';
import type {
  Appearance,
  BiographyEntry,
  Character,
  Habits,
  Household,
  Identity,
  Needs,
  Notification,
  Relationship,
  Skills,
  StatChange,
  Stats,
  World,
  YearMonth,
} from './state/schema';

/**
 * Read-only projection of the simulation for the UI. The UI renders this; it never sees
 * or mutates the authoritative world directly.
 */

export interface PersonView {
  id: string;
  identity: Identity;
  displayName: string;
  age: Age;
  stage: LifeStage;
  alive: boolean;
  appearance: Appearance;
  /** Relationship to the player, from the player's side. */
  relation: Relationship['type'] | null;
  closeness: number | null;
  birth: YearMonth;
  death: YearMonth | null;
}

export interface PendingEventView {
  instanceId: string;
  definitionId: string;
  /** In-game month the decision belongs to (the month being advanced into). */
  clock: YearMonth;
  choices: { id: string; available: boolean }[];
}

export interface GameView {
  worldId: string;
  seed: string;
  clock: YearMonth;
  tick: number;
  rules: World['rules'];
  ruleChanges: World['ruleChanges'];
  lifeStatus: World['lifeStatus'];
  character: PersonView & {
    stats: Stats;
    needs: Needs;
    skills: Skills;
    habits: Habits;
    statLog: StatChange[];
    location: { id: string; name: string; region: string; kind: 'city' | 'rural' };
    countryCode: string;
    nextBirthdayInMonths: number;
    deathCause: string | null;
  };
  household: {
    wealth: Household['wealth'];
    scenario: Household['scenario'];
    flags: Household['flags'];
    originCountryCode: string | null;
    familyTrade: string | null;
    members: PersonView[];
  };
  country: {
    code: string;
    name: string;
    currency: { code: string; exponent: number; symbol: string };
    medianMonthlyWageMinor: number;
    costOfLivingIndex: number;
    locationCostIndex: number;
    lifeExpectancy: number;
    sourceStatus: string;
    sourceAsOf: string;
  };
  time: { totalHours: number; usedHours: number };
  activities: ActivityAvailability[];
  feed: BiographyEntry[];
  notifications: Notification[];
  unreadCount: number;
  pendingEvent: PendingEventView | null;
}

function personView(world: World, c: Character, player: Character): PersonView {
  const age = ageOf(c.birth, c.death ?? world.clock);
  const rel =
    c.id === player.id
      ? null
      : (Object.values(world.relationships).find((r) => r.aId === player.id && r.bId === c.id) ??
        null);
  return {
    id: c.id,
    identity: c.identity,
    displayName: displayName(c.identity),
    age,
    stage: lifeStage(age.years),
    alive: isAlive(c),
    appearance: c.appearance,
    relation: rel?.type ?? null,
    closeness: rel?.closeness ?? null,
    birth: c.birth,
    death: c.death,
  };
}

export const FEED_LIMIT = 80;

export function projectGame(state: SimState): GameView {
  const world = state.world;
  const player = activeCharacter(world);
  const household = world.households[player.householdId];
  if (!household) throw new Error('Player household missing');
  const { country, location } = getLocation(player.locationId);
  const profile = getCountry(country.code);
  const budget = timeBudget(world);

  let pendingEvent: PendingEventView | null = null;
  const pendingWorld = state.pending;
  if (pendingWorld?.events.pendingInstanceId) {
    const instance = pendingWorld.events.instances[pendingWorld.events.pendingInstanceId];
    if (instance) {
      getEvent(instance.definitionId);
      pendingEvent = {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        clock: pendingWorld.clock,
        choices: choiceAvailability(pendingWorld, instance.id),
      };
    }
  }

  const members = household.memberIds
    .filter((id) => id !== player.id)
    .map((id) => world.characters[id])
    .filter((c): c is Character => c !== undefined)
    .map((c) => personView(world, c, player));

  return {
    worldId: world.id,
    seed: world.seed,
    clock: world.clock,
    tick: world.tick,
    rules: world.rules,
    ruleChanges: world.ruleChanges,
    lifeStatus: world.lifeStatus,
    character: {
      ...personView(world, player, player),
      stats: player.stats,
      needs: player.needs,
      skills: player.skills,
      habits: player.habits,
      statLog: player.statLog.slice(-30),
      location: {
        id: location.id,
        name: location.name,
        region: location.region,
        kind: location.kind,
      },
      countryCode: player.countryCode,
      nextBirthdayInMonths: monthsUntilBirthday(player.birth, world.clock),
      deathCause: player.deathCause,
    },
    household: {
      wealth: household.wealth,
      scenario: household.scenario,
      flags: household.flags,
      originCountryCode: household.originCountryCode,
      familyTrade: household.familyTrade,
      members,
    },
    country: {
      code: profile.code,
      name: profile.name,
      currency: profile.currency,
      medianMonthlyWageMinor: profile.economy.medianMonthlyWageMinor,
      costOfLivingIndex: profile.economy.costOfLivingIndex,
      locationCostIndex: location.costIndex,
      lifeExpectancy: profile.lifeExpectancy,
      sourceStatus: profile.source.status,
      sourceAsOf: profile.source.asOf,
    },
    time: { totalHours: budget.total, usedHours: budget.used },
    activities: world.lifeStatus === 'alive' ? listActivities(world) : [],
    feed: world.biography.filter((b) => b.characterId === player.id).slice(-FEED_LIMIT),
    notifications: world.notifications.slice(-100),
    unreadCount: world.notifications.filter((n) => !n.read).length,
    pendingEvent,
  };
}

/** Summary shown in the save-slot list. */
export interface SaveSummary {
  characterName: string;
  ageYears: number;
  countryCode: string;
  clock: YearMonth;
  lifeStatus: World['lifeStatus'];
  appearance: Appearance;
  stage: LifeStage;
}

export function summarizeWorld(world: World): SaveSummary {
  const player = activeCharacter(world);
  const age = ageOf(player.birth, player.death ?? world.clock);
  return {
    characterName: displayName(player.identity),
    ageYears: age.years,
    countryCode: player.countryCode,
    clock: world.clock,
    lifeStatus: world.lifeStatus,
    appearance: player.appearance,
    stage: lifeStage(age.years),
  };
}
