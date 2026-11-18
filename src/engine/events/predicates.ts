import { ageOf } from '../core/clock';
import { lifeStage } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { getRules } from '../world/rules';
import { getInstitutions } from '../world/institutions';
import { hasMemory } from '../social/memories';
import { childrenOf } from '../social/relationships';
import type { Character, World } from '../state/schema';
import type { Predicate } from './schema';

export type FactValue = string | number | boolean | undefined;

function liquidMonths(world: World, c: Character): number {
  const bal = (id: string | null | undefined) =>
    id ? (world.ledger.accounts[id]?.balance ?? 0n) : 0n;
  const own = bal(c.finance?.checkingId) + bal(c.finance?.savingsId);
  const h = world.households[c.householdId];
  const household =
    h?.finance && h.finance.headId !== c.id && ageOf(c.birth, world.clock).years < 18
      ? bal(h.finance.checkingId) + bal(h.finance.savingsId)
      : 0n;
  const median = medianWage(world, c.countryCode);
  if (median <= 0n) return 0;
  return Number((own + household) / median);
}

function inDebt(world: World, c: Character): boolean {
  for (const a of Object.values(world.ledger.accounts)) {
    if (
      a.ownerId === c.id &&
      (a.type === 'arrears' || a.type === 'loan') &&
      a.closedTick === null &&
      a.balance > 0n
    )
      return true;
  }
  return false;
}

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
    case 'school.stage':
      return character.education.current?.stage ?? 'none';
    case 'school.grade':
      return character.education.current?.grade ?? 0;
    case 'school.final': {
      const current = character.education.current;
      return current !== null && current.yearsCompleted >= current.years - 1;
    }
    case 'school.private':
      return character.education.current?.kind === 'private';
    case 'clubs.count':
      return character.education.clubs.length;
    case 'job.employed':
      return (
        character.employmentId !== null &&
        world.employment[character.employmentId]?.status === 'active'
      );
    case 'job.industry':
      return character.employmentId
        ? (world.employment[character.employmentId]?.terms.industryId ?? 'none')
        : 'none';
    case 'job.level':
      return character.employmentId
        ? (world.employment[character.employmentId]?.terms.level ?? -1)
        : -1;
    case 'job.performance':
      return character.employmentId
        ? (world.employment[character.employmentId]?.performance ?? 0)
        : 0;
    case 'job.tenure': {
      const e = character.employmentId ? world.employment[character.employmentId] : undefined;
      return e ? world.tick - e.startTick : 0;
    }
    case 'money.savingsMonths':
      return liquidMonths(world, character);
    case 'money.inDebt':
      return inDebt(world, character);
    case 'social.friends':
      return Object.values(world.relationships).filter(
        (r) =>
          r.aId === character.id && r.type === 'friend' && world.characters[r.bId]?.death === null,
      ).length;
    case 'social.partnered':
      return character.partnership !== null;
    case 'social.married':
      return character.partnership?.status === 'married';
    case 'social.children':
      return childrenOf(world, character.id).length;
    case 'home.own':
      return world.households[character.householdId]?.finance?.headId === character.id;
    case 'business.count':
      return Object.values(world.businesses).filter(
        (b) => b.status === 'active' && b.owners.some((o) => o.ownerId === character.id),
      ).length;
    case 'business.types':
      return new Set(
        Object.values(world.businesses)
          .filter((b) => b.status === 'active' && b.owners.some((o) => o.ownerId === character.id))
          .map((b) => b.typeId),
      ).size;
    case 'property.count':
      return Object.values(world.properties).filter(
        (p) => p.status === 'owned' && p.owners.some((o) => o.ownerId === character.id),
      ).length;
    case 'property.rentals':
      return Object.values(world.properties).filter(
        (p) =>
          p.status === 'owned' &&
          p.tenant !== null &&
          p.owners.some((o) => o.ownerId === character.id),
      ).length;
    case 'economy.cycle':
      return world.economy[character.countryCode]?.cycle ?? 0;
    // Milestone 6: citizenship and institutions.
    case 'civic.citizen':
      return character.civic.citizenships.includes(character.civic.residence.countryCode);
    case 'civic.newcomer':
      return (
        !character.civic.citizenships.includes(character.civic.residence.countryCode) &&
        world.tick - character.civic.residence.sinceTick < 24
      );
    case 'civic.religion':
      return character.civic.religion;
    case 'civic.participation':
      return character.civic.participation;
    case 'civic.serving':
      return Object.values(world.civics.service).some(
        (s) => s.characterId === character.id && s.status === 'serving',
      );
    case 'civic.calledUp':
      return Object.values(world.civics.service).some(
        (s) => s.characterId === character.id && s.status === 'called',
      );
    case 'civic.veteran':
      return character.civic.veteran;
    case 'civic.office': {
      const career = Object.values(world.civics.politics).find(
        (p) => p.characterId === character.id && p.status === 'office',
      );
      return career?.office ?? 'none';
    }
    case 'civic.candidate':
      return Object.values(world.civics.politics).some(
        (p) => p.characterId === character.id && p.campaign !== null,
      );
    case 'civic.duty':
      return world.civics.royal[character.id]?.kind ?? 'none';
    case 'civic.custody':
      return (
        character.civic.custodyUntilTick !== null && character.civic.custodyUntilTick > world.tick
      );
    case 'civic.voter': {
      const voteAge = getInstitutions(character.countryCode).politics.voteAge;
      return (
        voteAge !== null &&
        ageOf(character.birth, world.clock).years >= voteAge &&
        character.civic.citizenships.includes(character.countryCode)
      );
    }
    case 'law.juries':
      return getInstitutions(character.countryCode).law.juries;
    case 'law.drinkingAge':
      return getInstitutions(character.countryCode).law.drinkingAge ?? 0;
    case 'health.conditions':
      return Object.values(world.civics.conditions).filter(
        (h) => h.characterId === character.id && h.status !== 'resolved',
      ).length;
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
    case 'clubs':
      return character.education.clubs.includes(key);
    case 'memory':
      return hasMemory(world, key, character.id);
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

export { getRules };
