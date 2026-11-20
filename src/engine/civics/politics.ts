import { clamp, sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { seedFromString } from '../core/rng';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { changeStat } from '../characters/stats';
import { endEmployment } from '../career/jobs';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor, receiveIncome } from '../economy/finance';
import { balanceOf } from '../economy/ledger';
import { getInstitutions, type OfficeLevel, type OfficeRule } from '../world/institutions';
import type { Character, PoliticalCareer, World } from '../state/schema';
import { hasUnspentConviction, inCustody, isCitizen, meetsQualification } from './status';
import { isServing } from './military';

/**
 * Political careers (spec §3.14, §4 Politics). Offices, ages, term lengths and limits follow
 * each country's rules; elections are simulated (not predictions), parties are fictional
 * and positions are neutral labels. Where offices are filled by appointment or through the
 * party, the player seeks an appointment instead of campaigning. PROPOSED TUNING.
 */

export const OFFICE_SALARY_PERCENT: Record<OfficeLevel, number> = {
  local: 30,
  legislature: 220,
  leader: 400,
};
export const OFFICE_HOURS: Record<OfficeLevel, number> = { local: 15, legislature: 60, leader: 90 };
const CAMPAIGN_MONTHS: Record<OfficeLevel, number> = { local: 4, legislature: 6, leader: 9 };
const DEPOSIT_PERCENT: Record<OfficeLevel, number> = { local: 10, legislature: 60, leader: 300 };
const APPOINTMENT_MONTHS = 6;
export const CAMPAIGN_HOURS = 10;
const ADVERT_PERCENT = 40;
export const CAMPAIGN_ACTIONS = ['canvass', 'advertise', 'debate', 'fundraise'] as const;
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number];

export type PoliticsRejection =
  | 'tooYoung'
  | 'notCitizen'
  | 'notBornCitizen'
  | 'dualCitizen'
  | 'notResident'
  | 'record'
  | 'inCustody'
  | 'serving'
  | 'noOffice'
  | 'noParty'
  | 'unknownParty'
  | 'alreadyMember'
  | 'notMember'
  | 'busy'
  | 'termLimit'
  | 'needsExperience'
  | 'needsDegree'
  | 'needsReputation'
  | 'notCampaigning'
  | 'noTime'
  | 'cannotAfford'
  | 'notInOffice'
  | 'noElections'
  | 'byAppointment';

export const POLITICS_MESSAGES: Record<PoliticsRejection, string> = {
  tooYoung: 'You are below the minimum age for this office.',
  notCitizen: 'Only citizens can stand for this office.',
  notBornCitizen: 'This office is only open to citizens from birth.',
  dualCitizen: 'Candidates here may hold no other citizenship.',
  notResident: 'You need to live in the country.',
  record: 'Your criminal record disqualifies you.',
  inCustody: 'You cannot do this while in custody.',
  serving: 'Serving members of the armed forces cannot stand.',
  noOffice: 'This office does not exist here.',
  noParty: 'You need to be a party member for this.',
  unknownParty: 'There is no such party here.',
  alreadyMember: 'You are already a member of a party.',
  notMember: 'You are not a party member.',
  busy: 'You are already campaigning or in office.',
  termLimit: 'You have reached the term limit for this office.',
  needsExperience: 'You need experience in a lower office first.',
  needsDegree: 'You need a degree for this appointment.',
  needsReputation: 'Your public reputation is not high enough yet.',
  notCampaigning: 'You are not campaigning.',
  noTime: 'You have no free time left this month.',
  cannotAfford: 'You cannot afford this.',
  notInOffice: 'You do not hold office.',
  noElections: 'This country has no party politics for you to join.',
  byAppointment: 'This office is filled by appointment, not election.',
};

export class PoliticsError extends Error {
  readonly code: PoliticsRejection;
  constructor(code: PoliticsRejection) {
    super(POLITICS_MESSAGES[code]);
    this.name = 'PoliticsError';
    this.code = code;
  }
}

