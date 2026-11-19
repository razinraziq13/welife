import { clamp, sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, nextId, withRng } from '../core/world';
import { changeStat } from '../characters/stats';
import { endEmployment } from '../career/jobs';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor, receiveIncome } from '../economy/finance';
import { getInstitutions } from '../world/institutions';
import type { CaseKind, CaseOutcome, Character, LegalCase, World } from '../state/schema';
import { inCustody } from './status';

/**
 * Law (spec §3.15, §4 Law; decision D9). Cases are abstract: a traffic fine, a civil claim,
 * a tax audit, a minor offence, a fraud investigation, an immigration or service matter.
 * The player chooses a lawyer and a plea; the outcome depends on the strength of the case,
 * their defence, the legal system and chance. Nothing here describes how to commit a crime.
 * Convictions are spent after the country's rehabilitation period. PROPOSED TUNING.
 */

interface CaseRule {
  criminal: boolean;
  /** Months until the hearing. */
  hearingMonths: number;
  /** Base amount (fine or sum in dispute), percent of the median monthly wage. */
  amountPercent: [number, number];
  /** Possible sentences on conviction, mildest first. */
  sentences: CaseOutcome[];
  custodyMonths: [number, number];
}

export const CASE_RULES: Record<CaseKind, CaseRule> = {
  traffic: {
    criminal: false,
    hearingMonths: 1,
    amountPercent: [5, 20],
    sentences: ['fine'],
    custodyMonths: [0, 0],
  },
  civilClaim: {
    criminal: false,
    hearingMonths: 4,
    amountPercent: [50, 300],
    sentences: ['lost'],
    custodyMonths: [0, 0],
  },
  taxAudit: {
    criminal: false,
    hearingMonths: 3,
    amountPercent: [30, 200],
    sentences: ['lost'],
    custodyMonths: [0, 0],
  },
  minorOffence: {
    criminal: true,
    hearingMonths: 2,
    amountPercent: [10, 40],
    sentences: ['fine', 'community', 'probation'],
    custodyMonths: [0, 0],
  },
  fraud: {
    criminal: true,
    hearingMonths: 6,
    amountPercent: [200, 1000],
    sentences: ['fine', 'probation', 'custody'],
    custodyMonths: [6, 36],
  },
  immigration: {
    criminal: true,
    hearingMonths: 2,
    amountPercent: [20, 60],
    sentences: ['fine'],
    custodyMonths: [0, 0],
  },
  serviceEvasion: {
    criminal: true,
    hearingMonths: 3,
    amountPercent: [10, 30],
    sentences: ['community', 'custody'],
    custodyMonths: [12, 18],
  },
};

/** Defence bonus by lawyer (tenths) and the private lawyer's fee (percent of median). */
const LAWYER_BONUS = { none: 0, legalAid: 100, private: 250 } as const;
const PRIVATE_FEE_PERCENT = 120;
/** Community service: hours a month and months. */
export const COMMUNITY_HOURS = 12;
export const COMMUNITY_MONTHS = 6;
export const PROBATION_MONTHS = 12;

export type LawRejection =
  'unknownCase' | 'closed' | 'noChange' | 'cannotAfford' | 'notDefendant' | 'legalAidIncome';

export const LAW_MESSAGES: Record<LawRejection, string> = {
  unknownCase: 'There is no such case.',
  closed: 'This case is closed.',
  noChange: 'That is already your choice.',
  cannotAfford: 'You cannot afford this lawyer.',
  notDefendant: 'Only someone facing a charge or claim can plead.',
  legalAidIncome: 'Your income is too high for legal aid.',
};

export class LawError extends Error {
  readonly code: LawRejection;
  constructor(code: LawRejection) {
    super(LAW_MESSAGES[code]);
    this.name = 'LawError';
    this.code = code;
  }
}

