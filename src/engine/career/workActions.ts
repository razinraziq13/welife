import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, withRng } from '../core/world';
import { spendHours, timeBudget } from '../calendar/time';
import { changeSkill, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor, receiveIncome } from '../economy/finance';
import { findRelationship } from '../social/relationships';
import { getRules } from '../world/rules';
import type { Character, Employment, SkillKey, World } from '../state/schema';
import { activeEmployment } from './jobs';
import { getOccupation } from './occupations';

/**
 * Career play beyond the monthly job loop (gameplay expansion, feature 6). Each career track
 * has its own actions with different costs and consequences: teachers prepare lessons and try
 * new methods, doctors take shifts and work towards a specialism, performers audition and
 * rehearse, office careers take on projects and courses. Professional reputation and a
 * specialism stay with the person across jobs; job satisfaction is derived each month.
 * Businesses and politics already have their own screens and are linked from the career page.
 * All numbers are PROPOSED TUNING; nothing here claims real-world professional accuracy.
 */

export type CareerTrack = 'teaching' | 'medicine' | 'performing' | 'office';

const PERFORMING = new Set(['actor', 'musician', 'dancer', 'singer', 'comedian']);

export function careerTrack(e: Employment): CareerTrack {
  const industry = e.terms.industryId;
  if (industry === 'education') return 'teaching';
  if (industry === 'healthcare') return 'medicine';
  if (industry === 'arts' || PERFORMING.has(e.terms.occupationId)) return 'performing';
  return 'office';
}

export const WORK_ACTION_IDS = [
  'prepareLessons',
  'tryNewMethod',
  'extraHelpSession',
  'extraShift',
  'complexCase',
  'studySpecialty',
  'audition',
  'rehearse',
  'promoteYourself',
  'shootShortFilm',
  'playGig',
  'releaseSingle',
  'takeOnProject',
  'upskillCourse',
] as const;
export type WorkActionId = (typeof WORK_ACTION_IDS)[number];

export const WORK_ACTIONS: Record<
  WorkActionId,
  { track: CareerTrack; hours: number; energy: number }
> = {
  prepareLessons: { track: 'teaching', hours: 4, energy: 40 },
  tryNewMethod: { track: 'teaching', hours: 3, energy: 30 },
  extraHelpSession: { track: 'teaching', hours: 3, energy: 30 },
  extraShift: { track: 'medicine', hours: 8, energy: 120 },
  complexCase: { track: 'medicine', hours: 4, energy: 60 },
  studySpecialty: { track: 'medicine', hours: 6, energy: 50 },
  audition: { track: 'performing', hours: 4, energy: 50 },
  rehearse: { track: 'performing', hours: 5, energy: 50 },
  promoteYourself: { track: 'performing', hours: 3, energy: 20 },
  shootShortFilm: { track: 'performing', hours: 10, energy: 80 },
  playGig: { track: 'performing', hours: 4, energy: 50 },
  releaseSingle: { track: 'performing', hours: 8, energy: 60 },
  takeOnProject: { track: 'office', hours: 6, energy: 60 },
  upskillCourse: { track: 'office', hours: 4, energy: 30 },
};

export type WorkActionBlock =
  | 'noJob'
  | 'otherTrack'
  | 'doneThisMonth'
  | 'noTime'
  | 'tooTired'
  | 'cannotAfford'
  | 'specialised'
  | 'underContract'
  | 'releasing';

export const WORK_ACTION_MESSAGES: Record<WorkActionBlock, string> = {
  noJob: 'You need a job for this.',
  otherTrack: 'This is part of a different kind of career.',
  doneThisMonth: 'You have already done this this month.',
  noTime: 'You have no free time left this month.',
  tooTired: 'You are too tired; rest first.',
  cannotAfford: 'You cannot afford the course fee right now.',
  underContract: 'You are already working on a production; finish it first.',
  releasing: 'Your last single is still earning royalties; release the next one when it has run.',
  specialised: 'You have already earned your specialism.',
};

