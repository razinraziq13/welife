import { seedFromString } from '../core/rng';
import { ageYears } from '../core/world';
import { sortedValues } from '../core/data';
import { getInstitutions, type Qualification, type Religion } from '../world/institutions';
import type { Character, Civic, ResidenceStatus, World } from '../state/schema';

/**
 * Citizenship, residence and belief helpers shared by the Milestone 6 systems.
 * Everything here is pure and deterministic.
 */

/** Deterministic pick from a country's religious landscape (no RNG stream is consumed). */
export function religionFor(key: string, countryCode: string): Religion {
  const shares = getInstitutions(countryCode).religion.shares;
  const total = shares.reduce((s, [, p]) => s + p, 0);
  let roll = (seedFromString(`${key}:${countryCode}`)[0] >>> 0) % total;
  for (const [religion, percent] of shares) {
    if (roll < percent) return religion;
    roll -= percent;
  }
  return shares[0]?.[0] ?? 'none';
}

export function defaultCivic(countryCode: string, religion: Religion, tick = 0): Civic {
  return {
    citizenships: [countryCode],
    residence: { countryCode, status: 'citizen', route: null, sinceTick: tick, expiresTick: null },
    residedMonths: {},
    permanentMonths: {},
    religion,
    participation: religion === 'none' ? 'none' : 'occasional',
    custodyUntilTick: null,
    veteran: false,
  };
}

export function isCitizen(c: Character, code: string): boolean {
  return c.civic.citizenships.includes(code);
}

/** The person's legal status in a country, or null if they have none there. */
export function statusIn(c: Character, code: string): ResidenceStatus | null {
  if (isCitizen(c, code)) return 'citizen';
  if (c.civic.residence.countryCode === code) return c.civic.residence.status;
  return null;
}

/** Citizen or permanent resident ("settled") in the country. */
export function isSettled(c: Character, code: string): boolean {
  const s = statusIn(c, code);
  return s === 'citizen' || s === 'permanent';
}

/** Share of public health coverage this person gets where they live (percent). */
export function coverageShare(c: Character): number {
  const code = c.civic.residence.countryCode;
  if (isSettled(c, code)) return 100;
  return getInstitutions(code).healthcare.visitorCoveragePercent;
}

export function inCustody(world: World, c: Character): boolean {
  return c.civic.custodyUntilTick !== null && c.civic.custodyUntilTick > world.tick;
}

/** The right to work where the person lives. */
export function workRights(c: Character): 'full' | 'limited' | 'none' {
  const r = c.civic.residence;
  if (r.status !== 'visa' || isCitizen(c, r.countryCode)) return 'full';
  if (!r.route) return 'full';
  return getInstitutions(r.countryCode).visas[r.route].workRights;
}

const QUALIFICATION_RANK: Record<Qualification, number> = {
  none: 0,
  upperSecondary: 1,
  diploma: 2,
  bachelor: 3,
};

export function highestQualification(c: Character): Qualification {
  let best: Qualification = 'none';
  for (const q of c.education.qualifications) {
    const level: Qualification =
      q.startsWith('master:') || q.startsWith('bachelor:')
        ? 'bachelor'
        : q.startsWith('diploma:')
          ? 'diploma'
          : q === 'upperSecondary'
            ? 'upperSecondary'
            : 'none';
    if (QUALIFICATION_RANK[level] > QUALIFICATION_RANK[best]) best = level;
  }
  return best;
}

export function meetsQualification(c: Character, needed: Qualification): boolean {
  return QUALIFICATION_RANK[highestQualification(c)] >= QUALIFICATION_RANK[needed];
}

/** Parents recorded in family links (biological or adoptive). */
export function parentsOf(world: World, childId: string): Character[] {
  const parents: Character[] = [];
  for (const link of sortedValues(world.familyLinks)) {
    if (link.childId !== childId) continue;
    const p = world.characters[link.parentId];
    if (p) parents.push(p);
  }
  return parents;
}

/**
 * Citizenship and residence of a child born in `countryCode` (spec §4: country-specific
 * rules). Descent passes on each parent's citizenships; birth in the country grants it
 * unconditionally, when a parent is settled there, or (atMajority) later at 18.
 */
export function birthCivic(
  world: World,
  child: Character,
  parents: readonly Character[],
  countryCode: string,
): void {
  const rules = getInstitutions(countryCode).citizenship;
  const set = new Set<string>();
  for (const p of parents) {
    for (const code of p.civic.citizenships) {
      if (getInstitutions(code).citizenship.descent) set.add(code);
    }
  }
  const settledParent = parents.some((p) => isSettled(p, countryCode));
  if (
    rules.birthright === 'unconditional' ||
    (rules.birthright === 'parentResident' && settledParent) ||
    parents.length === 0
  ) {
    set.add(countryCode);
  }
  if (set.size === 0) set.add(countryCode);
  const citizenships = [...set].sort();
  // A citizen of the birth country lives there as a citizen; otherwise the child follows a
  // parent's status (dependants share the family's visa or residence).
  let status: ResidenceStatus = 'citizen';
  let route: Civic['residence']['route'] = null;
  let expiresTick: number | null = null;
  if (!citizenships.includes(countryCode)) {
    const parent = parents.find((p) => p.civic.residence.countryCode === countryCode);
    status = parent?.civic.residence.status === 'visa' ? 'visa' : 'permanent';
    route = parent?.civic.residence.status === 'visa' ? parent.civic.residence.route : null;
    expiresTick = parent?.civic.residence.expiresTick ?? null;
  }
  const mother = parents[0];
  child.flags[`bornIn.${countryCode}`] = true;
  for (const code of citizenships) child.flags[`birthCitizen.${code}`] = true;
  child.civic = {
    ...child.civic,
    citizenships,
    residence: { countryCode, status, route, sinceTick: world.tick, expiresTick },
    religion: mother?.civic.religion ?? child.civic.religion,
    participation: mother && mother.civic.religion !== 'none' ? 'occasional' : 'none',
  };
}

/** Born in a country with "atMajority" birthright and lived there 5+ years: citizen at 18. */
export function majorityCitizenship(world: World, c: Character): boolean {
  const code = c.civic.residence.countryCode;
  if (isCitizen(c, code) || ageYears(world, c) !== 18) return false;
  const rules = getInstitutions(code).citizenship;
  if (rules.birthright !== 'atMajority') return false;
  if ((c.civic.residedMonths[code] ?? 0) < 60) return false;
  const birthCountry = c.flags[`bornIn.${code}`];
  if (!birthCountry) return false;
  c.civic.citizenships = [...c.civic.citizenships, code].sort();
  c.civic.residence = { ...c.civic.residence, status: 'citizen', route: null, expiresTick: null };
  return true;
}

/** An unspent conviction for this person ("serious": custody or fraud). */
export function hasUnspentConviction(
  world: World,
  characterId: string,
  severity: 'any' | 'serious',
): boolean {
  return sortedValues(world.civics.cases).some(
    (k) =>
      k.characterId === characterId &&
      k.convicted &&
      (k.spentTick === null || k.spentTick > world.tick) &&
      (severity === 'any' || k.outcome === 'custody' || k.kind === 'fraud'),
  );
}
