import { clamp, sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { Rng } from '../core/rng';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { spendHours, timeBudget } from '../calendar/time';
import { changeSkill, changeStat } from '../characters/stats';
import { hasUnspentConviction } from '../civics/status';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor } from '../economy/finance';
import { addMemory } from '../social/memories';
import { meetPeople } from '../social/npcs';
import { adjustPair } from '../social/relationships';
import { getCountry } from '../world/countries';
import type {
  Casework,
  Character,
  Employment,
  Profession,
  ProfessionalCase,
  SkillKey,
  World,
} from '../state/schema';
import { activeEmployment } from './jobs';
import { getOccupation, meetsEducation } from './occupations';

/**
 * Professional casework (decision E93), one engine for every profession that works on
 * cases: lawyers take client cases, journalists report stories, doctors see patients.
 * Each profession plugs in its own case templates, actions, resolutions and entry rules.
 * A case offer arrives monthly; taking it on makes the client, source or patient a real NPC;
 * work on it month by month (examine items, talk to the party, prepare); then choose how
 * to resolve it. The result follows preparation, what the evidence really shows, trust,
 * skill and a seeded element, and is explained, never guaranteed. Entry rules are enforced
 * here, not in the UI: licensed roles need the degree and the country's admission.
 * All numbers PROPOSED TUNING; cases, clients and places are fictional.
 */

interface Template {
  kind: string;
  title: string;
  items: readonly string[];
}
interface Option {
  id: string;
  label: string;
  /** High-risk options swing further either way. */
  risky: boolean;
}
export interface ProfessionConfig {
  /** Roles that may take cases on their own, and the supervised trainee role (routine only). */
  practising: readonly string[];
  trainee: string | null;
  /** Roles in the field that support casework but may not take it on (shown why). */
  support: readonly string[];
  /** Licence flag on the character (none for professions with no licensing). */
  licence: string | null;
  /** Shown to people in the field who may not take cases (support roles). */
  supportReason: string;
  skills: readonly SkillKey[];
  templates: readonly Template[];
  actions: { examine: string; clarify: string; prepare: string };
  options: readonly Option[];
  parties: readonly string[];
}

export const PROFESSION: Partial<Record<Profession, ProfessionConfig>> = {
  law: {
    practising: ['lawyer', 'corporate-lawyer', 'law-firm-partner'],
    trainee: 'trainee-lawyer',
    support: ['paralegal', 'legal-assistant', 'court-clerk'],
    licence: 'licence.law',
    supportReason: 'Taking cases requires a law degree and admission as a lawyer.',
    skills: ['reading', 'logic', 'socializing'],
    templates: [
      {
        kind: 'contract',
        title: 'Unpaid design invoice',
        items: ['Signed agreement', 'Delivery log', 'Email thread', 'Invoice'],
      },
      {
        kind: 'employment',
        title: 'Disputed dismissal',
        items: ['Employment contract', 'Performance reviews', 'Witness statement'],
      },
      {
        kind: 'consumer',
        title: 'Faulty appliance refund',
        items: ['Receipt', 'Repair report', 'Product warranty'],
      },
      {
        kind: 'property',
        title: 'Shared driveway dispute',
        items: ['Title deed', 'Survey plan', 'Neighbour letters', 'Council record'],
      },
      {
        kind: 'family',
        title: 'Parenting arrangements',
        items: ['School schedule', 'Mediation notes', 'Work rota'],
      },
      {
        kind: 'negligence',
        title: 'Slip at a supermarket',
        items: ['Incident report', 'Expert summary', 'CCTV log', 'Cleaning schedule'],
      },
    ],
    actions: {
      examine: 'Examine the next item of evidence',
      clarify: 'Ask the client to clarify',
      prepare: 'Prepare the arguments',
    },
    options: [
      { id: 'settle', label: 'Negotiate a settlement', risky: false },
      { id: 'hearing', label: 'Take it to a hearing', risky: true },
    ],
    parties: [
      'Lumen Design Studio',
      'Arif Rahman',
      'Copperleaf Cafe',
      'Mei Lin Tan',
      'Northgate Tenants Group',
      'Daniel Okafor',
    ],
  },
  media: {
    // No licence: the gate is a relevant diploma or degree (media field), checked by meetsEducation.
    practising: ['journalist'],
    trainee: null,
    support: ['video-editor', 'broadcast-technician', 'social-media-manager', 'copywriter'],
    licence: null,
    supportReason:
      'Professional reporting requires a journalist role, which needs a relevant diploma or degree.',
    skills: ['reading', 'socializing'],
    templates: [
      {
        kind: 'local',
        title: 'Council budget cuts',
        items: ['Council statement', 'Budget papers', 'Resident account'],
      },
      {
        kind: 'business',
        title: 'New factory opening',
        items: ['Company announcement', 'Hiring figures', 'Union comment', 'Planning records'],
      },
      {
        kind: 'entertainment',
        title: 'Film production delays',
        items: ['Studio statement', 'Crew member account', 'Filming schedule'],
      },
      {
        kind: 'politics',
        title: 'Election debate claims',
        items: ['Candidate claim', 'Official statistics', 'Expert view', 'Campaign leaflet'],
      },
      {
        kind: 'science',
        title: 'Hospital waiting times',
        items: ['Health board report', 'Patient account', 'Researcher interview'],
      },
      {
        kind: 'investigative',
        title: 'Missing housing funds',
        items: [
          'Leaked memo',
          'Contract records',
          'Whistleblower account',
          'Official reply',
          'Bank filings',
        ],
      },
    ],
    actions: {
      examine: 'Verify the next claim',
      clarify: 'Interview a source',
      prepare: 'Draft and revise',
    },
    options: [
      { id: 'brief', label: 'Publish a short news report', risky: false },
      { id: 'feature', label: 'Publish an in-depth feature', risky: true },
    ],
    parties: [
      'Riverbend Council',
      'Northgate Logistics',
      'Lumen Pictures',
      'Harbourside Clinic',
      'A local resident',
      'Greenway Schools Trust',
    ],
  },
};

