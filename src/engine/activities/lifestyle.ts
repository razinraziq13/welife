import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { activeCharacter, addBiography, ageYears, withRng } from '../core/world';
import { spendHours, timeBudget } from '../calendar/time';
import { changeNeed, changeSkill, changeStat } from '../characters/stats';
import { inCustody } from '../civics/status';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor, receiveIncome } from '../economy/finance';
import { adjustFamilyCloseness } from '../events/effects';
import { activeEmployment } from '../career/jobs';
import { getOccupation } from '../career/occupations';
import { COUNTRIES } from '../world/countries';
import { adjustPair, kinship } from '../social/relationships';
import { APPEARANCE_LIMITS, type Character, type SkillKey, type World } from '../state/schema';
import { diminishingPercent, ensureActivityMonth } from './activities';

/**
 * Lifestyle and everyday activities (gameplay expansion, feature 8). These sit beside the
 * original personal activities in one Activities Hub. Each has age, time, energy and money
 * requirements; money goes through the ledger (paid by the player, or by their household while
 * they are a child). Outcomes reach beyond stats: relationships, skills, a driving licence,
 * travel memories, and personal projects that build over months and finish with a result.
 * All numbers are PROPOSED TUNING; costs are shares of the local median monthly wage.
 */

export const HUB_CATEGORIES = [
  'health',
  'learning',
  'entertainment',
  'travel',
  'shopping',
  'style',
  'family',
  'social',
  'projects',
  'admin',
] as const;
export type HubCategory = (typeof HUB_CATEGORIES)[number];

/** Where the original personal activities sit in the hub. */
export const HUB_OF: Record<string, HubCategory> = {
  'play-toys': 'entertainment',
  'play-outside': 'entertainment',
  'family-time': 'family',
  'rest-well': 'health',
  exercise: 'health',
  meditate: 'health',
  read: 'learning',
  puzzles: 'learning',
  study: 'learning',
  'business-reading': 'learning',
  'draw-paint': 'projects',
  'practice-music': 'projects',
  code: 'projects',
  tinker: 'projects',
  socialize: 'social',
  volunteer: 'social',
  'organize-event': 'social',
};

export interface LifestyleDefinition {
  id: string;
  hub: HubCategory;
  minAge: number;
  maxAge: number | null;
  hours: number;
  /** Energy used (tenths); negative restores. */
  energy: number;
  /** Cost as a percentage of the local median monthly wage (0 = free). */
  costPercent: number;
  /** Can be made a monthly calendar plan. */
  recurring: boolean;
  /** At most once a month (trips, appointments, big purchases, tests). */
  oncePerMonth: boolean;
  /** Needs the person's own bank account (paid from their own money). */
  ownMoney: boolean;
  /** Not possible while in custody (all but a few). */
  freeInCustody: boolean;
  /** A personal project that builds up over months. */
  project: { skills: readonly SkillKey[] } | null;
}

const def = (
  id: string,
  hub: HubCategory,
  minAge: number,
  hours: number,
  energy: number,
  costPercent: number,
  options: Partial<
    Pick<
      LifestyleDefinition,
      'maxAge' | 'recurring' | 'oncePerMonth' | 'ownMoney' | 'freeInCustody' | 'project'
    >
  > = {},
): LifestyleDefinition => ({
  id,
  hub,
  minAge,
  maxAge: options.maxAge ?? null,
  hours,
  energy,
  costPercent,
  recurring: options.recurring ?? false,
  oncePerMonth: options.oncePerMonth ?? false,
  ownMoney: options.ownMoney ?? false,
  freeInCustody: options.freeInCustody ?? false,
  project: options.project ?? null,
});

