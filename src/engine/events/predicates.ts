import { ageOf } from '../core/clock';
import { lifeStage } from '../characters/stats';
import type { Character, World } from '../state/schema';
import type { Predicate } from './schema';

export type FactValue = string | number | boolean | undefined;

/** Resolves a whitelisted fact for a character. Unknown facts resolve to undefined. */
export function factValue(world: World, character: Character, fact: string): FactValue {
  const age = ageOf(character.birth, world.clock);
  switch (fact) {
    case 'age.years':
      return age.years;
    case 'age.totalMonths':
      return age.totalMonths;
    case 'month':
      return world.clock.month;
    case 'isBirthMonth':
      return age.totalMonths > 0 && world.clock.month === character.birth.month;
    case 'stage':
      return lifeStage(age.years);
    case 'country':
      return character.countryCode;
    case 'scenario':
      return world.households[character.householdId]?.scenario;
    case 'wealth':
      return world.households[character.householdId]?.wealth;
    case 'gender':
      return character.identity.gender;
    case 'difficulty':
      return world.rules.difficulty;
    default:
      break;
  }
  const dot = fact.indexOf('.');
  if (dot < 0) return undefined;
  const group = fact.slice(0, dot);
  const key = fact.slice(dot + 1);
  const lookup = (record: Record<string, number>): number | undefined =>
    Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
  switch (group) {
    case 'stats':
      return lookup(character.stats);
    case 'needs':
      return lookup(character.needs);
    case 'skills':
      return lookup(character.skills);
    case 'traits':
      return lookup(character.traits);
    case 'habits':
      return lookup(character.habits);
    case 'flags':
      return character.flags[key] ?? false;
    default:
      return undefined;
  }
}

export function evaluate(predicate: Predicate, world: World, character: Character): boolean {
  switch (predicate.kind) {
    case 'all':
      return predicate.of.every((p) => evaluate(p, world, character));
    case 'any':
      return predicate.of.some((p) => evaluate(p, world, character));
    case 'not':
      return !evaluate(predicate.of, world, character);
    case 'in': {
      const value = factValue(world, character, predicate.fact);
      return (
        (typeof value === 'string' || typeof value === 'number') && predicate.values.includes(value)
      );
    }
    case 'cmp': {
      const value = factValue(world, character, predicate.fact);
      if (value === undefined) return false;
      const target = predicate.value;
      switch (predicate.op) {
        case 'eq':
          return value === target;
        case 'ne':
          return value !== target;
        default:
          if (typeof value !== 'number' || typeof target !== 'number') return false;
          if (predicate.op === 'gt') return value > target;
          if (predicate.op === 'gte') return value >= target;
          if (predicate.op === 'lt') return value < target;
          return value <= target;
      }
    }
  }
}