/** Specialisms each track can lead to, chosen from the person's strongest skill. */
const SPECIALTIES: Record<CareerTrack, [SkillKey, string][]> = {
  teaching: [
    ['leadership', 'school leadership'],
    ['care', 'pastoral care'],
    ['science', 'science teaching'],
    ['reading', 'literacy'],
  ],
  medicine: [
    ['logic', 'surgery'],
    ['care', 'paediatrics'],
    ['science', 'research medicine'],
    ['socializing', 'family medicine'],
  ],
  performing: [
    ['music', 'musical theatre'],
    ['art', 'screen acting'],
    ['socializing', 'stage performance'],
  ],
  office: [
    ['leadership', 'management'],
    ['logic', 'analysis'],
    ['technology', 'technical leadership'],
    ['business', 'client relations'],
  ],
};

export function specialtyFor(c: Character, track: CareerTrack): string {
  const options = SPECIALTIES[track];
  const best = options.reduce((a, b) => (c.skills[b[0]] > c.skills[a[0]] ? b : a));
  return best[1];
}

function courseFee(world: World, c: Character): bigint {
  return applyPercent(medianWage(world, c.countryCode), 5);
}

/** Musicians (who gig and release music rather than audition). */
const MUSIC = new Set(['musician', 'singer']);
/** Studio time for a single: 15% of the local median monthly wage. */
function studioBudget(world: World, c: Character): bigint {
  return applyPercent(medianWage(world, c.countryCode), 15);
}
/** Monthly royalties for a hit single, % of the median wage, by standing (as acting roles). */
const ROYALTY_PERCENT = { extra: 5, supporting: 15, lead: 40 } as const;

/** A short film's budget: 20% of the local median monthly wage. */
function filmBudget(world: World, c: Character): bigint {
  return applyPercent(medianWage(world, c.countryCode), 20);
}

function canPay(world: World, c: Character, amount: bigint): boolean {
  const payer = payerFor(world, c);
  if (!payer) return false;
  const bal = (id: string | null) => (id ? (world.ledger.accounts[id]?.balance ?? 0n) : 0n);
  return bal(payer.checkingId) + bal(payer.savingsId) >= amount;
}

const countKey = (id: WorkActionId) => `work:${id}`;

export function workActionBlock(
  world: World,
  c: Character,
  id: WorkActionId,
): WorkActionBlock | null {
  const e = activeEmployment(world, c);
  if (!e) return 'noJob';
  const def = WORK_ACTIONS[id];
  if (careerTrack(e) !== def.track) return 'otherTrack';
  // Directors make films and musicians play and release music instead of auditioning.
  const directing = e.terms.occupationId === 'film-director';
  const music = MUSIC.has(e.terms.occupationId);
  if (
    (id === 'audition' && (directing || music || e.terms.occupationId === 'actor')) ||
    (id === 'shootShortFilm' && !directing) ||
    ((id === 'playGig' || id === 'releaseSingle') && !music)
  )
    return 'otherTrack';
  if (id === 'releaseSingle' && c.career.contract) return 'releasing';
  if (id === 'audition' && c.career.contract) return 'underContract';
  if (world.activity.tick === world.tick && (world.activity.counts[countKey(id)] ?? 0) > 0)
    return 'doneThisMonth';
  const t = timeBudget(world);
  if (t.used + def.hours > t.total) return 'noTime';
  if (c.stats.energy < def.energy) return 'tooTired';
  if (id === 'studySpecialty' && c.career.specialty !== null) return 'specialised';
  if (id === 'upskillCourse' && !canPay(world, c, courseFee(world, c))) return 'cannotAfford';
  if (id === 'shootShortFilm' && !canPay(world, c, filmBudget(world, c))) return 'cannotAfford';
  if (id === 'releaseSingle' && !canPay(world, c, studioBudget(world, c))) return 'cannotAfford';
  return null;
}

export interface WorkActionResult {
  actionId: WorkActionId;
  outcome: 'success' | 'mixed' | 'failure';
  key: string;
  params: Record<string, string | number>;
}

export class WorkActionError extends Error {
  readonly code: WorkActionBlock;
  constructor(code: WorkActionBlock) {
    super(WORK_ACTION_MESSAGES[code]);
    this.name = 'WorkActionError';
    this.code = code;
  }
}

function bump(e: Employment, delta: number): void {
  e.performance = clamp(e.performance + delta, 0, 1000);
}

function reputation(c: Character, delta: number): void {
  c.career.reputation = clamp(c.career.reputation + delta, 0, 1000);
}

function occupationSkills(e: Employment): readonly SkillKey[] {
  return getOccupation(e.terms.occupationId).skills;
}