/** Opens a case (from an event or the engine). */
export function openCase(
  world: World,
  c: Character,
  kind: CaseKind,
  strength: number,
  role: LegalCase['role'] = 'defendant',
): LegalCase {
  const rule = CASE_RULES[kind];
  const percent = withRng(world, 'civics', (rng) =>
    rng.range(rule.amountPercent[0], rule.amountPercent[1]),
  );
  const k: LegalCase = {
    id: nextId(world, 'case'),
    characterId: c.id,
    countryCode: c.countryCode,
    kind,
    role,
    strength: clamp(strength, 0, 1000),
    amountMinor: applyPercent(medianWage(world, c.countryCode), percent),
    filedTick: world.tick,
    hearingTick: world.tick + rule.hearingMonths,
    lawyer: 'none',
    plea: 'undecided',
    status: 'open',
    outcome: null,
    sentenceMonths: 0,
    closedTick: null,
    convicted: false,
    spentTick: null,
  };
  world.civics.cases[k.id] = k;
  addNotification(world, 'civic', `ntf.case.${role}`, { kind }, 'legal', k.id);
  return k;
}

function openCaseFor(world: World, c: Character, caseId: string): LegalCase {
  const k = world.civics.cases[caseId];
  if (k?.characterId !== c.id) throw new LawError('unknownCase');
  if (k.status !== 'open') throw new LawError('closed');
  return k;
}

export function privateLawyerFee(world: World, c: Character): bigint {
  return applyPercent(medianWage(world, c.countryCode), PRIVATE_FEE_PERCENT);
}

/** Legal aid is for people earning under about the median wage. */
export function legalAidEligible(world: World, c: Character): boolean {
  const job = c.employmentId ? world.employment[c.employmentId] : undefined;
  const salary = job?.status === 'active' ? job.salaryMinor : 0n;
  return salary <= medianWage(world, c.countryCode);
}

export function hireLawyer(
  world: World,
  c: Character,
  caseId: string,
  lawyer: LegalCase['lawyer'],
): void {
  const k = openCaseFor(world, c, caseId);
  if (k.lawyer === lawyer) throw new LawError('noChange');
  if (lawyer === 'legalAid' && !legalAidEligible(world, c)) throw new LawError('legalAidIncome');
  if (lawyer === 'private') {
    const payer = payerFor(world, c);
    const fee = privateLawyerFee(world, c);
    const cash =
      (payer ? (world.ledger.accounts[payer.checkingId]?.balance ?? 0n) : 0n) +
      (payer?.savingsId ? (world.ledger.accounts[payer.savingsId]?.balance ?? 0n) : 0n);
    if (!payer || cash < fee) throw new LawError('cannotAfford');
    payExpense(world, payer, 'legalFees', fee, 'tx.legalFees', { kind: k.kind }, k.id);
  }
  k.lawyer = lawyer;
}

export function setPlea(world: World, c: Character, caseId: string, plea: LegalCase['plea']): void {
  const k = openCaseFor(world, c, caseId);
  if (k.role !== 'defendant') throw new LawError('notDefendant');
  if (k.plea === plea) throw new LawError('noChange');
  k.plea = plea;
}

function fine(world: World, c: Character, k: LegalCase, amount: bigint, category: string): void {
  const payer = payerFor(world, c);
  if (payer && amount > 0n)
    payExpense(world, payer, category, amount, 'tx.legal', { kind: k.kind }, k.id);
}

function sentence(world: World, c: Character, k: LegalCase, step: number): void {
  const rule = CASE_RULES[k.kind];
  const index = clamp(step, 0, rule.sentences.length - 1);
  const outcome = rule.sentences[index] ?? 'fine';
  k.outcome = outcome;
  k.convicted = rule.criminal;
  if (outcome === 'fine' || outcome === 'lost') {
    fine(world, c, k, k.amountMinor, outcome === 'fine' ? 'fines' : 'legal');
  } else if (outcome === 'custody') {
    k.sentenceMonths = withRng(world, 'civics', (rng) =>
      rng.range(rule.custodyMonths[0], rule.custodyMonths[1]),
    );
    c.civic.custodyUntilTick = world.tick + k.sentenceMonths;
    if (c.employmentId) endEmployment(world, c, 'dismissed');
    changeStat(world, c, 'reputation', -150, `legal:${k.kind}`);
    addBiography(world, c.id, 'legal', 'bio.custody', { kind: k.kind, months: k.sentenceMonths });
  } else if (outcome === 'community') {
    k.sentenceMonths = COMMUNITY_MONTHS;
  } else if (outcome === 'probation') {
    k.sentenceMonths = PROBATION_MONTHS;
  }
  if (k.convicted) {
    const years = getInstitutions(k.countryCode).law.recordSpentYears;
    k.spentTick = world.tick + k.sentenceMonths + years * 12;
    changeStat(world, c, 'reputation', -60, `legal:${k.kind}`);
  }
}

