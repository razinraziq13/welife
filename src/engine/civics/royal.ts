import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears } from '../core/world';
import { changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { receiveIncome } from '../economy/finance';
import { getCountry } from '../world/countries';
import type { Character, RoyalDuty, World } from '../state/schema';

/**
 * Royal and noble duties (spec §3.14, decisions D4/D5). Only offered where the country's
 * profile supports royal or noble families (`monarchy.royalBirthAvailable` /
 * `nobilityAvailable`), and only to adults born into such a family. Public engagements and
 * patronages raise public approval; neglecting duties lowers it. Working royals receive an
 * allowance while approval holds. Succession is a Milestone 7 system. PROPOSED TUNING.
 */

export const ENGAGEMENTS = {
  charity: { hours: 6, approval: 10 },
  ceremony: { hours: 10, approval: 8 },
  visit: { hours: 8, approval: 6 },
  tour: { hours: 30, approval: 22 },
} as const;
export type EngagementKind = keyof typeof ENGAGEMENTS;

export const PATRONAGE_CAUSES = [
  'children',
  'health',
  'arts',
  'environment',
  'veterans',
  'education',
  'sport',
  'heritage',
] as const;
export type PatronageCause = (typeof PATRONAGE_CAUSES)[number];

/** Engagements a year expected of a working royal / a noble family member. */
export const EXPECTED_ENGAGEMENTS = { royal: 24, noble: 6 } as const;
const ALLOWANCE_PERCENT = 300;

export type RoyalRejection =
  'notRoyal' | 'noTime' | 'tooMany' | 'alreadyPatron' | 'notPatron' | 'tooYoung';

export const ROYAL_MESSAGES: Record<RoyalRejection, string> = {
  notRoyal: 'Only members of a royal or noble family have these duties.',
  noTime: 'You have no free time left this month.',
  tooMany: 'You can hold at most five patronages.',
  alreadyPatron: 'You are already patron of this cause.',
  notPatron: 'You are not patron of this cause.',
  tooYoung: 'Public duties start at 18.',
};

export class RoyalError extends Error {
  readonly code: RoyalRejection;
  constructor(code: RoyalRejection) {
    super(ROYAL_MESSAGES[code]);
    this.name = 'RoyalError';
    this.code = code;
  }
}

/** The kind of public role available to this person, if any. */
export function dutyKind(world: World, c: Character): RoyalDuty['kind'] | null {
  const flags = world.households[c.householdId]?.flags;
  const country = getCountry(c.countryCode).monarchy;
  // House members keep their role when they leave the family home.
  if ((flags?.royal || c.flags['house.royal']) && country.royalBirthAvailable) return 'royal';
  if ((flags?.noble || c.flags['house.noble']) && country.nobilityAvailable) return 'noble';
  return null;
}

export function dutyOf(world: World, c: Character): RoyalDuty | null {
  const existing = world.civics.royal[c.id];
  if (existing) return existing;
  if (ageYears(world, c) < 18) return null;
  const kind = dutyKind(world, c);
  if (!kind) return null;
  const duty: RoyalDuty = {
    characterId: c.id,
    kind,
    approval: 600,
    engagements: 0,
    yearStartTick: world.tick,
    patronages: [],
  };
  world.civics.royal[c.id] = duty;
  return duty;
}

function requireDuty(world: World, c: Character): RoyalDuty {
  if (ageYears(world, c) < 18) throw new RoyalError('tooYoung');
  const duty = dutyOf(world, c);
  if (!duty) throw new RoyalError('notRoyal');
  return duty;
}

export function undertakeEngagement(
  world: World,
  c: Character,
  kind: EngagementKind,
  spend: (hours: number) => boolean,
  repeats: number,
): number {
  const duty = requireDuty(world, c);
  const rule = ENGAGEMENTS[kind];
  if (!spend(rule.hours)) throw new RoyalError('noTime');
  const gain = Math.trunc(rule.approval / (1 + 0.35 * repeats));
  duty.approval = clamp(duty.approval + gain, 0, 1000);
  duty.engagements += 1;
  changeStat(world, c, 'reputation', Math.ceil(gain / 2), `duty:${kind}`);
  return gain;
}

export function takePatronage(world: World, c: Character, cause: PatronageCause): void {
  const duty = requireDuty(world, c);
  if (duty.patronages.includes(cause)) throw new RoyalError('alreadyPatron');
  if (duty.patronages.length >= 5) throw new RoyalError('tooMany');
  duty.patronages = [...duty.patronages, cause];
  duty.approval = clamp(duty.approval + 15, 0, 1000);
  addBiography(world, c.id, 'politics', 'bio.patronage', { cause });
}

export function dropPatronage(world: World, c: Character, cause: PatronageCause): void {
  const duty = requireDuty(world, c);
  if (!duty.patronages.includes(cause)) throw new RoyalError('notPatron');
  duty.patronages = duty.patronages.filter((p) => p !== cause);
  duty.approval = clamp(duty.approval - 20, 0, 1000);
}

/** Monthly: approval drifts with how many duties are done; the allowance is paid. */
export function processRoyal(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  const duty = dutyOf(world, c);
  if (!duty) return;
  const monthsIntoYear = world.tick - duty.yearStartTick;
  const expected = EXPECTED_ENGAGEMENTS[duty.kind];
  const pace = Math.floor((expected * Math.max(1, monthsIntoYear)) / 12);
  duty.approval = clamp(
    duty.approval + (duty.engagements >= pace ? 1 : -6) + duty.patronages.length,
    0,
    1000,
  );
  if (monthsIntoYear >= 12) {
    if (duty.engagements < expected)
      addNotification(
        world,
        'civic',
        'ntf.dutiesNeglected',
        { done: duty.engagements, expected },
        'politics',
      );
    duty.engagements = 0;
    duty.yearStartTick = world.tick;
  }
  if (duty.kind === 'royal' && duty.approval >= 300 && c.finance?.checkingId) {
    receiveIncome(
      world,
      c.id,
      c.finance.checkingId,
      'royalAllowance',
      applyPercent(medianWage(world, c.countryCode), ALLOWANCE_PERCENT),
      'tx.royalAllowance',
    );
  }
  const target = 300 + Math.floor(duty.approval / 2);
  if (c.stats.reputation < target) changeStat(world, c, 'reputation', 2, 'duty:approval');
  else if (c.stats.reputation > target + 100)
    changeStat(world, c, 'reputation', -2, 'duty:approval');
}