/** Progress towards a specialism; completing it raises pay by 10% and reputation. */
function advanceSpecialty(world: World, c: Character, e: Employment, points: number): boolean {
  if (c.career.specialty !== null) return false;
  c.career.specialtyProgress = clamp(c.career.specialtyProgress + points, 0, 100);
  if (c.career.specialtyProgress < 100) return false;
  const specialty = specialtyFor(c, careerTrack(e));
  c.career.specialty = specialty;
  e.salaryMinor += applyPercent(e.salaryMinor, 10);
  reputation(c, 50);
  addBiography(world, c.id, 'work', 'bio.specialised', { specialty });
  addNotification(world, 'work', 'ntf.specialised', { specialty }, 'career');
  return true;
}

/** Pay for extra hours, from the job's hourly rate (time and a half). */
export function overtimePay(c: Character, e: Employment, hours: number): bigint {
  // Job hours are monthly.
  const monthlyHours = BigInt(
    Math.max(1, e.terms.hours || getRules(c.countryCode).work.fullTimeHours),
  );
  return (e.salaryMinor * BigInt(hours) * 3n) / (monthlyHours * 2n);
}

export function performWorkAction(world: World, c: Character, id: WorkActionId): WorkActionResult {
  const block = workActionBlock(world, c, id);
  const e = activeEmployment(world, c);
  if (block || !e) throw new WorkActionError(block ?? 'noJob');
  const def = WORK_ACTIONS[id];
  spendHours(world, def.hours);
  world.activity.counts[countKey(id)] = 1;
  changeStat(world, c, 'energy', -def.energy, `work:${id}`);
  const roll = () => withRng(world, 'career', (rng) => rng.int(100));
  const skills = occupationSkills(e);
  const skillAvg = Math.floor(skills.reduce((s, k) => s + c.skills[k], 0) / skills.length);
  const done = (
    outcome: WorkActionResult['outcome'],
    key: string,
    params: WorkActionResult['params'] = {},
  ) => ({
    actionId: id,
    outcome,
    key,
    params,
  });
  const train = (amount: number) => {
    for (const k of skills) changeSkill(world, c, k, amount, `work:${id}`);
  };

  switch (id) {
    case 'prepareLessons':
      bump(e, 30 + Math.floor(c.stats.discipline / 25));
      train(10);
      changeStat(world, c, 'stress', 10, 'work:prepareLessons');
      return done('success', 'work.prepareLessons');
    case 'tryNewMethod': {
      const works =
        roll() <
        clamp(35 + Math.floor(c.stats.creativity / 20) + Math.floor(skillAvg / 25), 10, 90);
      if (works) {
        bump(e, 60);
        reputation(c, 25);
        changeStat(world, c, 'confidence', 30, 'work:newMethod');
        return done('success', 'work.tryNewMethod.worked');
      }
      bump(e, -30);
      changeStat(world, c, 'stress', 20, 'work:newMethod');
      return done('failure', 'work.tryNewMethod.flopped');
    }
    case 'extraHelpSession':
      bump(e, 15);
      reputation(c, 20);
      changeSkill(world, c, 'care', 15, 'work:helpSession');
      changeStat(world, c, 'happiness', 15, 'work:helpSession');
      return done('success', 'work.extraHelpSession');
    case 'extraShift': {
      const pay = overtimePay(c, e, def.hours);
      const into = c.finance?.checkingId ?? c.finance?.savingsId;
      if (into) receiveIncome(world, c.id, into, 'overtime', pay, 'tx.overtime');
      bump(e, 20);
      changeStat(world, c, 'stress', 40, 'work:extraShift');
      return done('success', 'work.extraShift', { amount: pay.toString() });
    }
    case 'complexCase': {
      const bonus = c.career.specialty ? 15 : 0;
      const good =
        roll() <
        clamp(30 + Math.floor(c.skills.science / 15) + Math.floor(skillAvg / 30) + bonus, 10, 92);
      if (good) {
        bump(e, 40);
        reputation(c, 40);
        changeStat(world, c, 'happiness', 25, 'work:complexCase');
        return done('success', 'work.complexCase.good');
      }
      bump(e, -10);
      changeStat(world, c, 'stress', 50, 'work:complexCase');
      return done('mixed', 'work.complexCase.hard');
    }
    case 'studySpecialty': {
      const finished = advanceSpecialty(world, c, e, 10 + Math.floor(c.stats.discipline / 100));
      train(8);
      return finished
        ? done('success', 'work.specialised', { specialty: c.career.specialty ?? '' })
        : done('success', 'work.studySpecialty', { progress: c.career.specialtyProgress });
    }
    case 'audition': {
      const cast =
        roll() <
        clamp(15 + Math.floor(skillAvg / 12) + Math.floor(c.career.reputation / 40), 5, 85);
      if (cast) {
        const role = actingRole(c);
        const film = roll() < 50;
        const median = medianWage(world, c.countryCode);
        // Film pays a fee up front for a 2-month shoot; TV pays monthly for 3 months.
        const fee = film ? applyPercent(median, FILM_FEE_PERCENT[role]) : 0n;
        const into = c.finance?.checkingId ?? c.finance?.savingsId;
        if (film && into) receiveIncome(world, c.id, into, 'gigs', fee, 'tx.gig');
        c.career.contract = {
          kind: film ? 'film' : 'tv',
          role,
          monthlyMinor: film ? 0n : applyPercent(median, TV_MONTH_PERCENT[role]),
          monthsLeft: film ? 2 : 3,
        };
        reputation(c, 40);
        bump(e, 30);
        return done('success', `work.audition.${film ? 'film' : 'tv'}`, {
          role,
          amount: (film ? fee : c.career.contract.monthlyMinor).toString(),
        });
      }
      changeStat(world, c, 'confidence', -20, 'work:audition');
      changeStat(world, c, 'stress', 10, 'work:audition');
      return done('failure', 'work.audition.notThisTime');
    }
    case 'rehearse':
      train(20);
      bump(e, 20);
      return done('success', 'work.rehearse');
    case 'promoteYourself':
      reputation(c, 20);
      changeSkill(world, c, 'socializing', 10, 'work:promote');
      return done('success', 'work.promoteYourself');
    case 'takeOnProject': {
      bump(e, 50);
      changeStat(world, c, 'stress', 30, 'work:project');
      if (roll() < clamp(30 + Math.floor(skillAvg / 20), 10, 80)) {
        reputation(c, 25);
        return done('success', 'work.takeOnProject.shone');
      }
      return done('mixed', 'work.takeOnProject.done');
    }
    case 'shootShortFilm': {
      const payer = payerFor(world, c);
      if (payer) payExpense(world, payer, 'training', filmBudget(world, c), 'tx.shortFilm');
      const hit =
        roll() <
        clamp(
          20 +
            Math.floor((c.skills.art + c.skills.leadership) / 30) +
            Math.floor(c.career.reputation / 40),
          10,
          85,
        );
      train(15);
      if (!hit) {
        reputation(c, 5);
        changeStat(world, c, 'stress', 10, 'work:shortFilm');
        return done('mixed', 'work.shortFilm.flop');
      }
      // A well-received short is a credit; festivals sometimes pay a prize.
      c.career.credits = (c.career.credits ?? 0) + 1;
      reputation(c, 50);
      bump(e, 40);
      const prize = roll() < 40 ? applyPercent(medianWage(world, c.countryCode), 60) : 0n;
      const into = c.finance?.checkingId ?? c.finance?.savingsId;
      if (prize > 0n && into) receiveIncome(world, c.id, into, 'gigs', prize, 'tx.filmPrize');
      return done('success', prize > 0n ? 'work.shortFilm.prize' : 'work.shortFilm.hit', {
        amount: prize.toString(),
      });
    }
    case 'playGig': {
      // Pay grows with reputation: 10% of the median wage, up to 60% for a big name.
      const fee = applyPercent(
        medianWage(world, c.countryCode),
        10 + Math.floor(c.career.reputation / 20),
      );
      const into = c.finance?.checkingId ?? c.finance?.savingsId;
      if (into) receiveIncome(world, c.id, into, 'gigs', fee, 'tx.gig');
      train(15);
      reputation(c, 10);
      bump(e, 20);
      return done('success', 'work.gig', { amount: fee.toString() });
    }
    case 'releaseSingle': {
      const payer = payerFor(world, c);
      if (payer) payExpense(world, payer, 'training', studioBudget(world, c), 'tx.studio');
      train(15);
      const hit =
        roll() <
        clamp(15 + Math.floor(c.skills.music / 15) + Math.floor(c.career.reputation / 40), 10, 85);
      if (!hit) {
        reputation(c, 5);
        return done('mixed', 'work.single.flop');
      }
      const role = actingRole(c);
      c.career.contract = {
        kind: 'single',
        role,
        monthlyMinor: applyPercent(medianWage(world, c.countryCode), ROYALTY_PERCENT[role]),
        monthsLeft: 6,
      };
      reputation(c, 30);
      bump(e, 30);
      return done('success', 'work.single.hit', {
        amount: c.career.contract.monthlyMinor.toString(),
      });
    }
    case 'upskillCourse': {
      const payer = payerFor(world, c);
      if (payer) payExpense(world, payer, 'training', courseFee(world, c), 'tx.course');
      train(25);
      const finished = advanceSpecialty(world, c, e, 15);
      return finished
        ? done('success', 'work.specialised', { specialty: c.career.specialty ?? '' })
        : done('success', 'work.upskillCourse', { progress: c.career.specialtyProgress });
    }
  }
}