export const LIFESTYLE: readonly LifestyleDefinition[] = [
  def('doctor-visit', 'health', 12, 2, 10, 1, { oncePerMonth: true }),
  def('dentist', 'health', 6, 2, 10, 2, { oncePerMonth: true }),
  def('spa-day', 'health', 16, 4, -60, 3, { oncePerMonth: true }),
  def('library-visit', 'learning', 6, 4, 20, 0, { recurring: true, freeInCustody: true }),
  def('online-course', 'learning', 14, 8, 40, 4, { oncePerMonth: true }),
  def('cinema', 'entertainment', 6, 3, 10, 1, { recurring: true }),
  def('concert', 'entertainment', 12, 5, 30, 3),
  def('museum', 'entertainment', 6, 4, 20, 1),
  def('video-games', 'entertainment', 6, 4, 10, 0, { recurring: true, freeInCustody: true }),
  def('day-trip', 'travel', 8, 10, 60, 2, { oncePerMonth: true }),
  def('weekend-away', 'travel', 18, 20, 40, 8, { oncePerMonth: true }),
  def('holiday-abroad', 'travel', 18, 40, 20, 25, { oncePerMonth: true, ownMoney: true }),
  def('new-clothes', 'style', 10, 3, 20, 3),
  def('salon', 'style', 3, 2, 10, 2, { oncePerMonth: true }),
  def('new-gadget', 'shopping', 12, 2, 10, 10, { oncePerMonth: true }),
  def('gifts-for-family', 'shopping', 10, 3, 20, 4, { oncePerMonth: true }),
  def('family-dinner-out', 'family', 6, 3, 10, 3),
  def('call-relatives', 'family', 8, 1, 5, 0, { recurring: true, freeInCustody: true }),
  def('host-party', 'social', 18, 6, 60, 5, { oncePerMonth: true }),
  def('community-group', 'social', 14, 4, 30, 0, { recurring: true }),
  def('write-novel', 'projects', 14, 8, 50, 0, {
    recurring: true,
    freeInCustody: true,
    project: { skills: ['reading', 'art'] },
  }),
  def('build-app', 'projects', 14, 8, 50, 0, {
    recurring: true,
    project: { skills: ['technology', 'logic'] },
  }),
  def('learn-language', 'projects', 10, 6, 40, 1, {
    recurring: true,
    project: { skills: ['reading', 'socializing'] },
  }),
  def('grow-garden', 'projects', 8, 6, 50, 1, {
    recurring: true,
    project: { skills: ['craft', 'fitness'] },
  }),
  def('driving-licence', 'admin', 17, 6, 30, 4, { oncePerMonth: true }),
  def('review-finances', 'admin', 18, 2, 10, 0, { ownMoney: true, freeInCustody: true }),
];

const BY_ID = new Map(LIFESTYLE.map((d) => [d.id, d]));

export function findLifestyle(id: string): LifestyleDefinition | undefined {
  return BY_ID.get(id);
}

export type LifestyleBlock =
  | 'tooYoung'
  | 'tooOld'
  | 'noTime'
  | 'tooTired'
  | 'cannotAfford'
  | 'inCustody'
  | 'doneThisMonth'
  | 'noOwnMoney'
  | 'hasLicence'
  | 'tooYoungToColour'
  | 'noChange'
  | 'lifeEnded';

export const LIFESTYLE_MESSAGES: Record<LifestyleBlock, string> = {
  tooYoung: 'You are too young for this.',
  tooOld: 'You have outgrown this.',
  noTime: 'You have no free time left this month.',
  tooTired: 'You are too tired; rest first.',
  cannotAfford: 'You cannot afford this right now.',
  inCustody: 'Not possible while in custody.',
  doneThisMonth: 'Once a month; you have already done this.',
  noOwnMoney: 'You need money of your own (a bank account) for this.',
  hasLicence: 'You already have a driving licence.',
  tooYoungToColour: 'Hair colouring is for ages 14 and up.',
  noChange: 'That is the look you already have.',
  lifeEnded: 'This life has ended.',
};