export function careerOf(world: World, c: Character): PoliticalCareer | undefined {
  return sortedValues(world.civics.politics).find(
    (p) => p.characterId === c.id && p.countryCode === c.countryCode,
  );
}

function ensureCareer(world: World, c: Character): PoliticalCareer {
  const existing = careerOf(world, c);
  if (existing) return existing;
  const career: PoliticalCareer = {
    id: nextId(world, 'pol'),
    characterId: c.id,
    countryCode: c.countryCode,
    partyId: null,
    joinedTick: null,
    status: 'none',
    office: null,
    campaign: null,
    termStartTick: null,
    termEndTick: null,
    termsInOffice: 0,
    approval: 500,
    history: [],
    policies: [],
  };
  world.civics.politics[career.id] = career;
  return career;
}

export function joinParty(world: World, c: Character, partyId: string): void {
  const politics = getInstitutions(c.countryCode).politics;
  if (politics.parties.length === 0) throw new PoliticsError('noElections');
  if (!politics.parties.some((p) => p.id === partyId)) throw new PoliticsError('unknownParty');
  if (ageYears(world, c) < 16) throw new PoliticsError('tooYoung');
  if (!isCitizen(c, c.countryCode)) throw new PoliticsError('notCitizen');
  const career = ensureCareer(world, c);
  if (career.partyId !== null) throw new PoliticsError('alreadyMember');
  career.partyId = partyId;
  career.joinedTick = world.tick;
  addBiography(world, c.id, 'politics', 'bio.joinedParty', {
    party: partyId,
    country: c.countryCode,
  });
}

export function leaveParty(world: World, c: Character): void {
  const career = careerOf(world, c);
  if (!career?.partyId) throw new PoliticsError('notMember');
  if (career.status === 'candidate') throw new PoliticsError('busy');
  career.partyId = null;
  career.joinedTick = null;
}

function hasHeld(career: PoliticalCareer | undefined, level: OfficeLevel): boolean {
  return Boolean(
    career?.history.some(
      (h) => h.level === level && (h.result === 'won' || h.result === 'appointed'),
    ),
  );
}

/** Every reason the person may not seek this office now. */
export function officeCheck(world: World, c: Character, level: OfficeLevel): PoliticsRejection[] {
  const inst = getInstitutions(c.countryCode).politics;
  const office: OfficeRule | null = inst.offices[level] ?? null;
  const reasons: PoliticsRejection[] = [];
  if (!office) return ['noOffice'];
  const career = careerOf(world, c);
  const code = c.countryCode;
  if (inCustody(world, c)) reasons.push('inCustody');
  if (isServing(world, c.id)) reasons.push('serving');
  if (ageYears(world, c) < office.minAge) reasons.push('tooYoung');
  if (!isCitizen(c, code)) reasons.push('notCitizen');
  else if (level === 'leader' && inst.leaderBirthCitizen && !c.flags[`birthCitizen.${code}`])
    reasons.push('notBornCitizen');
  if (inst.singleCitizenship && level !== 'local' && c.civic.citizenships.length > 1)
    reasons.push('dualCitizen');
  if (c.civic.residence.countryCode !== code) reasons.push('notResident');
  if (hasUnspentConviction(world, c.id, 'serious')) reasons.push('record');
  if (career && (career.status === 'candidate' || career.status === 'seeking'))
    reasons.push('busy');
  if (
    career?.status === 'office' &&
    career.office === level &&
    career.termEndTick !== null &&
    career.termEndTick - world.tick > 6
  )
    reasons.push('busy');
  if (
    career?.status === 'office' &&
    career.office === level &&
    office.termLimit !== null &&
    career.termsInOffice >= office.termLimit
  )
    reasons.push('termLimit');
  if (office.selection === 'party') {
    if (!career?.partyId) reasons.push('noParty');
    const below: OfficeLevel | null =
      level === 'leader'
        ? 'legislature'
        : level === 'legislature' && inst.offices.local?.selection === 'party'
          ? 'local'
          : null;
    const serving = career?.status === 'office' && career.office === below;
    if (below && !serving && !hasHeld(career, below)) reasons.push('needsExperience');
  }
  if (office.selection === 'appointment') {
    if (!meetsQualification(c, 'bachelor')) reasons.push('needsDegree');
    const family = world.households[c.householdId]?.flags;
    const boost = family?.royal || family?.political ? 150 : 0;
    if (c.stats.reputation + boost < 650) reasons.push('needsReputation');
  }
  if (office.selection === 'election' && level === 'leader') {
    if (!career?.partyId && !hasHeld(career, 'legislature')) reasons.push('noParty');
    if (!hasHeld(career, 'legislature') && !hasHeld(career, 'local'))
      reasons.push('needsExperience');
  }
  return [...new Set(reasons)];
}