export interface Satisfaction {
  score: number;
  factors: { key: string; effect: number }[];
}

/**
 * How happy someone is in their job (0-100), from pay within the band, stress, the manager,
 * how well it is going, professional reputation and a specialism. Derived, never stored.
 */
export function jobSatisfaction(world: World, c: Character, e: Employment): Satisfaction {
  const factors: Satisfaction['factors'] = [];
  const add = (key: string, effect: number) => {
    if (effect !== 0) factors.push({ key, effect });
  };
  const span = e.terms.salaryMaxMinor - e.terms.salaryMinMinor;
  const payPos = span > 0n ? Number(((e.salaryMinor - e.terms.salaryMinMinor) * 100n) / span) : 50;
  add('pay', Math.round((clamp(payPos, 0, 100) - 50) / 5));
  add('stress', c.stats.stress > 600 ? -Math.round((c.stats.stress - 600) / 25) : 0);
  const manager = e.managerId ? findRelationship(world, c.id, e.managerId) : undefined;
  if (manager) add('manager', Math.round((manager.closeness - 50) / 5));
  add('performance', Math.round((e.performance - 500) / 50));
  add('reputation', Math.round((c.career.reputation - 300) / 50));
  if (c.career.specialty) add('specialty', 5);
  const score = clamp(55 + factors.reduce((s, f) => s + f.effect, 0), 0, 100);
  return { score, factors };
}