/** Supervised training months before the admission or registration exam (fictionalised). */
const TRAINING_MONTHS: Record<'law' | 'medicine', Record<string, number>> = {
  law: {
    MY: 9,
    SG: 6,
    ID: 6,
    TH: 6,
    JP: 12,
    KR: 6,
    CN: 12,
    IN: 0,
    AU: 12,
    NZ: 12,
    US: 0,
    CA: 10,
    GB: 24,
    FR: 18,
    DE: 24,
    IT: 18,
    BR: 0,
    ZA: 12,
    AE: 12,
    SA: 12,
  },
  medicine: {
    MY: 24,
    SG: 12,
    ID: 12,
    TH: 12,
    JP: 24,
    KR: 12,
    CN: 12,
    IN: 12,
    AU: 12,
    NZ: 12,
    US: 12,
    CA: 12,
    GB: 24,
    FR: 24,
    DE: 18,
    IT: 12,
    BR: 0,
    ZA: 24,
    AE: 12,
    SA: 12,
  },
};
/** Countries without a profile use the longest path, so nobody practises early. */
const FALLBACK_TRAINING_MONTHS = 24;

export function trainingRequired(profession: 'law' | 'medicine', countryCode: string): number {
  return TRAINING_MONTHS[profession][countryCode] ?? FALLBACK_TRAINING_MONTHS;
}

export const CASEWORK_MESSAGES = {
  noRole: 'You need a job in this profession to take on its work.',
  support: '',
  noLicence: 'Admission is not complete: pass the licensing exam after your supervised training.',
  suspended: 'Your licence is suspended while you have a serious unspent conviction.',
  noCredential: 'Requires a completed, recognised qualification for this role.',
  noCase: 'That case is no longer available.',
  supervised: 'As a trainee you may only take routine work under supervision.',
  full: 'You already have three active cases.',
  done: 'You have already done this on this case this month.',
  nothingToExamine: 'Every item on this case has been examined.',
  noTime: 'You have no free time left this month.',
  tooTired: 'You are too tired; rest first.',
  notActive: 'Take the case on first.',
  noDegree: 'The licensing exam needs the qualifying degree.',
  training: 'Finish your supervised training first.',
  licensed: 'You are already licensed.',
  examSoon: 'You can retake the exam six months after your last attempt.',
  cannotAfford: 'You cannot afford the exam fee right now.',
} as const;
export type CaseworkBlock = keyof typeof CASEWORK_MESSAGES;