function deposit(world: World, c: Character, level: OfficeLevel): bigint {
  return applyPercent(medianWage(world, c.countryCode), DEPOSIT_PERCENT[level]);
}

/** Party popularity this year (deterministic, no RNG stream): 30-49%. */
function partyStanding(world: World, career: PoliticalCareer): number {
  if (career.partyId === null) return 20;
  return (
    30 +
    ((seedFromString(`${career.countryCode}:${career.partyId}:${String(world.clock.year)}`)[0] >>>
      0) %
      20)
  );
}

/** Stands for election, or (where offices are appointed or party-filled) seeks the post. */
export function seekOffice(world: World, c: Character, level: OfficeLevel): PoliticalCareer {
  const first = officeCheck(world, c, level)[0];
  if (first) throw new PoliticsError(first);
  const office = getInstitutions(c.countryCode).politics.offices[level];
  if (!office) throw new PoliticsError('noOffice');
  const career = ensureCareer(world, c);
  const fee = office.selection === 'election' ? deposit(world, c, level) : 0n;
  const payer = payerFor(world, c);
  if (fee > 0n) {
    const cash = payer
      ? balanceOf(world, payer.checkingId) + balanceOf(world, payer.savingsId)
      : 0n;
    if (!payer || cash < fee) throw new PoliticsError('cannotAfford');
    payExpense(world, payer, 'campaign', fee, 'tx.campaignDeposit', { level });
  }
  const family = world.households[c.householdId]?.flags.political ? 80 : 0;
  career.campaign = {
    level,
    electionTick:
      world.tick + (office.selection === 'election' ? CAMPAIGN_MONTHS[level] : APPOINTMENT_MONTHS),
    // Volunteering pays off: community standing adds up to 100 points of early support.
    support: clamp(
      150 +
        Math.floor(c.stats.reputation / 4) +
        family +
        Math.floor((c.career.community ?? 0) / 10),
      0,
      1000,
    ),
    spentMinor: fee,
    actions: 0,
  };
  if (career.status !== 'office')
    career.status = office.selection === 'election' ? 'candidate' : 'seeking';
  addNotification(
    world,
    'civic',
    office.selection === 'election' ? 'ntf.campaignStarted' : 'ntf.seekingAppointment',
    { level },
    'politics',
  );
  return career;
}