export class LifestyleError extends Error {
  readonly code: LifestyleBlock;
  constructor(code: LifestyleBlock) {
    super(LIFESTYLE_MESSAGES[code]);
    this.name = 'LifestyleError';
    this.code = code;
  }
}

export function lifestyleCost(world: World, c: Character, d: LifestyleDefinition): bigint {
  return d.costPercent === 0 ? 0n : applyPercent(medianWage(world, c.countryCode), d.costPercent);
}

function payerOf(world: World, c: Character, d: LifestyleDefinition) {
  if (d.ownMoney) {
    const own = c.finance?.checkingId;
    return own ? { ownerId: c.id, checkingId: own, savingsId: c.finance?.savingsId ?? null } : null;
  }
  return payerFor(world, c);
}

function canPay(world: World, payer: ReturnType<typeof payerOf>, amount: bigint): boolean {
  if (amount === 0n) return true;
  if (!payer) return false;
  const bal = (id: string | null) => (id ? (world.ledger.accounts[id]?.balance ?? 0n) : 0n);
  return bal(payer.checkingId) + bal(payer.savingsId) >= amount;
}

const countKey = (id: string) => `life:${id}`;

export function timesThisMonth(world: World, id: string): number {
  return world.activity.tick === world.tick ? (world.activity.counts[countKey(id)] ?? 0) : 0;
}

export function lifestyleBlock(world: World, c: Character, id: string): LifestyleBlock | null {
  const d = BY_ID.get(id);
  if (!d || world.lifeStatus !== 'alive') return 'lifeEnded';
  const age = ageYears(world, c);
  if (age < d.minAge) return 'tooYoung';
  if (d.maxAge !== null && age > d.maxAge) return 'tooOld';
  if (!d.freeInCustody && inCustody(world, c)) return 'inCustody';
  if (id === 'driving-licence' && c.flags['licence.driving']) return 'hasLicence';
  if (d.oncePerMonth && timesThisMonth(world, id) > 0) return 'doneThisMonth';
  const t = timeBudget(world);
  if (t.used + d.hours > t.total) return 'noTime';
  if (d.energy > 0 && c.stats.energy < d.energy) return 'tooTired';
  const payer = payerOf(world, c, d);
  if (d.ownMoney && !payer) return 'noOwnMoney';
  if (!canPay(world, payer, lifestyleCost(world, c, d))) return 'cannotAfford';
  return null;
}

export interface LifestyleResult {
  activityId: string;
  key: string;
  params: Record<string, string | number>;
}

/** Progress a project makes in one session, from the person's skills (2-20 points). */
function projectProgress(c: Character, skills: readonly SkillKey[], percent: number): number {
  const avg = skills.reduce((s, k) => s + c.skills[k], 0) / skills.length;
  return Math.max(
    2,
    Math.trunc(((6 + Math.floor(avg / 80) + Math.floor(c.stats.discipline / 200)) * percent) / 100),
  );
}

function finishProject(world: World, c: Character, id: string): LifestyleResult {
  const into = c.finance?.checkingId ?? c.finance?.savingsId;
  addBiography(world, c.id, 'activity', 'bio.projectDone', { projectId: id });
  switch (id) {
    case 'write-novel':
      if (c.skills.reading >= 450 && into) {
        const royalty = applyPercent(medianWage(world, c.countryCode), 25);
        receiveIncome(world, c.id, into, 'royalties', royalty, 'tx.royalties');
        changeStat(world, c, 'reputation', 40, 'project:novel');
        return {
          activityId: id,
          key: 'life.project.novelPublished',
          params: { amount: royalty.toString() },
        };
      }
      changeStat(world, c, 'happiness', 60, 'project:novel');
      return { activityId: id, key: 'life.project.novelDone', params: {} };
    case 'build-app':
      if (c.skills.technology >= 450 && into) {
        const income = applyPercent(medianWage(world, c.countryCode), 35);
        receiveIncome(world, c.id, into, 'appIncome', income, 'tx.appIncome');
        return {
          activityId: id,
          key: 'life.project.appLaunched',
          params: { amount: income.toString() },
        };
      }
      changeStat(world, c, 'confidence', 50, 'project:app');
      return { activityId: id, key: 'life.project.appDone', params: {} };
    case 'learn-language':
      c.flags['languages.extra'] = true;
      changeSkill(world, c, 'socializing', 50, 'project:language');
      return { activityId: id, key: 'life.project.languageDone', params: {} };
    default:
      changeStat(world, c, 'health', 40, 'project:garden');
      changeStat(world, c, 'happiness', 40, 'project:garden');
      return { activityId: id, key: 'life.project.gardenDone', params: {} };
  }
}