export class CaseworkError extends Error {
  constructor(
    readonly code: CaseworkBlock,
    message?: string,
  ) {
    super(message ?? CASEWORK_MESSAGES[code]);
    this.name = 'CaseworkError';
  }
}

const NEW_CASEWORK: Casework = { cases: [], record: [], integrity: 500, trust: 500, examTick: {} };
function caseworkOf(c: Character): Casework {
  c.career.casework ??= { ...NEW_CASEWORK, cases: [], record: [], examTick: {} };
  return c.career.casework;
}
const read = (c: Character) => c.career.casework ?? NEW_CASEWORK;

/** The profession the current job belongs to, and whether it may take cases (and how). */
export function practice(world: World, c: Character) {
  const job = activeEmployment(world, c);
  if (!job) return null;
  for (const [profession, cfg] of Object.entries(PROFESSION) as [Profession, ProfessionConfig][]) {
    const id = job.terms.occupationId;
    const practising = cfg.practising.includes(id);
    const trainee = id === cfg.trainee;
    if (!practising && !trainee && !cfg.support.includes(id)) continue;
    const block = practiceBlock(world, c, cfg, job, practising, trainee);
    return { profession, cfg, supervised: trainee, block };
  }
  return null;
}

function practiceBlock(
  world: World,
  c: Character,
  cfg: ProfessionConfig,
  job: Employment,
  practising: boolean,
  trainee: boolean,
): { code: CaseworkBlock; message: string } | null {
  const fail = (code: CaseworkBlock) => ({ code, message: CASEWORK_MESSAGES[code] });
  if (!practising && !trainee) return { code: 'support', message: cfg.supportReason };
  // The credential is re-checked here too, so a malformed or imported save cannot bypass it.
  if (!meetsEducation(getOccupation(job.terms.occupationId), c.education.qualifications))
    return fail('noCredential');
  if (practising && cfg.licence) {
    if (c.flags[cfg.licence] !== true) return fail('noLicence');
    if (hasUnspentConviction(world, c.id, 'serious')) return fail('suspended');
  }
  return null;
}

/** Months worked in the supervised trainee role for a profession. */
export function traineeMonths(world: World, c: Character, profession: 'law' | 'medicine'): number {
  const trainee = PROFESSION[profession]?.trainee;
  let months = 0;
  for (const e of sortedValues(world.employment))
    if (e.characterId === c.id && e.terms.occupationId === trainee)
      months += (e.endTick ?? world.tick) - e.startTick;
  return months;
}

export function examFee(world: World, c: Character): bigint {
  return applyPercent(medianWage(world, c.countryCode), 50);
}

export function examBlock(
  world: World,
  c: Character,
  profession: 'law' | 'medicine',
): CaseworkBlock | null {
  const cfg = PROFESSION[profession];
  if (!cfg?.licence) return 'noRole';
  if (c.flags[cfg.licence] === true) return 'licensed';
  if (!meetsEducation(getOccupation(cfg.practising[0] ?? ''), c.education.qualifications))
    return 'noDegree';
  if (traineeMonths(world, c, profession) < trainingRequired(profession, c.countryCode))
    return 'training';
  const last = read(c).examTick[profession];
  if (last !== undefined && world.tick - last < 6) return 'examSoon';
  const payer = payerFor(world, c);
  const bal = (id: string | null | undefined) =>
    id ? (world.ledger.accounts[id]?.balance ?? 0n) : 0n;
  if (!payer || bal(payer.checkingId) + bal(payer.savingsId) < examFee(world, c))
    return 'cannotAfford';
  return null;
}

/** The admission or registration exam: a fee, and a pass that depends on the core skills. */
export function takeLicenceExam(
  world: World,
  c: Character,
  profession: 'law' | 'medicine',
): boolean {
  const block = examBlock(world, c, profession);
  const cfg = PROFESSION[profession];
  if (block || !cfg?.licence) throw new CaseworkError(block ?? 'noRole');
  const payer = payerFor(world, c);
  if (payer)
    payExpense(world, payer, 'training', examFee(world, c), 'tx.licenceExam', { profession });
  caseworkOf(c).examTick[profession] = world.tick;
  const skill = Math.floor(cfg.skills.reduce((s, k) => s + c.skills[k], 0) / cfg.skills.length);
  const passed = withRng(
    world,
    'career',
    (rng) => rng.int(100) < clamp(35 + Math.floor(skill / 12), 10, 90),
  );
  if (passed) {
    c.flags[cfg.licence] = true;
    addBiography(world, c.id, 'work', 'bio.licensed', { profession });
    addNotification(world, 'work', 'ntf.licensed', { profession }, 'career');
  }
  return passed;
}