/** A campaign activity: diminishing returns within a campaign (spec §4 Actions). */
export function campaign(
  world: World,
  c: Character,
  action: CampaignAction,
  spend: (hours: number) => boolean,
): number {
  const career = careerOf(world, c);
  const run = career?.campaign;
  if (!career || !run) throw new PoliticsError('notCampaigning');
  if (getInstitutions(c.countryCode).politics.offices[run.level]?.selection !== 'election')
    throw new PoliticsError('byAppointment');
  let gain = 0;
  if (action === 'canvass') {
    if (!spend(CAMPAIGN_HOURS)) throw new PoliticsError('noTime');
    gain = 30 + Math.floor(c.stats.socialSkill / 25);
  } else if (action === 'advertise') {
    const cost = applyPercent(medianWage(world, c.countryCode), ADVERT_PERCENT);
    const payer = payerFor(world, c);
    const cash = payer
      ? balanceOf(world, payer.checkingId) + balanceOf(world, payer.savingsId)
      : 0n;
    if (!payer || cash < cost) throw new PoliticsError('cannotAfford');
    payExpense(world, payer, 'campaign', cost, 'tx.campaignAdvert', { level: run.level });
    run.spentMinor += cost;
    gain = 40;
  } else if (action === 'debate') {
    if (!spend(6)) throw new PoliticsError('noTime');
    const roll = withRng(world, 'civics', (rng) => rng.int(400));
    gain = Math.floor((c.stats.confidence + c.stats.socialSkill) / 20) + roll / 10 - 40;
  } else {
    if (!spend(8)) throw new PoliticsError('noTime');
    const raised = applyPercent(medianWage(world, c.countryCode), 20);
    if (c.finance?.checkingId)
      receiveIncome(world, c.id, c.finance.checkingId, 'donations', raised, 'tx.donations');
    gain = 10;
  }
  const effective = Math.trunc(gain / (1 + 0.35 * run.actions));
  run.actions += 1;
  run.support = clamp(run.support + effective, 0, 1000);
  return effective;
}

function takeOffice(
  world: World,
  c: Character,
  career: PoliticalCareer,
  level: OfficeLevel,
  result: 'won' | 'appointed',
  share: number,
): void {
  const office = getInstitutions(career.countryCode).politics.offices[level];
  if (!office) return;
  const same = career.status === 'office' && career.office === level;
  career.termsInOffice = same ? career.termsInOffice + 1 : 1;
  career.status = 'office';
  career.office = level;
  career.termStartTick = world.tick;
  career.termEndTick = world.tick + office.termYears * 12;
  career.approval = same ? career.approval : clamp(450 + Math.floor(share * 3), 0, 1000);
  career.history = [
    ...career.history,
    { tick: world.tick, level, result, sharePercent: share },
  ].slice(-40);
  if (level !== 'local' && c.employmentId) endEmployment(world, c, 'quit');
  changeStat(world, c, 'reputation', 60, 'politics:office');
  addBiography(world, c.id, 'politics', 'bio.office', { title: office.title, result });
  addNotification(world, 'civic', `ntf.office.${result}`, { title: office.title }, 'politics');
}

function leaveOffice(
  world: World,
  c: Character,
  career: PoliticalCareer,
  reason: 'leftOffice',
): void {
  if (career.office)
    career.history = [
      ...career.history,
      { tick: world.tick, level: career.office, result: reason, sharePercent: 0 },
    ].slice(-40);
  const title = career.office
    ? (getInstitutions(career.countryCode).politics.offices[career.office]?.title ?? '')
    : '';
  career.status = 'none';
  career.office = null;
  career.termStartTick = null;
  career.termEndTick = null;
  career.termsInOffice = 0;
  addBiography(world, c.id, 'politics', 'bio.leftOffice', { title });
}

export function resign(world: World, c: Character): void {
  const career = careerOf(world, c);
  if (career?.status !== 'office') throw new PoliticsError('notInOffice');
  leaveOffice(world, c, career, 'leftOffice');
}

export function withdrawCampaign(world: World, c: Character): void {
  const career = careerOf(world, c);
  if (!career?.campaign) throw new PoliticsError('notCampaigning');
  career.campaign = null;
  if (career.status !== 'office') career.status = 'none';
}

/** Records a policy decision taken in office (from events) and its effects. */
export function recordPolicy(
  world: World,
  c: Character,
  policyId: string,
  choice: string,
  approval: number,
  economy: { cycle: number; inflationBp: number },
): void {
  const career = careerOf(world, c);
  if (career?.status !== 'office') return;
  career.approval = clamp(career.approval + approval, 0, 1000);
  career.policies = [...career.policies, { tick: world.tick, policyId, choice }].slice(-60);
  if (career.office === 'leader') {
    const e = world.economy[c.countryCode];
    if (e) {
      e.cycle = clamp(e.cycle + economy.cycle, -1000, 1000);
      e.inflationBp = clamp(e.inflationBp + economy.inflationBp, -500, 3000);
    }
  }
}