/** Performs a lifestyle activity. Throws LifestyleError when it is unavailable. */
export function performLifestyle(world: World, id: string): LifestyleResult {
  const c = activeCharacter(world);
  ensureActivityMonth(world);
  const block = lifestyleBlock(world, c, id);
  const d = BY_ID.get(id);
  if (block || !d) throw new LifestyleError(block ?? 'lifeEnded');
  const times = timesThisMonth(world, id);
  const percent = diminishingPercent(times);
  const scale = (n: number) => Math.trunc((n * percent) / 100);
  spendHours(world, d.hours);
  world.activity.counts[countKey(id)] = times + 1;
  changeStat(world, c, 'energy', -d.energy, `life:${id}`);
  const cost = lifestyleCost(world, c, d);
  const payer = payerOf(world, c, d);
  if (cost > 0n && payer)
    payExpense(world, payer, 'lifestyle', cost, 'tx.lifestyle', { activityId: id });
  const cause = `life:${id}`;
  const stat = (k: Parameters<typeof changeStat>[2], n: number) =>
    changeStat(world, c, k, scale(n), cause);
  const done = (key: string, params: Record<string, string | number> = {}) => ({
    activityId: id,
    key,
    params,
  });

  if (d.project) {
    const progress = clamp(
      (c.projects[id] ?? 0) + projectProgress(c, d.project.skills, percent),
      0,
      100,
    );
    for (const k of d.project.skills) changeSkill(world, c, k, scale(15), cause);
    if (progress >= 100) {
      Reflect.deleteProperty(c.projects, id);
      return finishProject(world, c, id);
    }
    c.projects[id] = progress;
    return done('life.project.progress', { activityId: id, progress });
  }

  switch (id) {
    case 'doctor-visit':
      stat('health', 30);
      stat('stress', -10);
      return done('life.doctor-visit');
    case 'dentist':
      stat('health', 15);
      stat('confidence', 10);
      return done('life.dentist');
    case 'spa-day':
      stat('stress', -60);
      stat('happiness', 30);
      return done('life.spa-day');
    case 'library-visit':
      changeSkill(world, c, 'reading', scale(25), cause);
      stat('intelligence', 10);
      return done('life.library-visit');
    case 'online-course': {
      const job = activeEmployment(world, c);
      const options = job
        ? getOccupation(job.terms.occupationId).skills
        : (['technology'] as const);
      const skill = options.reduce((low, k) => (c.skills[k] < c.skills[low] ? k : low));
      changeSkill(world, c, skill, scale(35), cause);
      stat('intelligence', 10);
      return done('life.online-course', { skill });
    }
    case 'cinema':
      stat('happiness', 25);
      changeNeed(c, 'leisure', scale(120));
      return done('life.cinema');
    case 'concert':
      stat('happiness', 40);
      stat('creativity', 10);
      changeNeed(c, 'leisure', scale(150));
      changeNeed(c, 'social', scale(60));
      return done('life.concert');
    case 'museum':
      stat('intelligence', 15);
      stat('creativity', 15);
      changeNeed(c, 'leisure', scale(80));
      return done('life.museum');
    case 'video-games':
      stat('happiness', 20);
      stat('stress', -20);
      stat('discipline', -5);
      changeNeed(c, 'leisure', scale(120));
      return done('life.video-games');
    case 'day-trip':
      stat('happiness', 40);
      stat('stress', -40);
      changeNeed(c, 'leisure', scale(150));
      return done('life.day-trip');
    case 'weekend-away': {
      stat('happiness', 60);
      stat('stress', -80);
      const partner = c.partnership ? world.characters[c.partnership.partnerId] : undefined;
      if (partner?.death === null) {
        adjustPair(world, c.id, partner.id, { closeness: 5 });
        return done('life.weekend-away.together', { name: partner.identity.firstName });
      }
      return done('life.weekend-away');
    }
    case 'holiday-abroad': {
      const others = COUNTRIES.filter((x) => x.code !== c.countryCode);
      const pick = others[withRng(world, 'social', (rng) => rng.int(others.length))];
      const country = pick?.code ?? c.countryCode;
      stat('happiness', 100);
      stat('stress', -150);
      changeNeed(c, 'leisure', 300);
      addBiography(world, c.id, 'life', 'bio.travelled', { country });
      return done('life.holiday-abroad', { country });
    }
    case 'new-clothes':
      stat('confidence', 30);
      stat('happiness', 20);
      return done('life.new-clothes');
    case 'new-gadget':
      stat('happiness', 30);
      changeSkill(world, c, 'technology', scale(15), cause);
      return done('life.new-gadget');
    case 'gifts-for-family':
      adjustFamilyCloseness(world, c, 'parents', 3);
      adjustFamilyCloseness(world, c, 'siblings', 3);
      stat('happiness', 10);
      return done('life.gifts-for-family');
    case 'family-dinner-out':
      adjustFamilyCloseness(world, c, 'parents', 3);
      adjustFamilyCloseness(world, c, 'siblings', 2);
      changeNeed(c, 'social', scale(100));
      return done('life.family-dinner-out');
    case 'call-relatives': {
      let called = 0;
      for (const rel of Object.values(world.relationships)) {
        if (called >= 6 || rel.aId !== c.id) continue;
        const other = world.characters[rel.bId];
        if (other?.death !== null || other.householdId === c.householdId) continue;
        const kin = kinship(world, c.id, other.id);
        if (!kin || kin === 'child' || kin === 'partner') continue;
        adjustPair(world, c.id, other.id, { closeness: scale(2) });
        called += 1;
      }
      changeNeed(c, 'social', scale(40));
      return called > 0
        ? done('life.call-relatives', { count: called })
        : done('life.call-relatives.none');
    }
    case 'host-party': {
      let friends = 0;
      for (const rel of Object.values(world.relationships)) {
        if (rel.aId !== c.id || rel.type !== 'friend') continue;
        if (world.characters[rel.bId]?.death !== null) continue;
        adjustPair(world, c.id, rel.bId, { closeness: 3 });
        friends += 1;
      }
      stat('happiness', 30);
      changeNeed(c, 'social', 150);
      return done(friends > 0 ? 'life.host-party' : 'life.host-party.quiet', { count: friends });
    }
    case 'community-group':
      changeSkill(world, c, 'socializing', scale(15), cause);
      stat('reputation', 10);
      changeNeed(c, 'social', scale(60));
      return done('life.community-group');
    case 'driving-licence': {
      const pass =
        withRng(world, 'social', (rng) => rng.int(100)) <
        clamp(
          30 + Math.floor(c.stats.discipline / 20) + Math.floor(c.stats.intelligence / 30),
          10,
          90,
        );
      if (pass) {
        c.flags['licence.driving'] = true;
        stat('confidence', 40);
        addBiography(world, c.id, 'life', 'bio.licence', {});
        return done('life.driving-licence.passed');
      }
      stat('confidence', -20);
      return done('life.driving-licence.failed');
    }
    case 'salon':
      stat('confidence', 10);
      return done('life.salon.trim');
    case 'review-finances':
      changeSkill(world, c, 'business', scale(20), cause);
      stat('stress', -20);
      return done('life.review-finances');
    default:
      return done('life.done');
  }
}

