import { applyBp } from '../core/money';
import { addBiography, addNotification, ageYears } from '../core/world';
import { changeNeed, changeStat } from '../characters/stats';
import { payExpense, payerFor } from '../economy/finance';
import { getInstitutions, type Religion } from '../world/institutions';
import type { Character, Participation, World } from '../state/schema';

/**
 * Religion (spec §3.15, §4; Milestone 6), modelled neutrally: a person's affiliation (or
 * none) and how much they take part. Taking part costs time and brings community, calm and
 * meaning; no faith is better than another. Where the law restricts leaving a faith, the
 * game says so and only participation can change. Germany's church tax is charged to
 * registered Christians. PROPOSED TUNING.
 */

export const PARTICIPATION_HOURS: Record<Participation, number> = {
  none: 0,
  occasional: 4,
  regular: 10,
  devout: 20,
};

/** Church tax in Germany, approximated as basis points of gross monthly salary. */
export const CHURCH_TAX_BP = 100;

export type ReligionRejection = 'tooYoung' | 'restricted' | 'noChange' | 'noReligion';

export const RELIGION_MESSAGES: Record<ReligionRejection, string> = {
  tooYoung: 'You can choose your own beliefs from 16.',
  restricted:
    'Leaving this faith is legally restricted here. You can still choose how much you take part.',
  noChange: 'That is already your choice.',
  noReligion: 'Choose a faith before choosing how much to take part.',
};

export class ReligionError extends Error {
  readonly code: ReligionRejection;
  constructor(code: ReligionRejection) {
    super(RELIGION_MESSAGES[code]);
    this.name = 'ReligionError';
    this.code = code;
  }
}

/** Whether the law where the person lives restricts leaving their current faith. */
export function leavingRestricted(c: Character): boolean {
  const restricted = getInstitutions(c.civic.residence.countryCode).religion.leavingRestricted;
  return restricted !== null && restricted === c.civic.religion;
}

export function setReligion(world: World, c: Character, religion: Religion): void {
  if (ageYears(world, c) < 16) throw new ReligionError('tooYoung');
  if (c.civic.religion === religion) throw new ReligionError('noChange');
  if (leavingRestricted(c)) throw new ReligionError('restricted');
  const from = c.civic.religion;
  c.civic.religion = religion;
  if (religion === 'none') c.civic.participation = 'none';
  else if (c.civic.participation === 'none') c.civic.participation = 'occasional';
  addBiography(world, c.id, 'religion', 'bio.religion', { from, to: religion });
}

export function setParticipation(world: World, c: Character, level: Participation): void {
  if (ageYears(world, c) < 16) throw new ReligionError('tooYoung');
  if (c.civic.participation === level) throw new ReligionError('noChange');
  if (c.civic.religion === 'none' && level !== 'none') throw new ReligionError('noReligion');
  c.civic.participation = level;
}

/** Monthly effects of taking part, and church tax where it applies. */
export function processReligion(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null || c.civic.religion === 'none' || ageYears(world, c) < 16) return;
  const level = c.civic.participation;
  const effect = { none: 0, occasional: 1, regular: 2, devout: 3 }[level];
  if (effect > 0) {
    changeStat(world, c, 'happiness', 4 * effect, `religion:${level}`);
    changeStat(world, c, 'stress', -4 * effect, `religion:${level}`);
    changeNeed(c, 'social', 15 * effect);
    const official = getInstitutions(c.countryCode).religion.official;
    if (official === c.civic.religion && level !== 'occasional')
      changeStat(world, c, 'reputation', 1, 'religion:community');
  }
  if (c.countryCode === 'DE' && c.civic.religion === 'christianity') {
    const job = c.employmentId ? world.employment[c.employmentId] : undefined;
    const payer = payerFor(world, c);
    if (job?.status === 'active' && payer) {
      const tax = applyBp(job.salaryMinor, CHURCH_TAX_BP);
      payExpense(world, payer, 'churchTax', tax, 'tx.churchTax');
    }
  }
}

export function notifyReligiousMilestone(world: World, c: Character, key: string): void {
  addNotification(world, 'civic', key, { religion: c.civic.religion }, 'religion');
}