// ---------- Cases ----------

function newCase(
  world: World,
  profession: Profession,
  cfg: ProfessionConfig,
  routine: boolean,
): ProfessionalCase {
  const rng = new Rng(world.rng.career);
  const t = rng.pick(cfg.templates);
  const items = (routine ? t.items.slice(0, 2) : t.items).map((label) => ({
    label,
    status: 'unreviewed' as const,
    strong: rng.int(100) < 60,
  }));
  const months = routine ? rng.range(1, 2) : rng.range(2, 4);
  const party = rng.pick(cfg.parties);
  world.rng.career = rng.state();
  return {
    id: nextId(world, 'case'),
    profession,
    kind: t.kind,
    title: t.title,
    party,
    partyId: null,
    items,
    prep: 10,
    trust: 50,
    routine,
    status: 'offer',
    expiresTick: world.tick + 1,
    deadlineTick: world.tick + months,
  };
}

const ACTIONS = ['examine', 'clarify', 'prepare'] as const;
export type CaseAction = (typeof ACTIONS)[number];
const HOURS: Record<CaseAction, number> = { examine: 3, clarify: 2, prepare: 4 };
const ENERGY: Record<CaseAction, number> = { examine: 20, clarify: 10, prepare: 30 };
const counted = (world: World, key: string) =>
  world.activity.tick === world.tick ? (world.activity.counts[`case:${key}`] ?? 0) : 0;

export function takeCaseBlock(
  world: World,
  c: Character,
  k: ProfessionalCase | undefined,
): string | null {
  const p = practice(world, c);
  if (!p) return CASEWORK_MESSAGES.noRole;
  if (p.block) return p.block.message;
  if (k?.status !== 'offer' || k.profession !== p.profession) return CASEWORK_MESSAGES.noCase;
  if (p.supervised && !k.routine) return CASEWORK_MESSAGES.supervised;
  if (read(c).cases.filter((x) => x.status === 'active').length >= 3) return CASEWORK_MESSAGES.full;
  return null;
}

export function takeCase(world: World, c: Character, caseId: string): ProfessionalCase {
  const k = read(c).cases.find((x) => x.id === caseId);
  const block = takeCaseBlock(world, c, k);
  if (block || !k) throw new CaseworkError('noCase', block ?? undefined);
  const age = ageYears(world, c);
  const [npc] = meetPeople(world, c, 1, 'acquaintance', [Math.max(18, age - 20), age + 25]);
  // The client, source or patient (or their contact person) becomes someone you know.
  if (npc) k.partyId = npc.id;
  k.status = 'active';
  return k;
}

export function declineCase(c: Character, caseId: string): void {
  const cw = caseworkOf(c);
  const k = cw.cases.find((x) => x.id === caseId && x.status === 'offer');
  if (!k) throw new CaseworkError('noCase');
  cw.cases = cw.cases.filter((x) => x !== k);
}

export function caseActionBlock(
  world: World,
  c: Character,
  k: ProfessionalCase | undefined,
  action: CaseAction,
): CaseworkBlock | null {
  const p = practice(world, c);
  if (!p || p.block) return p?.block?.code ?? 'noRole';
  if (k?.status !== 'active') return 'notActive';
  if (counted(world, `${k.id}:${action}`) > 0) return 'done';
  if (action === 'examine' && !k.items.some((i) => i.status === 'unreviewed'))
    return 'nothingToExamine';
  const t = timeBudget(world);
  if (t.used + HOURS[action] > t.total) return 'noTime';
  return c.stats.energy < ENERGY[action] ? 'tooTired' : null;
}

