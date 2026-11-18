import { ageOf } from '../core/clock';
import { addBiography, activeCharacter } from '../core/world';
import { changeHabit, changeNeed, changeSkill, changeStat } from '../characters/stats';
import { adjustFamilyCloseness } from '../events/effects';
import { timeBudget } from '../calendar/time';
import type { HabitKey, NeedKey, SkillKey, StatKey, WealthTier, World } from '../state/schema';

/**
 * Personal activities (spec §4 Actions): players may attempt any number, but each costs
 * free time and energy, and repeating the same activity in one month gives diminishing
 * returns: effectiveGain = baseGain / (1 + 0.35 x timesAlreadyThisMonth).
 *
 * All numbers below are PROPOSED TUNING VALUES (fixed-point tenths for stats/needs/skills).
 */

export const DIMINISHING_COEFFICIENT_PERCENT = 35;

export type ActivityCategory = 'play' | 'learn' | 'health' | 'creative' | 'social' | 'rest';

export type ActivityGain =
  | { kind: 'stat'; key: StatKey; base: number }
  | { kind: 'need'; key: NeedKey; base: number }
  | { kind: 'skill'; key: SkillKey; base: number };

export interface ActivityDefinition {
  id: string;
  category: ActivityCategory;
  minAgeMonths: number;
  maxAgeYears: number | null;
  /** Free hours used per attempt. */
  hours: number;
  /** Energy used per attempt (tenths). Negative values restore energy. */
  energy: number;
  gains: readonly ActivityGain[];
  /** Habit reinforced by the first attempt each month. */
  habit: HabitKey | null;
  /** Closeness change with parents (first attempt each month). */
  parentCloseness: number;
}

