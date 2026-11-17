import { clamp } from '../core/data';
import type { Character, HabitKey, NeedKey, SkillKey, StatKey, World } from '../state/schema';

export const FIXED_MAX = 1000;
const STAT_LOG_LIMIT = 60;

export const LIFE_STAGES = [
  'baby',
  'toddler',
  'child',
  'teen',
  'youngAdult',
  'adult',
  'middleAge',
  'senior',
] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export function lifeStage(ageYears: number): LifeStage {
  if (ageYears < 2) return 'baby';
  if (ageYears < 4) return 'toddler';
  if (ageYears < 10) return 'child';
  if (ageYears < 18) return 'teen';
  if (ageYears < 30) return 'youngAdult';
  if (ageYears < 50) return 'adult';
  if (ageYears < 65) return 'middleAge';
  return 'senior';
}

function log(world: World, character: Character, key: string, delta: number, cause: string): void {
  if (delta === 0) return;
  character.statLog.push({ tick: world.tick, key, delta, cause });
  if (character.statLog.length > STAT_LOG_LIMIT) {
    character.statLog.splice(0, character.statLog.length - STAT_LOG_LIMIT);
  }
}

/** Changes a stat by `delta` tenths (clamped to 0..1000) and records the cause. Returns the applied delta. */
export function changeStat(
  world: World,
  character: Character,
  key: StatKey,
  delta: number,
  cause: string,
): number {
  const before = character.stats[key];
  const after = clamp(before + Math.trunc(delta), 0, FIXED_MAX);
  character.stats[key] = after;
  log(world, character, `stats.${key}`, after - before, cause);
  return after - before;
}

export function changeNeed(character: Character, key: NeedKey, delta: number): number {
  const before = character.needs[key];
  const after = clamp(before + Math.trunc(delta), 0, FIXED_MAX);
  character.needs[key] = after;
  return after - before;
}

export function changeSkill(
  world: World,
  character: Character,
  key: SkillKey,
  delta: number,
  cause: string,
): number {
  const before = character.skills[key];
  const after = clamp(before + Math.trunc(delta), 0, FIXED_MAX);
  character.skills[key] = after;
  log(world, character, `skills.${key}`, after - before, cause);
  return after - before;
}

export function changeHabit(character: Character, key: HabitKey, delta: number): number {
  const before = character.habits[key];
  const after = clamp(before + Math.trunc(delta), 0, 100);
  character.habits[key] = after;
  return after - before;
}
