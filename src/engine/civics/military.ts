import { sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { changeNeed, changeStat } from '../characters/stats';
import { endEmployment } from '../career/jobs';
import { leaveEducation } from '../education/school';
import { medianWage } from '../economy/economy';
import { receiveIncome } from '../economy/finance';
import { getInstitutions } from '../world/institutions';
import type { Character, ServiceBranch, ServiceRecord, World } from '../state/schema';
import { hasUnspentConviction, inCustody, isCitizen, meetsQualification, statusIn } from './status';

/**
 * Military service (spec §3.15, §4; Milestone 6). Conscription follows each country's rules:
 * call-up ages, who is liable (male citizens, sometimes permanent residents), lotteries and
 * short national-service programmes, and study deferments. Anyone eligible may volunteer.
 * Service is described non-graphically. Pay and promotion are PROPOSED TUNING.
 */

export const ENLISTED_RANKS = [
  'Private',
  'Lance Corporal',
  'Corporal',
  'Sergeant',
  'Staff Sergeant',
  'Warrant Officer',
] as const;
export const OFFICER_RANKS = [
  'Officer Cadet',
  'Second Lieutenant',
  'Lieutenant',
  'Captain',
  'Major',
  'Lieutenant Colonel',
  'Colonel',
] as const;

/** Months in rank before promotion is possible. */
const ENLISTED_STEPS = [6, 12, 18, 30, 48];
const OFFICER_STEPS = [6, 18, 30, 42, 60, 84];
/** Pay, percent of the median monthly wage by rank. */
const ENLISTED_PAY = [80, 90, 100, 115, 135, 155];
const OFFICER_PAY = [70, 110, 130, 155, 190, 230, 280];
const CONSCRIPT_PAY = 25;
export const VOLUNTEER_TERM_MONTHS = 48;
export const MIN_SERVICE_BEFORE_LEAVING = 24;
export const SERVICE_HOURS = 60;

export type MilitaryRejection =
  | 'tooYoung'
  | 'tooOld'
  | 'notEligible'
  | 'health'
  | 'record'
  | 'alreadyServing'
  | 'inSchool'
  | 'needsDegree'
  | 'inCustody'
  | 'cannotDefer'
  | 'notCalled'
  | 'cannotLeave'
  | 'notServing';

export const MILITARY_MESSAGES: Record<MilitaryRejection, string> = {
  tooYoung: 'You are too young to enlist.',
  tooOld: 'You are over the age limit for enlisting (35).',
  notEligible: 'You do not hold the citizenship or residence this country’s forces require.',
  health: 'Your health is not good enough for service.',
  record: 'Your criminal record makes you ineligible.',
  alreadyServing: 'You are already serving.',
  inSchool: 'Finish school before enlisting.',
  needsDegree: 'Officer training needs a bachelor’s degree.',
  inCustody: 'You cannot do this while in custody.',
  cannotDefer: 'You cannot defer: you need to be studying and under the age limit.',
  notCalled: 'You have no call-up to answer.',
  cannotLeave: 'You can leave only after 24 months of volunteer service.',
  notServing: 'You are not serving.',
};

export class MilitaryError extends Error {
  readonly code: MilitaryRejection;
  constructor(code: MilitaryRejection) {
    super(MILITARY_MESSAGES[code]);
    this.name = 'MilitaryError';
    this.code = code;
  }
}

export function rankTitle(record: ServiceRecord): string {
  const list = record.track === 'officer' ? OFFICER_RANKS : ENLISTED_RANKS;
  return list[Math.min(record.rank, list.length - 1)] ?? 'Private';
}

export function currentService(world: World, c: Character): ServiceRecord | undefined {
  return sortedValues(world.civics.service).find(
    (s) =>
      s.characterId === c.id &&
      (s.status === 'serving' || s.status === 'called' || s.status === 'deferred'),
  );
}

/** Whether the person is liable for conscription in this country (age aside). */
export function liable(c: Character, code: string): boolean {
  const m = getInstitutions(code).military;
  if (m.conscription === 'none') return false;
  const covered = isCitizen(c, code) || (m.permanentLiable && statusIn(c, code) === 'permanent');
  if (!covered) return false;
  // National-service programmes select young people of every gender; conscription follows
  // the law's binary categories, so it applies to men only.
  return m.conscription === 'programme' || c.identity.gender === 'male';
}

export function enlistmentCheck(
  world: World,
  c: Character,
  track: 'enlisted' | 'officer',
): MilitaryRejection[] {
  const code = c.civic.residence.countryCode;
  const m = getInstitutions(code).military;
  const reasons: MilitaryRejection[] = [];
  const age = ageYears(world, c);
  if (inCustody(world, c)) reasons.push('inCustody');
  if (age < m.volunteerAge) reasons.push('tooYoung');
  if (age > 35) reasons.push('tooOld');
  const status = statusIn(c, code);
  const ok =
    m.volunteers === 'anyone' ||
    status === 'citizen' ||
    (m.volunteers === 'permanent' && status === 'permanent');
  if (!ok) reasons.push('notEligible');
  if (c.stats.health < 450) reasons.push('health');
  if (hasUnspentConviction(world, c.id, 'serious')) reasons.push('record');
  if (
    sortedValues(world.civics.service).some((s) => s.characterId === c.id && s.status === 'serving')
  )
    reasons.push('alreadyServing');
  const school = c.education.current;
  if (school && school.stage !== 'tertiary') reasons.push('inSchool');
  if (track === 'officer' && !meetsQualification(c, 'bachelor')) reasons.push('needsDegree');
  return reasons;
}

function startServing(world: World, c: Character, record: ServiceRecord, months: number): void {
  record.status = 'serving';
  record.startTick = world.tick;
  record.endTick = world.tick + months;
  record.monthsInRank = 0;
  if (c.employmentId) endEmployment(world, c, 'quit');
  if (c.education.current?.stage === 'tertiary') leaveEducation(world, c);
  c.education.clubs = [];
  addBiography(world, c.id, 'military', `bio.service.${record.kind}`, { branch: record.branch });
  addNotification(
    world,
    'civic',
    'ntf.serviceStarted',
    { kind: record.kind },
    'military',
    record.id,
  );
}

export function enlist(
  world: World,
  c: Character,
  branch: ServiceBranch,
  track: 'enlisted' | 'officer',
): ServiceRecord {
  const first = enlistmentCheck(world, c, track)[0];
  if (first) throw new MilitaryError(first);
  const record: ServiceRecord = {
    id: nextId(world, 'svc'),
    characterId: c.id,
    countryCode: c.civic.residence.countryCode,
    kind: 'volunteer',
    branch,
    track,
    rank: 0,
    status: 'serving',
    reportTick: world.tick,
    startTick: world.tick,
    endTick: world.tick + VOLUNTEER_TERM_MONTHS,
    monthsInRank: 0,
    monthsServed: 0,
  };
  // An outstanding call-up is answered by enlisting.
  const called = currentService(world, c);
  if (called && called.status !== 'serving') {
    called.status = 'completed';
    called.monthsServed = 0;
  }
  world.civics.service[record.id] = record;
  startServing(world, c, record, VOLUNTEER_TERM_MONTHS);
  return record;
}

export function deferService(world: World, c: Character): void {
  const record = currentService(world, c);
  if (record?.status !== 'called') throw new MilitaryError('notCalled');
  const m = getInstitutions(record.countryCode).military;
  const studying = c.education.current?.stage === 'tertiary';
  if (!m.deferForStudy || !studying || ageYears(world, c) >= m.callUpUntil)
    throw new MilitaryError('cannotDefer');
  record.status = 'deferred';
  addNotification(world, 'civic', 'ntf.serviceDeferred', {}, 'military', record.id);
}

export function reenlist(world: World, c: Character): void {
  const record = currentService(world, c);
  if (record?.status !== 'serving' || record.kind !== 'volunteer')
    throw new MilitaryError('notServing');
  record.endTick = (record.endTick ?? world.tick) + VOLUNTEER_TERM_MONTHS;
  addNotification(world, 'civic', 'ntf.reenlisted', {}, 'military', record.id);
}

export function leaveService(world: World, c: Character): void {
  const record = currentService(world, c);
  if (record?.status !== 'serving') throw new MilitaryError('notServing');
  if (record.kind !== 'volunteer' || record.monthsServed < MIN_SERVICE_BEFORE_LEAVING)
    throw new MilitaryError('cannotLeave');
  record.status = 'discharged';
  record.endTick = world.tick;
  c.civic.veteran = true;
  addBiography(world, c.id, 'military', 'bio.discharged', { rank: rankTitle(record) });
}

export function monthlyPay(world: World, record: ServiceRecord): bigint {
  const median = medianWage(world, record.countryCode);
  if (record.kind !== 'volunteer') return applyPercent(median, CONSCRIPT_PAY);
  const table = record.track === 'officer' ? OFFICER_PAY : ENLISTED_PAY;
  return applyPercent(median, table[Math.min(record.rank, table.length - 1)] ?? 100);
}

function callUps(world: World, c: Character): void {
  const code = c.civic.residence.countryCode;
  const m = getInstitutions(code).military;
  const age = ageYears(world, c);
  if (!liable(c, code) || age < m.callUpAge || age > m.callUpUntil) return;
  const existing = sortedValues(world.civics.service).find(
    (s) => s.characterId === c.id && s.countryCode === code && s.kind !== 'volunteer',
  );
  if (existing) return;
  const selected =
    c.stats.health >= 300 && withRng(world, 'civics', (rng) => rng.int(100) < m.selectionPercent);
  const record: ServiceRecord = {
    id: nextId(world, 'svc'),
    characterId: c.id,
    countryCode: code,
    kind: m.conscription === 'programme' ? 'programme' : 'conscript',
    branch: 'army',
    track: 'enlisted',
    rank: 0,
    status: selected ? 'called' : 'exempt',
    reportTick: world.tick + 3,
    startTick: null,
    endTick: null,
    monthsInRank: 0,
    monthsServed: 0,
  };
  world.civics.service[record.id] = record;
  addNotification(
    world,
    'civic',
    selected ? `ntf.calledUp.${record.kind}` : 'ntf.notSelected',
    { months: m.serviceMonths },
    'military',
    record.id,
  );
}

/** Monthly: call-ups, reporting, pay, promotion and the end of service (player only). */
export function processService(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  callUps(world, c);
  for (const record of sortedValues(world.civics.service)) {
    if (record.characterId !== c.id) continue;
    const m = getInstitutions(record.countryCode).military;
    const age = ageYears(world, c);
    if (record.status === 'deferred') {
      const studying = c.education.current?.stage === 'tertiary';
      if (age > m.callUpUntil) record.status = 'exempt';
      else if (!studying || age >= m.callUpUntil) {
        record.status = 'called';
        record.reportTick = world.tick + 3;
        addNotification(world, 'civic', 'ntf.deferralEnded', {}, 'military', record.id);
      }
    } else if (record.status === 'called' && world.tick >= record.reportTick) {
      if (c.civic.residence.countryCode !== record.countryCode || inCustody(world, c)) {
        // Living abroad: the call-up waits until they return (or they age out).
        if (age > m.callUpUntil) record.status = 'exempt';
        continue;
      }
      startServing(world, c, record, m.serviceMonths);
    } else if (record.status === 'serving') {
      record.monthsServed += 1;
      record.monthsInRank += 1;
      if (c.finance?.checkingId)
        receiveIncome(
          world,
          c.id,
          c.finance.checkingId,
          'militaryPay',
          monthlyPay(world, record),
          'tx.militaryPay',
        );
      changeStat(world, c, 'discipline', 6, 'military:service');
      changeStat(world, c, 'health', 4, 'military:service');
      changeStat(world, c, 'stress', 6, 'military:service');
      changeNeed(c, 'leisure', -60);
      const steps = record.track === 'officer' ? OFFICER_STEPS : ENLISTED_STEPS;
      const cap = record.kind === 'volunteer' ? steps.length : Math.min(2, steps.length);
      const need = steps[record.rank];
      if (record.rank < cap && need !== undefined && record.monthsInRank >= need) {
        const chance =
          30 + Math.floor(c.stats.discipline / 20) + Math.floor(c.stats.socialSkill / 40);
        if (withRng(world, 'civics', (rng) => rng.int(100) < chance)) {
          record.rank += 1;
          record.monthsInRank = 0;
          addNotification(
            world,
            'civic',
            'ntf.promotedRank',
            { rank: rankTitle(record) },
            'military',
            record.id,
          );
        }
      }
      if (record.endTick !== null && world.tick >= record.endTick) {
        record.status = 'completed';
        c.civic.veteran = record.kind !== 'programme' || c.civic.veteran;
        addBiography(world, c.id, 'military', 'bio.serviceCompleted', {
          rank: rankTitle(record),
          kind: record.kind,
        });
        addNotification(
          world,
          'civic',
          'ntf.serviceCompleted',
          { kind: record.kind },
          'military',
          record.id,
        );
      }
    }
  }
}

export function isServing(world: World, characterId: string): boolean {
  return sortedValues(world.civics.service).some(
    (s) => s.characterId === characterId && s.status === 'serving',
  );
}