export const ACTIVITIES: readonly ActivityDefinition[] = [
  {
    id: 'play-toys',
    category: 'play',
    minAgeMonths: 0,
    maxAgeYears: 8,
    hours: 8,
    energy: 40,
    gains: [
      { kind: 'stat', key: 'happiness', base: 40 },
      { kind: 'stat', key: 'creativity', base: 15 },
      { kind: 'need', key: 'leisure', base: 150 },
    ],
    habit: null,
    parentCloseness: 0,
  },
  {
    id: 'family-time',
    category: 'social',
    minAgeMonths: 0,
    maxAgeYears: null,
    hours: 6,
    energy: 20,
    gains: [
      { kind: 'stat', key: 'happiness', base: 30 },
      { kind: 'need', key: 'social', base: 150 },
      { kind: 'stat', key: 'stress', base: -20 },
    ],
    habit: null,
    parentCloseness: 2,
  },
  {
    id: 'rest-well',
    category: 'rest',
    minAgeMonths: 0,
    maxAgeYears: null,
    hours: 10,
    energy: -150,
    gains: [
      { kind: 'need', key: 'rest', base: 200 },
      { kind: 'stat', key: 'stress', base: -30 },
    ],
    habit: 'sleepRoutine',
    parentCloseness: 0,
  },
  {
    id: 'play-outside',
    category: 'play',
    minAgeMonths: 24,
    maxAgeYears: 14,
    hours: 8,
    energy: 80,
    gains: [
      { kind: 'stat', key: 'health', base: 20 },
      { kind: 'stat', key: 'happiness', base: 30 },
      { kind: 'need', key: 'leisure', base: 120 },
    ],
    habit: 'exercise',
    parentCloseness: 0,
  },
  {
    id: 'read',
    category: 'learn',
    minAgeMonths: 36,
    maxAgeYears: null,
    hours: 8,
    energy: 40,
    gains: [
      { kind: 'stat', key: 'intelligence', base: 20 },
      { kind: 'skill', key: 'reading', base: 30 },
    ],
    habit: 'reading',
    parentCloseness: 0,
  },
  {
    id: 'draw-paint',
    category: 'creative',
    minAgeMonths: 36,
    maxAgeYears: null,
    hours: 8,
    energy: 40,
    gains: [
      { kind: 'skill', key: 'art', base: 30 },
      { kind: 'stat', key: 'creativity', base: 20 },
    ],
    habit: 'creativePractice',
    parentCloseness: 0,
  },
  {
    id: 'puzzles',
    category: 'learn',
    minAgeMonths: 48,
    maxAgeYears: null,
    hours: 6,
    energy: 50,
    gains: [
      { kind: 'skill', key: 'logic', base: 30 },
      { kind: 'stat', key: 'intelligence', base: 15 },
    ],
    habit: null,
    parentCloseness: 0,
  },
  {
    id: 'exercise',
    category: 'health',
    minAgeMonths: 60,
    maxAgeYears: null,
    hours: 8,
    energy: 120,
    gains: [
      { kind: 'stat', key: 'health', base: 25 },
      { kind: 'skill', key: 'fitness', base: 30 },
      { kind: 'stat', key: 'stress', base: -25 },
    ],
    habit: 'exercise',
    parentCloseness: 0,
  },
  {
    id: 'practice-music',
    category: 'creative',
    minAgeMonths: 60,
    maxAgeYears: null,
    hours: 10,
    energy: 50,
    gains: [
      { kind: 'skill', key: 'music', base: 30 },
      { kind: 'stat', key: 'creativity', base: 15 },
      { kind: 'stat', key: 'discipline', base: 10 },
    ],
    habit: 'creativePractice',
    parentCloseness: 0,
  },
  {
    id: 'socialize',
    category: 'social',
    minAgeMonths: 48,
    maxAgeYears: null,
    hours: 8,
    energy: 60,
    gains: [
      { kind: 'skill', key: 'socializing', base: 30 },
      { kind: 'stat', key: 'socialSkill', base: 20 },
      { kind: 'need', key: 'social', base: 150 },
    ],
    habit: null,
    parentCloseness: 0,
  },
  {
    id: 'study',
    category: 'learn',
    minAgeMonths: 96,
    maxAgeYears: null,
    hours: 8,
    energy: 50,
    gains: [
      { kind: 'skill', key: 'science', base: 30 },
      { kind: 'skill', key: 'logic', base: 10 },
    ],
    habit: 'reading',
    parentCloseness: 0,
  },
  {
    id: 'code',
    category: 'learn',
    minAgeMonths: 108,
    maxAgeYears: null,
    hours: 8,
    energy: 50,
    gains: [
      { kind: 'skill', key: 'technology', base: 30 },
      { kind: 'skill', key: 'logic', base: 10 },
    ],
    habit: null,
    parentCloseness: 0,
  },
  {
    id: 'tinker',
    category: 'creative',
    minAgeMonths: 72,
    maxAgeYears: null,
    hours: 8,
    energy: 60,
    gains: [
      { kind: 'skill', key: 'craft', base: 30 },
      { kind: 'stat', key: 'creativity', base: 10 },
    ],
    habit: 'creativePractice',
    parentCloseness: 0,
  },
  {
    id: 'volunteer',
    category: 'social',
    minAgeMonths: 144,
    maxAgeYears: null,
    hours: 8,
    energy: 60,
    gains: [
      { kind: 'skill', key: 'care', base: 30 },
      { kind: 'stat', key: 'happiness', base: 20 },
      { kind: 'stat', key: 'reputation', base: 10 },
    ],
    habit: null,
    parentCloseness: 0,
  },
  {
    id: 'business-reading',
    category: 'learn',
    minAgeMonths: 168,
    maxAgeYears: null,
    hours: 6,
    energy: 40,
    gains: [{ kind: 'skill', key: 'business', base: 30 }],
    habit: 'reading',
    parentCloseness: 0,
  },
  {
    id: 'organize-event',
    category: 'social',
    minAgeMonths: 144,
    maxAgeYears: null,
    hours: 10,
    energy: 80,
    gains: [
      { kind: 'skill', key: 'leadership', base: 30 },
      { kind: 'skill', key: 'socializing', base: 10 },
      { kind: 'need', key: 'social', base: 100 },
    ],
    habit: null,
    parentCloseness: 0,
  },
  {
    id: 'meditate',
    category: 'rest',
    minAgeMonths: 120,
    maxAgeYears: null,
    hours: 4,
    energy: -30,
    gains: [
      { kind: 'stat', key: 'stress', base: -50 },
      { kind: 'stat', key: 'discipline', base: 15 },
    ],
    habit: null,
    parentCloseness: 0,
  },
];

const BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));

export function findActivity(id: string): ActivityDefinition | undefined {
  return BY_ID.get(id);
}

/** Training quality by household circumstance, percent (spec §4 skill formula). */
const TRAINING_QUALITY: Record<WealthTier, number> = {
  low: 80,
  'lower-middle': 90,
  middle: 100,
  'upper-middle': 108,
  wealthy: 115,
  'very-wealthy': 122,
  royal: 125,
};

export function diminishingPercent(timesAlready: number): number {
  return Math.floor(10_000 / (100 + DIMINISHING_COEFFICIENT_PERCENT * timesAlready));
}

export type ActivityStatus =
  'done' | 'tired' | 'no-time' | 'too-young' | 'too-old' | 'unknown' | 'life-ended';

export interface ActivityResult {
  activityId: string;
  status: ActivityStatus;
  /** Applied changes (fixed-point tenths). */
  changes: { kind: ActivityGain['kind']; key: string; delta: number }[];
  hoursLeft: number;
  /** Percentage of full effect this attempt delivered (after diminishing returns and fatigue). */
  effectPercent: number;
}

