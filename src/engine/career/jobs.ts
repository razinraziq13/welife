import { clamp, sortedKeys, sortedValues } from '../core/data';
import { applyBp, applyPercent, divRound, maxBig, minBig } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { changeSkill, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { scaledGain } from '../education/catalog';
import { getLocation } from '../world/countries';
import { getRules } from '../world/rules';
import { hasUnspentConviction, inCustody, workRights } from '../civics/status';
import { meetPeople } from '../social/npcs';
import { addMemory, memorySentiment } from '../social/memories';
import { findRelationship } from '../social/relationships';
import type {
  Character,
  ContractType,
  Employment,
  JobApplication,
  JobTerms,
  Posting,
  World,
} from '../state/schema';
import {
  LEVEL_PAY,
  OCCUPATIONS,
  getOccupation,
  jobTitle,
  meetsEducation,
  type OccupationDefinition,
} from './occupations';

/**
 * Careers (spec §4 Education/career, §3.7): job postings with qualifications, salary bands,
 * jurisdiction and capacity; applications, interviews (skills, preparation, competition and
 * seeded randomness), offers and negotiation; employment with contract, compensation, hours,
 * performance, manager relations, reviews, promotions and layoffs. PROPOSED TUNING.
 */

export const MAX_POSTINGS = 24;
export const MAX_ACTIVE_APPLICATIONS = 5;
const EMPLOYER_PREFIX = [
  'Apex',
  'Blue Harbour',
  'Crescent',
  'Delta',
  'Evergreen',
  'Fairview',
  'Golden Gate',
  'Horizon',
  'Ironwood',
  'Juniper',
  'Keystone',
  'Lighthouse',
  'Meridian',
  'Northstar',
  'Oakline',
  'Pinnacle',
  'Quayside',
  'Redwood',
  'Silverline',
  'Summit',
];
const EMPLOYER_SUFFIX: Record<string, string> = {
  agriculture: 'Farms',
  energy: 'Energy',
  manufacturing: 'Industries',
  construction: 'Builders',
  retail: 'Stores',
  hospitality: 'Hospitality',
  logistics: 'Logistics',
  technology: 'Technologies',
  telecom: 'Telecom',
  banking: 'Bank',
  insurance: 'Insurance',
  realEstate: 'Properties',
  legal: 'Legal',
  consulting: 'Partners',
  healthcare: 'Health',
  education: 'Academy',
  government: 'Public Service',
  media: 'Media',
  arts: 'Arts Centre',
  sports: 'Sports Club',
  research: 'Research Institute',
  automotive: 'Motors',
  aviation: 'Airways',
  personalCare: 'Wellness',
  nonprofit: 'Foundation',
};

function employerName(world: World, industryId: string): string {
  const prefix = withRng(world, 'career', (rng) => rng.pick(EMPLOYER_PREFIX));
  return `${prefix} ${EMPLOYER_SUFFIX[industryId] ?? 'Group'}`;
}

/** Monthly salary band for an occupation and level at a location (full-time). */
export function salaryBand(
  world: World,
  occupation: OccupationDefinition,
  level: number,
  locationId: string,
): { min: bigint; max: bigint } {
  const { country, location } = getLocation(locationId);
  const median = medianWage(world, country.code);
  const levelPay = LEVEL_PAY[Math.min(level, LEVEL_PAY.length - 1)] ?? 100;
  const locationFactor = Math.floor((location.costIndex + 100) / 2);
  const mid = applyPercent(
    applyPercent(applyPercent(median, occupation.pay), levelPay),
    locationFactor,
  );
  return { min: applyPercent(mid, 88), max: applyPercent(mid, 115) };
}

function scaleForContract(
  amount: bigint,
  contract: ContractType,
  hours: number,
  fullTime: number,
): bigint {
  if (contract === 'internship') return applyPercent(amount, 60);
  return divRound(amount * BigInt(hours), BigInt(fullTime));
}

export function makeTerms(
  world: World,
  occupation: OccupationDefinition,
  level: number,
  contract: ContractType,
  locationId: string,
): JobTerms {
  const { country } = getLocation(locationId);
  const fullTime = getRules(country.code).work.fullTimeHours;
  const hours =
    contract === 'partTime' ? Math.floor(fullTime / 2) : contract === 'casual' ? 40 : fullTime;
  const band = salaryBand(world, occupation, level, locationId);
  return {
    occupationId: occupation.id,
    level,
    employer: employerName(world, occupation.industryId),
    industryId: occupation.industryId,
    contract,
    hours,
    salaryMinMinor: scaleForContract(band.min, contract, hours, fullTime),
    salaryMaxMinor: scaleForContract(band.max, contract, hours, fullTime),
    locationId,
  };
}

function difficultyPercent(world: World): number {
  return world.rules.difficulty === 'casual'
    ? 70
    : world.rules.difficulty === 'challenging'
      ? 140
      : 100;
}

/** Monthly refresh of the player's local job board. */
export function refreshJobMarket(world: World): void {
  const player = world.characters[world.activeCharacterId];
  if (player?.death !== null) return;
  const age = ageYears(world, player);
  const rules = getRules(player.countryCode);
  for (const id of sortedKeys(world.jobs.postings)) {
    const p = world.jobs.postings[id];
    if (p && (p.expiresTick < world.tick || p.terms.locationId !== player.locationId))
      Reflect.deleteProperty(world.jobs.postings, id);
  }
  if (age < rules.work.minWorkAge) return;
  world.jobs.refreshedTick = world.tick;
  const economy = world.economy[player.countryCode];
  const cycle = economy?.cycle ?? 0;
  const unemployment = economy?.unemploymentBp ?? 500;
  const count = withRng(world, 'career', (rng) => rng.range(3, 6)) - (cycle < -40 ? 1 : 0);
  const minor = age < 18;
  const quals = player.education.qualifications;
  const candidates = OCCUPATIONS.filter((o) => !o.hidden && (!minor || o.teen));
  for (let i = 0; i < count; i++) {
    const occupation = withRng(world, 'career', (rng) =>
      rng.weighted(candidates.map((o) => ({ value: o, weight: meetsEducation(o, quals) ? 6 : 1 }))),
    );
    const level = Math.min(
      occupation.maxLevel,
      withRng(world, 'career', (rng) =>
        rng.weighted([
          { value: 0, weight: 50 },
          { value: 1, weight: 30 },
          { value: 2, weight: 14 },
          { value: 3, weight: 5 },
          { value: 4, weight: 1 },
        ]),
      ),
    );
    const contract: ContractType = minor
      ? withRng(world, 'career', (rng) => (rng.int(2) === 0 ? 'partTime' : 'casual'))
      : withRng(world, 'career', (rng) =>
          rng.weighted<ContractType>([
            { value: 'permanent', weight: 60 },
            { value: 'fixedTerm', weight: 15 },
            { value: 'partTime', weight: 15 },
            { value: 'casual', weight: occupation.teen ? 10 : 3 },
            { value: 'internship', weight: level === 0 && occupation.education !== 'none' ? 8 : 0 },
          ]),
        );
    const posting: Posting = {
      id: nextId(world, 'job'),
      terms: makeTerms(world, occupation, level, contract, player.locationId),
      openings: withRng(world, 'career', (rng) => rng.range(1, 3)),
      applicants: clamp(
        Math.floor(
          (((withRng(world, 'career', (rng) => rng.range(6, 28)) * unemployment) / 500) *
            difficultyPercent(world)) /
            100,
        ),
        0,
        500,
      ),
      postedTick: world.tick,
      expiresTick: world.tick + withRng(world, 'career', (rng) => rng.range(3, 6)),
    };
    world.jobs.postings[posting.id] = posting;
  }
  const all = sortedValues(world.jobs.postings).sort(
    (a, b) => a.postedTick - b.postedTick || (a.id < b.id ? -1 : 1),
  );
  for (const p of all.slice(0, Math.max(0, all.length - MAX_POSTINGS)))
    Reflect.deleteProperty(world.jobs.postings, p.id);
}

/** Months worked in an industry (from employment records). */
export function experienceMonths(
  world: World,
  characterId: string,
  industryId: string | null,
): number {
  let months = 0;
  for (const e of sortedValues(world.employment)) {
    if (e.characterId !== characterId) continue;
    if (industryId !== null && e.terms.industryId !== industryId) continue;
    months += (e.endTick ?? world.tick) - e.startTick;
  }
  return months;
}

export type JobRejection =
  | 'tooYoung'
  | 'inSchool'
  | 'unknownPosting'
  | 'notQualified'
  | 'notSkilled'
  | 'notExperienced'
  | 'alreadyApplied'
  | 'tooMany'
  | 'noOffer'
  | 'noJob'
  | 'tooSoon'
  | 'tooYoungToRetire'
  | 'retired'
  | 'noChange'
  | 'noPreparation'
  | 'notHeadhunted'
  | 'alreadyCountered'
  | 'noWorkRights'
  | 'limitedWorkRights'
  | 'inCustody'
  | 'record';

export const JOB_MESSAGES: Record<JobRejection, string> = {
  tooYoung: 'You are too young to work here.',
  noWorkRights: 'Your visa does not allow you to work here.',
  limitedWorkRights: 'Your visa only allows part-time or casual work.',
  inCustody: 'You cannot work while in custody.',
  record: 'This employer does not hire people with an unspent criminal record.',
  inSchool: 'While at school you can only take part-time or casual work.',
  unknownPosting: 'That job is no longer advertised.',
  notQualified: 'You do not have the qualifications this job requires.',
  notSkilled: 'Your skills are not yet strong enough for this job.',
  notExperienced: 'This role needs more experience in the industry.',
  alreadyApplied: 'You have already applied for this job.',
  tooMany: 'You can have at most five applications in progress.',
  noOffer: 'There is no open offer to answer.',
  noJob: 'You do not have a job.',
  tooSoon: 'You asked for a raise less than a year ago.',
  tooYoungToRetire: 'You can retire from the age of 55.',
  retired: 'You are retired.',
  noChange: 'That is already your setting.',
  noPreparation: 'There is no interview to prepare for.',
  notHeadhunted:
    'Only an offer from a company that approached you while you have a job can be used to ask for a match.',
  alreadyCountered: 'You have already asked your employer to match this offer.',
};

export class JobError extends Error {
  readonly code: JobRejection;
  constructor(code: JobRejection) {
    super(JOB_MESSAGES[code]);
    this.name = 'JobError';
    this.code = code;
  }
}

/** Experience needed per level, months in the same industry. */
const LEVEL_EXPERIENCE = [0, 12, 36, 60, 96] as const;

export function jobEligibility(world: World, c: Character, terms: JobTerms): JobRejection | null {
  const rules = getRules(c.countryCode);
  const age = ageYears(world, c);
  const occupation = getOccupation(terms.occupationId);
  if (age < rules.work.minWorkAge || (age < 18 && !occupation.teen)) return 'tooYoung';
  if (inCustody(world, c)) return 'inCustody';
  const rights = workRights(c);
  if (rights === 'none') return 'noWorkRights';
  if (rights === 'limited' && terms.contract !== 'partTime' && terms.contract !== 'casual')
    return 'limitedWorkRights';
  if (terms.level >= 2 && hasUnspentConviction(world, c.id, 'serious')) return 'record';
  const school = c.education.current;
  if (
    school &&
    school.stage !== 'tertiary' &&
    terms.contract !== 'partTime' &&
    terms.contract !== 'casual'
  )
    return 'inSchool';
  if (c.finance?.retired) return 'retired';
  if (!meetsEducation(occupation, c.education.qualifications)) return 'notQualified';
  const skillAverage = Math.floor(
    occupation.skills.reduce((s, k) => s + c.skills[k], 0) / occupation.skills.length,
  );
  if (skillAverage < occupation.minSkill) return 'notSkilled';
  const experience = experienceMonths(world, c.id, terms.industryId);
  const needed = LEVEL_EXPERIENCE[terms.level] ?? 96;
  const masters = c.education.qualifications.some((q) => q.startsWith('master:'));
  if (experience < needed && !(terms.level === 1 && masters)) return 'notExperienced';
  return null;
}

function activeApplications(world: World, characterId: string): JobApplication[] {
  return sortedValues(world.jobs.applications).filter(
    (a) =>
      a.characterId === characterId &&
      (a.status === 'applied' || a.status === 'interview' || a.status === 'offered'),
  );
}

/** Someone who would put in a good word: positive memories or a close friendship, same industry. */
export function findReferrer(world: World, c: Character, industryId: string): string | null {
  for (const id of sortedKeys(world.characters)) {
    if (id === c.id) continue;
    const npc = world.characters[id];
    if (npc?.death !== null || npc.employmentId === null) continue;
    const job = world.employment[npc.employmentId];
    if (job?.status !== 'active' || job.terms.industryId !== industryId) continue;
    const fondness = memorySentiment(world, id, c.id);
    const rel = findRelationship(world, id, c.id);
    if (fondness >= 30 || (rel && rel.closeness >= 70 && rel.trust >= 60)) return id;
  }
  return null;
}

export function applyForJob(world: World, c: Character, postingId: string): JobApplication {
  const posting = world.jobs.postings[postingId];
  if (!posting) throw new JobError('unknownPosting');
  const active = activeApplications(world, c.id);
  if (active.some((a) => a.postingId === postingId)) throw new JobError('alreadyApplied');
  if (active.length >= MAX_ACTIVE_APPLICATIONS) throw new JobError('tooMany');
  const reason = jobEligibility(world, c, posting.terms);
  if (reason) throw new JobError(reason);
  const referrerId = findReferrer(world, c, posting.terms.industryId);
  const app: JobApplication = {
    id: nextId(world, 'app'),
    postingId,
    characterId: c.id,
    terms: posting.terms,
    applicants: posting.applicants,
    tick: world.tick,
    status: 'applied',
    interviewTick: world.tick + 1,
    preparation: 0,
    referrerId,
    score: null,
    offerSalaryMinor: null,
    offerExpiresTick: null,
    negotiated: false,
  };
  world.jobs.applications[app.id] = app;
  // Screening: qualified applicants are shortlisted for an interview next month.
  const occupation = getOccupation(posting.terms.occupationId);
  const skill = Math.floor(
    occupation.skills.reduce((s, k) => s + c.skills[k], 0) / occupation.skills.length,
  );
  const screen =
    skill +
    Math.floor(c.stats.reputation / 5) +
    (referrerId ? 150 : 0) +
    Math.min(150, experienceMonths(world, c.id, posting.terms.industryId) * 3) +
    withRng(world, 'career', (rng) => rng.range(0, 400));
  const bar = Math.floor(
    ((250 + Math.min(300, posting.applicants * 5)) * difficultyPercent(world)) / 100,
  );
  if (screen >= bar) {
    app.status = 'interview';
    world.events.scheduled.push({
      id: nextId(world, 'csq'),
      sourceInstanceId: app.id,
      eventId: 'job-interview',
      characterId: c.id,
      dueTick: world.tick + 1,
      subjectId: null,
      context: {
        applicationId: app.id,
        employer: posting.terms.employer,
        title: jobTitle(occupation, posting.terms.level),
      },
    });
  }
  if (referrerId) {
    addNotification(
      world,
      'work',
      'ntf.referral',
      { name: world.characters[referrerId]?.identity.firstName ?? '' },
      'person',
      referrerId,
    );
  }
  return app;
}

export function prepareForInterview(world: World, c: Character, applicationId: string): number {
  const app = world.jobs.applications[applicationId];
  if (app?.characterId !== c.id || app.status !== 'interview') throw new JobError('noPreparation');
  const gain = clamp(Math.floor((25 * (100 - app.preparation)) / 100), 1, 25);
  app.preparation = clamp(app.preparation + gain, 0, 100);
  return app.preparation;
}

/** Resolves an interview (called by the interview event's choice). */
export function resolveInterview(world: World, applicationId: string, style: string): void {
  const app = world.jobs.applications[applicationId];
  const c = app ? world.characters[app.characterId] : undefined;
  if (!app || !c || app.status !== 'interview') return;
  const occupation = getOccupation(app.terms.occupationId);
  const skill = Math.floor(
    occupation.skills.reduce((s, k) => s + c.skills[k], 0) / occupation.skills.length,
  );
  const experience = Math.min(200, experienceMonths(world, c.id, app.terms.industryId) * 4);
  const persona = withRng(world, 'career', (rng) => rng.pick(['confident', 'honest', 'curious']));
  const noise = withRng(world, 'career', (rng) => rng.range(-100, 100));
  const score = clamp(
    Math.floor((skill * 4) / 10) +
      Math.floor(experience / 2) +
      Math.floor((app.preparation * 3) / 2) +
      Math.floor((c.stats.confidence + c.stats.socialSkill) / 14) +
      (persona === style ? 90 : 0) +
      (app.referrerId ? 80 : 0) +
      noise +
      120,
    0,
    1000,
  );
  const threshold = Math.floor(
    ((420 + Math.min(300, app.applicants * 4)) * difficultyPercent(world)) / 100,
  );
  app.score = score;
  if (score >= threshold) {
    app.status = 'offered';
    const span = app.terms.salaryMaxMinor - app.terms.salaryMinMinor;
    const share = clamp(Math.floor(((score - threshold) * 100) / 400), 0, 100);
    app.offerSalaryMinor = app.terms.salaryMinMinor + applyPercent(span, share);
    app.offerExpiresTick = world.tick + 2;
    addNotification(
      world,
      'work',
      'ntf.jobOffer',
      { employer: app.terms.employer, title: jobTitle(occupation, app.terms.level) },
      'career',
    );
  } else {
    app.status = 'rejected';
    addNotification(
      world,
      'work',
      'ntf.jobRejected',
      { employer: app.terms.employer, title: jobTitle(occupation, app.terms.level) },
      'career',
    );
  }
}

export type OfferResponse = 'accept' | 'negotiate' | 'decline' | 'counter';

/** Chance (percent) that the current employer matches a rival offer (gameplay expansion). */
export function counterOfferChance(world: World, c: Character, e: Employment): number {
  const manager = e.managerId ? findRelationship(world, c.id, e.managerId) : undefined;
  return clamp(
    30 +
      Math.floor((e.performance - 500) / 10) +
      Math.floor(c.career.reputation / 50) +
      (manager ? Math.floor((manager.closeness - 50) / 3) : 0),
    10,
    85,
  );
}

/**
 * Asks the current employer to match a rival's offer. Matched: the salary rises to the offer
 * and the rival offer is turned down. Refused: the offer stays open, the manager is a little
 * put out, and it cannot be tried again for this offer.
 */
function counterOffer(
  world: World,
  c: Character,
  app: JobApplication,
  offer: bigint,
): 'matched' | 'notMatched' {
  const e = activeEmployment(world, c);
  if (!app.headhunted || !e) throw new JobError('notHeadhunted');
  if (app.countered) throw new JobError('alreadyCountered');
  app.countered = true;
  const chance = counterOfferChance(world, c, e);
  if (withRng(world, 'career', (rng) => rng.int(100) < chance)) {
    e.salaryMinor = maxBig(e.salaryMinor, offer);
    app.status = 'declined';
    changeStat(world, c, 'happiness', 40, 'work:counterOffer');
    addBiography(world, c.id, 'work', 'bio.counterOffer', {
      employer: e.terms.employer,
      rival: app.terms.employer,
    });
    return 'matched';
  }
  if (e.managerId) {
    const rel = findRelationship(world, c.id, e.managerId);
    if (rel) rel.closeness = clamp(rel.closeness - 5, 0, 100);
  }
  return 'notMatched';
}

export function respondToOffer(
  world: World,
  c: Character,
  applicationId: string,
  response: OfferResponse,
): 'hired' | 'improved' | 'withdrawn' | 'declined' | 'unchanged' | 'matched' | 'notMatched' {
  const app = world.jobs.applications[applicationId];
  if (app?.characterId !== c.id || app.status !== 'offered' || app.offerSalaryMinor === null)
    throw new JobError('noOffer');
  if (response === 'counter') return counterOffer(world, c, app, app.offerSalaryMinor);
  if (response === 'decline') {
    app.status = 'declined';
    return 'declined';
  }
  if (response === 'negotiate') {
    if (app.negotiated) return 'unchanged';
    app.negotiated = true;
    const margin = clamp((app.score ?? 500) - 500, -200, 300);
    const chance = clamp(
      35 + Math.floor((c.skills.business + c.stats.confidence) / 40) + Math.floor(margin / 10),
      10,
      90,
    );
    const roll = withRng(world, 'career', (rng) => rng.int(100));
    if (roll < chance) {
      const raise = withRng(world, 'career', (rng) => rng.range(5, 12));
      app.offerSalaryMinor = minBig(
        app.terms.salaryMaxMinor,
        app.offerSalaryMinor + applyPercent(app.offerSalaryMinor, raise),
      );
      return 'improved';
    }
    if (roll >= 92) {
      app.status = 'withdrawn';
      addNotification(
        world,
        'work',
        'ntf.offerWithdrawn',
        { employer: app.terms.employer },
        'career',
      );
      return 'withdrawn';
    }
    return 'unchanged';
  }
  if (c.employmentId) endEmployment(world, c, 'quit');
  startEmployment(world, c, app.terms, app.offerSalaryMinor);
  app.status = 'hired';
  for (const other of activeApplications(world, c.id))
    if (other.id !== app.id) other.status = 'withdrawn';
  return 'hired';
}

export function startEmployment(
  world: World,
  c: Character,
  terms: JobTerms,
  salary: bigint,
): Employment {
  const occupation = getOccupation(terms.occupationId);
  const employment: Employment = {
    id: nextId(world, 'emp'),
    characterId: c.id,
    terms,
    title: jobTitle(occupation, terms.level),
    salaryMinor: salary,
    performance: 500,
    managerId: null,
    startTick: world.tick,
    endTick: null,
    status: 'active',
    endReason: null,
    lastReviewTick: world.tick,
    warnings: 0,
    effort: 'steady',
    raiseRequestedTick: null,
  };
  world.employment[employment.id] = employment;
  c.employmentId = employment.id;
  if (c.finance) {
    c.finance.benefitMonths = 0;
    c.finance.benefitMinor = 0n;
  }
  if (c.id === world.activeCharacterId) {
    const age = ageYears(world, c);
    const [manager] = meetPeople(world, c, 1, 'manager', [
      Math.max(25, age + 3),
      Math.max(30, age + 20),
    ]);
    if (manager) employment.managerId = manager.id;
    meetPeople(world, c, 3, 'colleague', [Math.max(18, age - 8), Math.max(22, age + 15)]);
    addBiography(world, c.id, 'work', 'bio.newJob', {
      title: employment.title,
      employer: terms.employer,
    });
    addNotification(
      world,
      'work',
      'ntf.newJob',
      { title: employment.title, employer: terms.employer },
      'career',
    );
  }
  return employment;
}

export function endEmployment(
  world: World,
  c: Character,
  reason: NonNullable<Employment['endReason']>,
): void {
  const employment = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (!employment) return;
  employment.status = 'ended';
  employment.endTick = world.tick;
  employment.endReason = reason;
  c.employmentId = null;
  if (c.finance && (reason === 'laidOff' || reason === 'contractEnded')) {
    const rules = getRules(c.countryCode).benefits;
    if (rules.unemployment !== 'none' && rules.unemploymentMonths > 0) {
      c.finance.benefitMonths = rules.unemploymentMonths;
      c.finance.benefitMinor =
        rules.unemployment === 'wage'
          ? applyPercent(employment.salaryMinor, rules.unemploymentPercent)
          : applyPercent(medianWage(world, c.countryCode), rules.unemploymentPercent);
    }
  }
  if (c.id === world.activeCharacterId && reason !== 'died' && reason !== 'promoted') {
    addBiography(world, c.id, 'work', `bio.jobEnded.${reason}`, {
      title: employment.title,
      employer: employment.terms.employer,
    });
    addNotification(
      world,
      'work',
      `ntf.jobEnded.${reason}`,
      { title: employment.title, employer: employment.terms.employer },
      'career',
    );
  }
  // Keep the record set small for NPCs: only the latest few ended jobs.
  if (c.id !== world.activeCharacterId) {
    const ended = sortedValues(world.employment).filter(
      (e) => e.characterId === c.id && e.status === 'ended',
    );
    for (const e of ended.slice(0, Math.max(0, ended.length - 2)))
      Reflect.deleteProperty(world.employment, e.id);
  }
}

const EFFORT_PERFORMANCE = { coast: -150, steady: 0, hard: 120 } as const;
const EFFORT_STRESS = { coast: -5, steady: 4, hard: 18 } as const;
const EFFORT_SKILL = { coast: 50, steady: 100, hard: 150 } as const;

function layoffPpm(world: World, c: Character, e: Employment): number {
  const economy = world.economy[c.countryCode];
  const base = 2000;
  let ppm = Math.floor((base * (economy?.unemploymentBp ?? 500)) / 500);
  if ((economy?.cycle ?? 0) < -40) ppm *= 2;
  if (e.performance < 400) ppm *= 2;
  return Math.floor((ppm * difficultyPercent(world)) / 100);
}

/** Annual review: raise with inflation and performance, promotion, or warnings. */
function review(world: World, c: Character, e: Employment, isPlayer: boolean): void {
  e.lastReviewTick = world.tick;
  const occupation = getOccupation(e.terms.occupationId);
  const inflation = world.economy[c.countryCode]?.inflationBp ?? 200;
  const manager = e.managerId ? findRelationship(world, c.id, e.managerId) : undefined;
  const managerBonus = manager ? Math.floor((manager.closeness - 50) / 2) : 0;
  // Professional reputation counts at review time (gameplay expansion).
  const reputationBonus = Math.floor((c.career.reputation - 200) / 20);
  const tenure = world.tick - e.startTick;
  if (e.performance < 300) {
    e.warnings += 1;
    if (isPlayer) addNotification(world, 'work', 'ntf.workWarning', { title: e.title }, 'career');
    if (e.warnings >= 3) {
      endEmployment(world, c, 'dismissed');
      return;
    }
  } else e.warnings = 0;
  const promoted =
    e.performance + managerBonus + reputationBonus >= 700 &&
    tenure >= 24 &&
    e.terms.level < occupation.maxLevel &&
    withRng(world, 'career', (rng) => rng.int(100) < 55);
  if (promoted) {
    promote(world, c, e, isPlayer);
    return;
  }
  const raiseBp = clamp(Math.max(0, inflation) + (e.performance - 500), 0, 1500);
  e.salaryMinor += applyBp(e.salaryMinor, Math.floor(raiseBp));
  if (isPlayer && raiseBp > 0)
    addNotification(world, 'work', 'ntf.annualRaise', { bp: Math.floor(raiseBp) }, 'career');
}

/** Moves a job up one level: new title, pay band and a raise (reviews and asking for it). */
export function promote(world: World, c: Character, e: Employment, isPlayer: boolean): void {
  const occupation = getOccupation(e.terms.occupationId);
  const level = e.terms.level + 1;
  const band = salaryBand(world, occupation, level, e.terms.locationId);
  const fullTime = getRules(c.countryCode).work.fullTimeHours;
  const newMin = scaleForContract(band.min, e.terms.contract, e.terms.hours, fullTime);
  e.terms = {
    ...e.terms,
    level,
    salaryMinMinor: newMin,
    salaryMaxMinor: scaleForContract(band.max, e.terms.contract, e.terms.hours, fullTime),
  };
  e.salaryMinor = maxBig(newMin, applyPercent(e.salaryMinor, 115));
  e.title = jobTitle(occupation, level);
  e.startTick = world.tick;
  if (isPlayer) {
    changeStat(world, c, 'happiness', 80, 'work:promotion');
    changeStat(world, c, 'confidence', 50, 'work:promotion');
    addBiography(world, c.id, 'work', 'bio.promoted', {
      title: e.title,
      employer: e.terms.employer,
    });
    addNotification(world, 'work', 'ntf.promoted', { title: e.title }, 'career');
  }
}

/** Step 4-6 (work part): the player's job in detail, NPC careers in simplified form. */
export function processEmployment(world: World): void {
  for (const id of sortedKeys(world.characters)) {
    const c = world.characters[id];
    if (c?.death !== null || c.tier === 'archived') continue;
    const isPlayer = id === world.activeCharacterId;
    if (isPlayer) playerWorkMonth(world, c);
    else if (c.tier === 'close' || world.clock.month === c.birth.month)
      npcCareer(world, c, c.tier === 'close' ? 1 : 12);
  }
}

function playerWorkMonth(world: World, c: Character): void {
  for (const app of sortedValues(world.jobs.applications)) {
    if (app.characterId !== c.id) continue;
    if (app.status === 'applied' && app.interviewTick !== null && app.interviewTick <= world.tick) {
      app.status = 'rejected';
      addNotification(
        world,
        'work',
        'ntf.jobRejected',
        {
          employer: app.terms.employer,
          title: jobTitle(getOccupation(app.terms.occupationId), app.terms.level),
        },
        'career',
      );
    }
    if (
      app.status === 'offered' &&
      app.offerExpiresTick !== null &&
      app.offerExpiresTick < world.tick
    ) {
      app.status = 'expired';
    }
  }
  pruneApplications(world);
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (e?.status !== 'active') return;
  const occupation = getOccupation(e.terms.occupationId);
  const skill = Math.floor(
    occupation.skills.reduce((s, k) => s + c.skills[k], 0) / occupation.skills.length,
  );
  const manager = e.managerId ? findRelationship(world, c.id, e.managerId) : undefined;
  const target = clamp(
    Math.floor((skill * 6) / 10) +
      Math.floor(c.stats.discipline / 5) +
      Math.floor(c.stats.energy / 10) +
      EFFORT_PERFORMANCE[e.effort] +
      (manager ? manager.closeness - 50 : 0) -
      (c.stats.stress > 700 ? Math.floor((c.stats.stress - 700) / 3) : 0) +
      100,
    0,
    1000,
  );
  e.performance = clamp(
    e.performance +
      Math.trunc((target - e.performance) / 4) +
      withRng(world, 'career', (rng) => rng.range(-20, 20)),
    0,
    1000,
  );
  for (const key of occupation.skills) {
    changeSkill(
      world,
      c,
      key,
      scaledGain(Math.floor((8 * EFFORT_SKILL[e.effort]) / 100), c.skills[key]),
      'work',
    );
  }
  changeStat(world, c, 'stress', EFFORT_STRESS[e.effort], 'work');
  const tenure = world.tick - e.lastReviewTick;
  if (tenure >= 12) {
    review(world, c, e, true);
    if (c.employmentId !== e.id) return;
  }
  if (
    (e.terms.contract === 'fixedTerm' || e.terms.contract === 'internship') &&
    world.tick - e.startTick >= 12
  ) {
    const renew =
      e.terms.contract === 'fixedTerm' &&
      e.performance >= 500 &&
      withRng(world, 'career', (rng) => rng.int(100) < 70);
    if (renew) {
      e.terms = { ...e.terms, contract: 'permanent' };
      addNotification(world, 'work', 'ntf.contractPermanent', { title: e.title }, 'career');
    } else {
      endEmployment(world, c, 'contractEnded');
      return;
    }
  }
  if (withRng(world, 'career', (rng) => rng.chancePpm(layoffPpm(world, c, e)))) {
    endEmployment(world, c, 'laidOff');
    changeStat(world, c, 'stress', 120, 'work:laidOff');
    changeStat(world, c, 'happiness', -100, 'work:laidOff');
    return;
  }
  maybeHeadhunt(world, c, e);
}

/** Months between rival approaches, at least. */
export const HEADHUNT_COOLDOWN = 12;

/**
 * Monthly chance (percent) that a rival company approaches the player (gameplay expansion):
 * 1-8%, higher with professional reputation, a specialism and strong performance. Zero when
 * not eligible (see `maybeHeadhunt`).
 */
export function headhuntChance(world: World, c: Character, e: Employment): number {
  const occupation = getOccupation(e.terms.occupationId);
  if (occupation.hidden || e.terms.contract === 'internship' || e.terms.contract === 'casual')
    return 0;
  if (world.tick - e.startTick < 6 || e.performance < 450) return 0;
  if (ageYears(world, c) >= getRules(c.countryCode).pension.stateAge) return 0;
  const recent = sortedValues(world.jobs.applications).some(
    (a) =>
      a.characterId === c.id &&
      a.headhunted === true &&
      (a.status === 'offered' || world.tick - a.tick < HEADHUNT_COOLDOWN),
  );
  if (recent) return 0;
  return clamp(
    1 +
      Math.floor(c.career.reputation / 150) +
      (c.career.specialty ? 2 : 0) +
      (e.performance >= 700 ? 1 : 0),
    1,
    8,
  );
}

/** A rival company offers the same kind of job for 10-30% more (sometimes one level up). */
function maybeHeadhunt(world: World, c: Character, e: Employment): void {
  const chance = headhuntChance(world, c, e);
  if (chance === 0 || !withRng(world, 'career', (rng) => rng.int(100) < chance)) return;
  const occupation = getOccupation(e.terms.occupationId);
  const step =
    e.terms.level < occupation.maxLevel &&
    e.performance >= 650 &&
    withRng(world, 'career', (rng) => rng.int(100) < 30)
      ? 1
      : 0;
  const contract: ContractType = e.terms.contract === 'fixedTerm' ? 'permanent' : e.terms.contract;
  let terms = makeTerms(world, occupation, e.terms.level + step, contract, c.locationId);
  for (let i = 0; i < 3 && terms.employer === e.terms.employer; i++)
    terms = makeTerms(world, occupation, e.terms.level + step, contract, c.locationId);
  if (terms.employer === e.terms.employer) return;
  const raise = withRng(world, 'career', (rng) => rng.range(10, 30));
  const offer = maxBig(e.salaryMinor + applyPercent(e.salaryMinor, raise), terms.salaryMinMinor);
  // Their band stretches to fit: negotiating can still add up to 10% on top.
  terms = { ...terms, salaryMaxMinor: maxBig(terms.salaryMaxMinor, applyPercent(offer, 110)) };
  const app: JobApplication = {
    id: nextId(world, 'app'),
    postingId: nextId(world, 'job'),
    characterId: c.id,
    terms,
    applicants: 0,
    tick: world.tick,
    status: 'offered',
    interviewTick: null,
    preparation: 0,
    referrerId: null,
    score: null,
    offerSalaryMinor: offer,
    offerExpiresTick: world.tick + 2,
    negotiated: false,
    headhunted: true,
  };
  world.jobs.applications[app.id] = app;
  addNotification(
    world,
    'work',
    'ntf.headhunted',
    { employer: terms.employer, title: jobTitle(occupation, terms.level), percent: raise },
    'career',
  );
}

function pruneApplications(world: World): void {
  const done = sortedValues(world.jobs.applications).filter(
    (a) => a.status !== 'applied' && a.status !== 'interview' && a.status !== 'offered',
  );
  for (const a of done.slice(0, Math.max(0, done.length - 20)))
    Reflect.deleteProperty(world.jobs.applications, a.id);
}

/** Simplified career progress for NPCs, run every `months` months. */
function npcCareer(world: World, c: Character, months: number): void {
  const age = ageYears(world, c);
  const rules = getRules(c.countryCode);
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (e?.status === 'active') {
    if (age >= rules.pension.stateAge && e.terms.occupationId !== 'royal-duties') {
      endEmployment(world, c, 'retired');
      if (c.finance) c.finance.retired = true;
      return;
    }
    if (world.tick - e.lastReviewTick >= 12) {
      e.performance = clamp(
        400 +
          Math.floor(c.stats.discipline / 3) +
          withRng(world, 'career', (rng) => rng.range(-150, 150)),
        0,
        1000,
      );
      review(world, c, e, false);
      if (c.employmentId !== e.id) return;
    }
    if (getOccupation(e.terms.occupationId).hidden) return;
    const layoff = withRng(world, 'career', (rng) =>
      rng.chancePpm(layoffPpm(world, c, e) * months),
    );
    if (layoff) endEmployment(world, c, 'laidOff');
    return;
  }
  if (age < 18 || age >= rules.pension.stateAge || c.finance?.retired) return;
  if (c.education.current && c.education.current.stage !== 'tertiary') return;
  const unemployment = world.economy[c.countryCode]?.unemploymentBp ?? 500;
  const chance = clamp(Math.floor((25 * 500) / unemployment), 5, 60) * months;
  if (withRng(world, 'career', (rng) => rng.int(100) < Math.min(95, chance)))
    assignNpcJob(world, c);
}

/** Gives an adult NPC a job they qualify for (deterministic, career stream). */
export function assignNpcJob(
  world: World,
  c: Character,
  payHint?: { occupationId: string; level: number },
): Employment | null {
  const age = ageYears(world, c);
  if (age < 18) return null;
  let occupation: OccupationDefinition;
  let level: number;
  if (payHint) {
    occupation = getOccupation(payHint.occupationId);
    level = payHint.level;
  } else {
    const options = OCCUPATIONS.filter(
      (o) => !o.hidden && meetsEducation(o, c.education.qualifications),
    );
    if (options.length === 0) return null;
    occupation = withRng(world, 'career', (rng) => rng.pick(options));
    level = Math.min(occupation.maxLevel, clamp(Math.floor((age - 20) / 8), 0, 4));
  }
  const terms = makeTerms(world, occupation, level, 'permanent', c.locationId);
  const salary =
    terms.salaryMinMinor +
    applyPercent(
      terms.salaryMaxMinor - terms.salaryMinMinor,
      withRng(world, 'career', (rng) => rng.range(0, 100)),
    );
  const e = startEmployment(world, c, terms, salary);
  e.startTick = Math.max(0, world.tick - withRng(world, 'career', (rng) => rng.range(0, 60)));
  e.lastReviewTick = world.tick - withRng(world, 'career', (rng) => rng.range(0, 11));
  if (e.lastReviewTick < 0) e.lastReviewTick = 0;
  return e;
}

export function quitJob(world: World, c: Character): void {
  if (!c.employmentId) throw new JobError('noJob');
  endEmployment(world, c, 'quit');
}

export function retire(world: World, c: Character): void {
  if (ageYears(world, c) < 55) throw new JobError('tooYoungToRetire');
  if (!c.finance) throw new JobError('noJob');
  if (c.finance.retired) throw new JobError('retired');
  if (c.employmentId) endEmployment(world, c, 'retired');
  c.finance.retired = true;
  addBiography(world, c.id, 'work', 'bio.retired', {});
  addNotification(world, 'work', 'ntf.retired', {}, 'finance');
}

export function requestRaise(world: World, c: Character): 'granted' | 'refused' {
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  if (e?.status !== 'active') throw new JobError('noJob');
  if (e.raiseRequestedTick !== null && world.tick - e.raiseRequestedTick < 12)
    throw new JobError('tooSoon');
  e.raiseRequestedTick = world.tick;
  const chance = clamp(
    Math.floor((e.performance - 300) / 6) + Math.floor(c.skills.business / 20),
    5,
    85,
  );
  const granted = withRng(world, 'career', (rng) => rng.int(100) < chance);
  if (granted) {
    const percent = withRng(world, 'career', (rng) => rng.range(3, 8));
    e.salaryMinor += applyPercent(e.salaryMinor, percent);
    addNotification(world, 'work', 'ntf.raiseGranted', { percent }, 'career');
    return 'granted';
  }
  if (e.managerId) {
    const rel = findRelationship(world, c.id, e.managerId);
    if (rel) rel.closeness = clamp(rel.closeness - 5, 0, 100);
    addMemory(world, {
      ownerId: e.managerId,
      subjectIds: [c.id],
      key: 'askedForRaise',
      source: e.id,
      valence: -10,
      salience: 30,
      decay: 'fast',
    });
  }
  return 'refused';
}

export function activeEmployment(world: World, c: Character): Employment | null {
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  return e?.status === 'active' ? e : null;
}