export interface Recommendation {
  id: string;
  reason: string;
}

/**
 * Up to four suggestions that fit the person's situation right now, each with the reason it
 * was suggested. Only activities that are currently possible are suggested.
 */
export function recommendations(
  world: World,
  c: Character,
  possible: (id: string) => boolean,
): Recommendation[] {
  const out: Recommendation[] = [];
  const add = (id: string, reason: string) => {
    if (out.length < 4 && possible(id) && !out.some((r) => r.id === id)) out.push({ id, reason });
  };
  const age = ageYears(world, c);
  for (const [id, progress] of Object.entries(c.projects).sort())
    add(id, `projectInProgress:${String(progress)}`);
  if (c.stats.health < 500) add('doctor-visit', 'lowHealth');
  if (c.stats.stress > 600) add(age >= 16 ? 'spa-day' : 'rest-well', 'highStress');
  if (c.needs.social < 400) add(age >= 14 ? 'socialize' : 'family-time', 'lonely');
  if (c.needs.leisure < 400) add(age >= 6 ? 'cinema' : 'play-toys', 'bored');
  if (c.education.current) add('study', 'studying');
  if (age >= 17 && age <= 30 && !c.flags['licence.driving']) add('driving-licence', 'licence');
  if (age >= 18 && c.stats.happiness < 600) add('holiday-abroad', 'needBreak');
  if (age >= 18 && c.finance?.checkingId) add('review-finances', 'adultMoney');
  if (age >= 3) add('read', 'always');
  return out;
}