/**
 * Monthly career upkeep for the player: reputation follows performance, and satisfaction
 * nudges happiness. Called from the job's monthly step.
 */
/** Role offered at an audition: grows with screen credits (lead also needs reputation). */
export function actingRole(c: Character): 'extra' | 'supporting' | 'lead' {
  const credits = c.career.credits ?? 0;
  if (credits >= 5 && c.career.reputation >= 500) return 'lead';
  return credits >= 2 ? 'supporting' : 'extra';
}
/** Pay as a percentage of the local median monthly wage. */
const FILM_FEE_PERCENT = { extra: 30, supporting: 150, lead: 600 } as const;
const TV_MONTH_PERCENT = { extra: 25, supporting: 80, lead: 250 } as const;
const CREDIT_REPUTATION = { extra: 10, supporting: 25, lead: 60 } as const;

/** Monthly: TV pay, and a screen credit when a production wraps. */
function actingMonth(world: World, c: Character): void {
  const k = c.career.contract;
  if (!k) return;
  const into = c.finance?.checkingId ?? c.finance?.savingsId;
  if (k.monthlyMinor > 0n && into)
    receiveIncome(
      world,
      c.id,
      into,
      'gigs',
      k.monthlyMinor,
      k.kind === 'single' ? 'tx.royalties' : 'tx.tvEpisodes',
    );
  k.monthsLeft -= 1;
  if (k.monthsLeft > 0) return;
  c.career.credits = (c.career.credits ?? 0) + 1;
  reputation(c, CREDIT_REPUTATION[k.role]);
  addNotification(
    world,
    'work',
    k.kind === 'single' ? 'ntf.singleRun' : 'ntf.productionWrapped',
    { kind: k.kind, role: k.role },
    'career',
  );
  c.career.contract = undefined;
}

export function careerMonth(world: World, c: Character, e: Employment): void {
  actingMonth(world, c);
  if (e.performance >= 700) reputation(c, 5);
  else if (e.performance < 300) reputation(c, -10);
  const { score } = jobSatisfaction(world, c, e);
  changeStat(world, c, 'happiness', Math.trunc((score - 50) / 2), 'work:satisfaction');
}