export interface ActivityAvailability {
  id: string;
  category: ActivityCategory;
  available: boolean;
  reason: 'too-young' | 'too-old' | 'no-time' | null;
  hours: number;
  energy: number;
  timesThisMonth: number;
  nextEffectPercent: number;
}

/** Resets the monthly activity counters when a new month has started. */
export function ensureActivityMonth(world: World): void {
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
}

function ageGate(def: ActivityDefinition, totalMonths: number): 'too-young' | 'too-old' | null {
  if (totalMonths < def.minAgeMonths) return 'too-young';
  if (def.maxAgeYears !== null && Math.floor(totalMonths / 12) > def.maxAgeYears) return 'too-old';
  return null;
}

export function listActivities(world: World): ActivityAvailability[] {
  const character = activeCharacter(world);
  const age = ageOf(character.birth, world.clock);
  const sameMonth = world.activity.tick === world.tick;
  const { total: budget, used: hoursUsed } = timeBudget(world);
  return ACTIVITIES.map((def) => {
    const times = sameMonth ? (world.activity.counts[def.id] ?? 0) : 0;
    const gate = ageGate(def, age.totalMonths);
    const noTime = hoursUsed + def.hours > budget;
    return {
      id: def.id,
      category: def.category,
      available: gate === null && !noTime,
      reason: gate ?? (noTime ? 'no-time' : null),
      hours: def.hours,
      energy: def.energy,
      timesThisMonth: times,
      nextEffectPercent: diminishingPercent(times),
    };
  });
}

/**
 * Performs one attempt. Attempts are never blocked outright (unlimited actions), but they
 * can be ineligible (age), ineffective (no free time left) or weaker (tired, repeated).
 */
export function performActivity(world: World, activityId: string): ActivityResult {
  const def = findActivity(activityId);
  const character = activeCharacter(world);
  const result = (status: ActivityStatus, effectPercent = 0): ActivityResult => ({
    activityId,
    status,
    changes: [],
    hoursLeft: Math.max(0, timeBudget(world).total - timeBudget(world).used),
    effectPercent,
  });
  if (world.lifeStatus !== 'alive') return result('life-ended');
  if (!def) return result('unknown');
  ensureActivityMonth(world);
  const age = ageOf(character.birth, world.clock);
  const gate = ageGate(def, age.totalMonths);
  if (gate) return result(gate);

  const budget = timeBudget(world).total;
  const casual = world.rules.difficulty === 'casual';
  // Casual doubles free time (calendar/time.ts) but keeps a limit, so gains stay bounded.
  if (world.activity.hoursUsed + def.hours > budget) return result('no-time');

  const times = world.activity.counts[def.id] ?? 0;
  let percent = diminishingPercent(times);
  let status: ActivityStatus = 'done';
  if (!casual && def.energy > 0 && character.stats.energy < def.energy) {
    percent = Math.floor(percent / 2);
    status = 'tired';
    changeStat(world, character, 'stress', 20, `activity:${def.id}:tired`);
  }

  world.activity.counts[def.id] = times + 1;
  world.activity.hoursUsed += def.hours;
  const energyCost = casual && def.energy > 0 ? Math.floor(def.energy / 2) : def.energy;
  changeStat(world, character, 'energy', -energyCost, `activity:${def.id}`);

  const household = world.households[character.householdId];
  const quality = household ? TRAINING_QUALITY[household.wealth] : 100;
  // Effort comes from discipline: 0..1000 maps to 50%..150%.
  const effort = 50 + Math.floor(character.stats.discipline / 10);
  const cause = `activity:${def.id}`;
  const changes: ActivityResult['changes'] = [];
  for (const gain of def.gains) {
    let amount = Math.trunc((gain.base * percent) / 100);
    if (gain.kind === 'skill') amount = Math.trunc((amount * effort * quality) / 10_000);
    let delta = 0;
    if (gain.kind === 'stat') delta = changeStat(world, character, gain.key, amount, cause);
    else if (gain.kind === 'need') delta = changeNeed(character, gain.key, amount);
    else delta = changeSkill(world, character, gain.key, amount, cause);
    changes.push({ kind: gain.kind, key: gain.key, delta });
  }
  if (times === 0) {
    if (def.habit) changeHabit(character, def.habit, 3);
    if (def.parentCloseness !== 0)
      adjustFamilyCloseness(world, character, 'parents', def.parentCloseness);
    addBiography(world, character.id, 'activity', 'bio.activity', { activityId: def.id });
  }
  return {
    activityId,
    status,
    changes,
    hoursLeft: Math.max(0, budget - world.activity.hoursUsed),
    effectPercent: percent,
  };
}

export { timeBudget } from '../calendar/time';