/** Extra cost of colouring hair, as a percentage of the median monthly wage. */
export const HAIR_COLOUR_PERCENT = 3;

export function salonCost(world: World, c: Character, recolour: boolean): bigint {
  const median = medianWage(world, c.countryCode);
  return applyPercent(median, 2) + (recolour ? applyPercent(median, HAIR_COLOUR_PERCENT) : 0n);
}

/**
 * A visit to the barber or salon (gameplay: change your hair). Choosing a new style (and, from
 * 14, a new colour) changes the character's look. Paid through the ledger; children's visits are
 * paid by the household. Once a month.
 */
export function visitSalon(
  world: World,
  hairStyle: number,
  hairColor: number | null,
): LifestyleResult {
  const c = activeCharacter(world);
  ensureActivityMonth(world);
  const d = BY_ID.get('salon');
  const block = lifestyleBlock(world, c, 'salon');
  if (block || !d) throw new LifestyleError(block ?? 'lifeEnded');
  if (hairStyle < 0 || hairStyle >= APPEARANCE_LIMITS.hairStyle)
    throw new LifestyleError('noChange');
  const recolour = hairColor !== null && hairColor !== c.appearance.hairColor;
  if (recolour && ageYears(world, c) < 14) throw new LifestyleError('tooYoungToColour');
  if (hairStyle === c.appearance.hairStyle && !recolour) throw new LifestyleError('noChange');
  const cost = salonCost(world, c, recolour);
  const payer = payerFor(world, c);
  if (!canPay(world, payer, cost)) throw new LifestyleError('cannotAfford');
  spendHours(world, d.hours);
  world.activity.counts[countKey('salon')] = timesThisMonth(world, 'salon') + 1;
  changeStat(world, c, 'energy', -d.energy, 'life:salon');
  if (payer) payExpense(world, payer, 'haircuts', cost, 'tx.salon');
  c.appearance = {
    ...c.appearance,
    hairStyle,
    hairColor: recolour ? hairColor : c.appearance.hairColor,
  };
  changeStat(world, c, 'confidence', 20, 'life:salon');
  changeStat(world, c, 'happiness', 15, 'life:salon');
  return { activityId: 'salon', key: 'life.salon.changed', params: { hairStyle } };
}