/** One piece of work on a case, once per action per case each month. */
export function workOnCase(world: World, c: Character, caseId: string, action: CaseAction): string {
  const k = read(c).cases.find((x) => x.id === caseId);
  const block = caseActionBlock(world, c, k, action);
  const p = practice(world, c);
  if (block || !k || !p) throw new CaseworkError(block ?? 'noCase');
  spendHours(world, HOURS[action]);
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  world.activity.counts[`case:${k.id}:${action}`] = 1;
  changeStat(world, c, 'energy', -ENERGY[action], `case:${action}`);
  for (const skill of p.cfg.skills) changeSkill(world, c, skill, 4, `case:${action}`);
  switch (action) {
    case 'examine': {
      const item = k.items.find((i) => i.status === 'unreviewed');
      if (!item) return 'nothing';
      item.status = item.strong ? 'corroborated' : 'contested';
      return item.strong ? 'corroborated' : 'contested';
    }
    case 'clarify': {
      const good = withRng(world, 'career', (rng) => rng.int(100) < 50 + Math.floor(k.trust / 3));
      k.trust = clamp(k.trust + (good ? 15 : 5), 0, 100);
      if (k.partyId) adjustPair(world, c.id, k.partyId, { trust: good ? 8 : 2, closeness: 4 });
      return good ? 'clarified' : 'vague';
    }
    case 'prepare':
      k.prep = clamp(k.prep + Math.max(5, 30 - Math.floor(k.prep / 4)), 0, 100);
      changeStat(world, c, 'stress', 10, 'case:prepare');
      return 'prepared';
  }
}

export function resolveBlock(
  world: World,
  c: Character,
  k: ProfessionalCase | undefined,
): CaseworkBlock | null {
  const p = practice(world, c);
  if (!p || p.block) return p?.block?.code ?? 'noRole';
  return k?.status === 'active' ? null : 'notActive';
}

/**
 * Resolves a case with the chosen option. The score combines preparation, how the examined
 * items held up, items never checked, the party's trust and skill, plus a seeded swing
 * (wider for risky options). Returns the outcome band and the main reasons, for feedback.
 */
export function resolveCase(
  world: World,
  c: Character,
  caseId: string,
  optionId: string,
  late = false,
) {
  const k = read(c).cases.find((x) => x.id === caseId);
  const p = practice(world, c);
  const block = late ? null : resolveBlock(world, c, k);
  if (block || !k) throw new CaseworkError(block ?? 'noCase');
  const cfg = PROFESSION[k.profession];
  const option = cfg?.options.find((o) => o.id === optionId) ?? cfg?.options[0];
  if (!cfg || !option) throw new CaseworkError('noCase');
  const corroborated = k.items.filter((i) => i.status === 'corroborated').length;
  const contested = k.items.filter((i) => i.status === 'contested').length;
  const unchecked = k.items.filter((i) => i.status === 'unreviewed').length;
  const skill = Math.floor(cfg.skills.reduce((s, x) => s + c.skills[x], 0) / cfg.skills.length);
  const swing = withRng(world, 'career', (rng) =>
    option.risky ? rng.range(-25, 25) : rng.range(-10, 10),
  );
  const score =
    Math.floor(k.prep * 0.4) +
    corroborated * 12 -
    contested * 10 -
    unchecked * 8 +
    Math.floor(k.trust / 10) +
    Math.floor(skill / 25) +
    (option.risky ? 8 : 0) +
    swing -
    (late ? 25 : 0);
  const outcome: 'good' | 'mixed' | 'poor' = score >= 55 ? 'good' : score >= 30 ? 'mixed' : 'poor';
  const cw = caseworkOf(c);
  cw.cases = cw.cases.filter((x) => x !== k);
  cw.record = [
    ...cw.record,
    {
      profession: k.profession,
      title: k.title,
      party: k.party,
      option: option.id,
      outcome,
      unverified: unchecked + contested > 0,
      tick: world.tick,
    },
  ].slice(-60);
  const delta = { good: 40, mixed: 10, poor: -30 }[outcome];
  cw.trust = clamp(cw.trust + delta, 0, 1000);
  // Integrity: relying on unchecked or disputed material costs it (a correction, for a story).
  cw.integrity = clamp(cw.integrity + (unchecked + contested > 0 ? -40 : 15), 0, 1000);
  if (unchecked + contested > 0 && k.profession === 'media')
    addNotification(world, 'work', 'ntf.storyCorrection', { title: k.title }, 'career');
  c.career.reputation = clamp(c.career.reputation + Math.floor(delta / 2), 0, 1000);
  const job = p ? activeEmployment(world, c) : null;
  if (job) job.performance = clamp(job.performance + delta, 0, 1000);
  if (k.partyId)
    addMemory(world, {
      ownerId: k.partyId,
      subjectIds: [c.id],
      key: outcome === 'poor' ? 'caseLetDown' : 'caseHelped',
      source: 'casework',
      valence: outcome === 'poor' ? -30 : outcome === 'good' ? 40 : 10,
      salience: 50,
      decay: 'slow',
    });
  const reason = late
    ? 'late'
    : unchecked > 0
      ? 'unchecked'
      : contested > corroborated
        ? 'contested'
        : k.prep < 40
          ? 'underprepared'
          : outcome === 'good'
            ? 'strong'
            : 'uncertain';
  return { outcome, why: WHY[reason] ?? '', title: k.title };
}