/** Monthly: elections and appointments, salary, approval and the end of terms. */
export function processPolitics(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  for (const career of sortedValues(world.civics.politics)) {
    if (career.characterId !== c.id) continue;
    const inst = getInstitutions(career.countryCode).politics;
    const run = career.campaign;
    if (run && world.tick >= run.electionTick) {
      const office = inst.offices[run.level];
      career.campaign = null;
      if (
        !office ||
        officeCheck(world, c, run.level).some((r) => r !== 'busy' && r !== 'termLimit')
      ) {
        if (career.status !== 'office') career.status = 'none';
        continue;
      }
      if (office.selection === 'election') {
        const noise = withRng(world, 'civics', (rng) => rng.range(-8, 8));
        const share = clamp(
          Math.floor(partyStanding(world, career) / 2) + Math.floor(run.support / 25) + noise,
          3,
          80,
        );
        const rival = withRng(world, 'civics', (rng) => rng.range(30, 48));
        if (share > rival) takeOffice(world, c, career, run.level, 'won', share);
        else {
          career.history = [
            ...career.history,
            { tick: world.tick, level: run.level, result: 'lost' as const, sharePercent: share },
          ].slice(-40);
          if (career.status !== 'office') career.status = 'none';
          else if (career.office === run.level) leaveOffice(world, c, career, 'leftOffice');
          addNotification(
            world,
            'civic',
            'ntf.electionLost',
            { title: office.title, share },
            'politics',
          );
        }
      } else {
        const chance = clamp(
          Math.floor((c.stats.reputation - 500) / 6) + Math.floor(run.support / 20) + 10,
          5,
          80,
        );
        if (withRng(world, 'civics', (rng) => rng.int(100) < chance))
          takeOffice(world, c, career, run.level, 'appointed', 0);
        else {
          career.history = [
            ...career.history,
            {
              tick: world.tick,
              level: run.level,
              result: 'notAppointed' as const,
              sharePercent: 0,
            },
          ].slice(-40);
          if (career.status !== 'office') career.status = 'none';
          addNotification(world, 'civic', 'ntf.notAppointed', { title: office.title }, 'politics');
        }
      }
    }
    if (career.status === 'office' && career.office) {
      const level = career.office;
      if (c.finance?.checkingId)
        receiveIncome(
          world,
          c.id,
          c.finance.checkingId,
          'officeSalary',
          applyPercent(medianWage(world, career.countryCode), OFFICE_SALARY_PERCENT[level]),
          'tx.officeSalary',
          { level },
        );
      const cycle = world.economy[career.countryCode]?.cycle ?? 0;
      const target =
        500 +
        Math.floor((c.stats.reputation - 500) / 4) +
        (level === 'leader' ? Math.floor(cycle / 5) : 0);
      career.approval = clamp(
        career.approval + Math.trunc((target - career.approval) / 12),
        0,
        1000,
      );
      changeStat(world, c, 'stress', level === 'local' ? 2 : 8, 'politics:office');
      if (career.termEndTick !== null && world.tick >= career.termEndTick && !career.campaign) {
        leaveOffice(world, c, career, 'leftOffice');
        addNotification(world, 'civic', 'ntf.termEnded', {}, 'politics');
      }
    }
  }
}

/** Free hours used by office and campaigning this month. */
export function politicsHours(
  world: World,
  characterId: string,
): { office: number; campaign: number } {
  const career = sortedValues(world.civics.politics).find(
    (p) => p.characterId === characterId && (p.status === 'office' || p.campaign),
  );
  return {
    office: career?.status === 'office' && career.office ? OFFICE_HOURS[career.office] : 0,
    campaign:
      career?.campaign &&
      getInstitutions(career.countryCode).politics.offices[career.campaign.level]?.selection ===
        'election'
        ? 10
        : 0,
  };
}