/** Resolves a hearing: defence (lawyer, ability, reputation) against the case's strength. */
export function resolveCase(world: World, c: Character, k: LegalCase): void {
  const juries = getInstitutions(k.countryCode).law.juries;
  const spread = juries ? 500 : 400;
  const defence =
    LAWYER_BONUS[k.lawyer] +
    Math.floor((c.stats.intelligence - 500) / 5) +
    Math.floor(c.stats.reputation / 10) +
    withRng(world, 'civics', (rng) => rng.int(spread));
  const prosecution = k.strength + withRng(world, 'civics', (rng) => rng.int(spread));
  const rule = CASE_RULES[k.kind];

  if (k.role === 'claimant') {
    if (defence > prosecution - 150) {
      k.outcome = 'won';
      receiveIncome(
        world,
        c.id,
        c.finance?.checkingId ?? '',
        'legalAward',
        k.amountMinor,
        'tx.legalAward',
        { kind: k.kind },
      );
    } else {
      k.outcome = 'lost';
    }
  } else if (k.plea === 'settle' && !rule.criminal) {
    k.outcome = 'settled';
    fine(world, c, k, applyPercent(k.amountMinor, 70), 'legal');
  } else if (k.plea === 'guilty') {
    // A guilty plea avoids a trial and reduces the sentence.
    sentence(world, c, k, rule.criminal ? (prosecution > 900 ? 1 : 0) : 0);
    if (!rule.criminal) k.outcome = k.kind === 'traffic' ? 'fine' : 'lost';
  } else if (defence >= prosecution) {
    k.outcome = rule.criminal ? 'acquitted' : k.kind === 'traffic' ? 'dismissed' : 'won';
  } else {
    // Contesting and losing costs more.
    const step = prosecution - defence > 300 ? 2 : prosecution - defence > 120 ? 1 : 0;
    k.amountMinor = applyPercent(k.amountMinor, 150);
    sentence(world, c, k, step);
  }
  k.status = 'closed';
  k.closedTick = world.tick;
  const outcome = k.outcome ?? 'dismissed';
  addNotification(world, 'civic', 'ntf.caseClosed', { kind: k.kind, outcome }, 'legal', k.id);
  if (k.convicted || outcome === 'won')
    addBiography(world, c.id, 'legal', 'bio.case', { kind: k.kind, outcome });
}

/** Monthly: hearings, custody, community service and spent records for the player. */
export function processLaw(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  for (const k of sortedValues(world.civics.cases)) {
    if (k.characterId !== c.id) continue;
    if (k.status === 'open' && world.tick >= k.hearingTick) {
      if (inCustody(world, c) && k.lawyer === 'none' && legalAidEligible(world, c))
        k.lawyer = 'legalAid';
      resolveCase(world, c, k);
    }
  }
  if (c.civic.custodyUntilTick !== null) {
    if (world.tick >= c.civic.custodyUntilTick) {
      c.civic.custodyUntilTick = null;
      addNotification(world, 'civic', 'ntf.released', {}, 'legal');
      addBiography(world, c.id, 'legal', 'bio.released', {});
    } else {
      changeStat(world, c, 'happiness', -20, 'legal:custody');
      changeStat(world, c, 'stress', 15, 'legal:custody');
    }
  }
  // Old closed civil matters are dropped after five years to bound history; convictions stay.
  for (const k of sortedValues(world.civics.cases)) {
    if (
      k.status === 'closed' &&
      !k.convicted &&
      k.closedTick !== null &&
      world.tick - k.closedTick > 60
    )
      Reflect.deleteProperty(world.civics.cases, k.id);
  }
}

/** Community service hours owed this month (for the time budget). */
export function communityHours(world: World, characterId: string): number {
  return sortedValues(world.civics.cases).some(
    (k) =>
      k.characterId === characterId &&
      k.outcome === 'community' &&
      k.closedTick !== null &&
      world.tick < k.closedTick + k.sentenceMonths,
  )
    ? COMMUNITY_HOURS
    : 0;
}