/** The main reason behind a result, said plainly (never the dice). */
const WHY: Record<string, string> = {
  late: 'The deadline passed before it was resolved.',
  unchecked: 'Some items were never examined.',
  contested: 'Too much of what you relied on was disputed.',
  underprepared: 'More preparation would have helped.',
  strong: 'Careful preparation and solid evidence paid off.',
  uncertain: 'It could have gone either way.',
};

/** Once a month for the player: grandfathered licences, new offers, and missed deadlines. */
export function processCasework(world: World, c: Character): void {
  const p = practice(world, c);
  const job = activeEmployment(world, c);
  // shortcut: a practising job held without a licence (saves from before E93, or an NPC heir
  // who practised) counts as admitted; new hires are gated at application. Revisit if imports matter.
  if (p && job && p.cfg.licence && p.cfg.practising.includes(job.terms.occupationId))
    c.flags[p.cfg.licence] = true;
  if (!c.career.casework && !p) return;
  const cw = caseworkOf(c);
  cw.cases = cw.cases.filter((x) => x.status === 'active' || x.expiresTick >= world.tick);
  for (const k of cw.cases.filter((x) => x.status === 'active' && x.deadlineTick < world.tick)) {
    const r = resolveCase(world, c, k.id, '', true);
    addNotification(world, 'work', 'ntf.caseMissed', { title: r.title }, 'career');
  }
  const p2 = practice(world, c);
  if (!p2 || p2.block) return;
  if (cw.cases.filter((x) => x.status === 'offer').length < 2)
    cw.cases.push(
      newCase(
        world,
        p2.profession,
        p2.cfg,
        p2.supervised || withRng(world, 'career', (rng) => rng.int(3) === 0),
      ),
    );
}

export function projectCasework(world: World, c: Character) {
  const p = practice(world, c);
  if (!p && !c.career.casework) return null;
  const cw = read(c);
  const profession = p?.profession ?? cw.record.at(-1)?.profession ?? 'law';
  const cfg = PROFESSION[profession];
  const licensable = profession === 'law' || profession === 'medicine' ? profession : null;
  return {
    profession,
    role: p ? getOccupation(activeEmployment(world, c)?.terms.occupationId ?? '').title : null,
    block: p?.block?.message ?? (p ? null : CASEWORK_MESSAGES.noRole),
    supervised: p?.supervised ?? false,
    licensed: cfg?.licence ? c.flags[cfg.licence] === true : null,
    exam: licensable
      ? {
          feeMinor: examFee(world, c),
          trainingDone: traineeMonths(world, c, licensable),
          trainingNeeded: trainingRequired(licensable, c.countryCode),
          reason: (() => {
            const b = examBlock(world, c, licensable);
            return b && b !== 'licensed' ? CASEWORK_MESSAGES[b] : null;
          })(),
        }
      : null,
    integrity: cw.integrity,
    trust: cw.trust,
    actions: cfg?.actions ?? null,
    options: cfg?.options ?? [],
    cases: cw.cases.map((k) => ({
      ...k,
      // The hidden truth stays hidden until an item is examined.
      items: k.items.map(({ label, status }) => ({ label, status })),
      takeReason: k.status === 'offer' ? takeCaseBlock(world, c, k) : null,
      actionReasons: Object.fromEntries(
        ACTIONS.map((a) => {
          const b = k.status === 'active' ? caseActionBlock(world, c, k, a) : 'notActive';
          return [a, b ? CASEWORK_MESSAGES[b] || (p?.block?.message ?? '') : null];
        }),
      ) as Record<CaseAction, string | null>,
    })),
    record: [...cw.record].reverse(),
    currency: getCountry(c.countryCode).currency,
  };
}
