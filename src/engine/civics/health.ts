import { clamp, sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { medicalDue, payMedicalCost } from '../economy/finance';
import { getInstitutions } from '../world/institutions';
import type { Character, ConditionKind, HealthCondition, World } from '../state/schema';
import { inCustody } from './status';

/**
 * Healthcare (spec §1, §4 step 6; Milestone 6). The player can develop common conditions,
 * described non-graphically. Treatment is public (cost after public coverage, but there may
 * be a waiting list) or private (no wait, full price unless insured). Coverage depends on
 * the country's system and on residence status: temporary residents get only part of it in
 * some countries. Untreated conditions wear down health. All numbers PROPOSED TUNING.
 */

export interface ConditionRule {
  kind: ConditionKind;
  chronic: boolean;
  minAge: number;
  /** Monthly onset chance, parts per million (before risk factors). */
  onsetPpm: number;
  /** Treatment cost before coverage, percent of the median monthly wage. */
  costPercent: number;
  treatmentMonths: number;
  /** Chance an acute condition is cured by treatment, percent. */
  curePercent: number;
  /** Monthly health loss when untreated / managed or being treated (tenths). */
  drain: [number, number];
  /** Monthly medication for a managed chronic condition, percent of the median wage. */
  medicationPercent: number;
  /** Clears up by itself after this many months (null = never). */
  selfLimitingMonths: number | null;
  /** Chronic only: a costly therapy or operation that can end the condition for good. */
  cure?: { costPercent: number; months: number; percent: number };
}

/** Long-term conditions come and go: chance a month brings a flare-up, percent. */
const FLARE_PERCENT = { untreated: 40, managed: 10 } as const;

export const CONDITIONS: Record<ConditionKind, ConditionRule> = {
  flu: {
    kind: 'flu',
    chronic: false,
    minAge: 0,
    onsetPpm: 9_000,
    costPercent: 4,
    treatmentMonths: 1,
    curePercent: 98,
    drain: [25, 5],
    medicationPercent: 0,
    selfLimitingMonths: 1,
  },
  injury: {
    kind: 'injury',
    chronic: false,
    minAge: 3,
    onsetPpm: 3_000,
    costPercent: 60,
    treatmentMonths: 2,
    curePercent: 90,
    drain: [35, 10],
    medicationPercent: 0,
    selfLimitingMonths: 6,
  },
  dental: {
    kind: 'dental',
    chronic: false,
    minAge: 6,
    onsetPpm: 2_500,
    costPercent: 25,
    treatmentMonths: 1,
    curePercent: 97,
    drain: [10, 0],
    medicationPercent: 0,
    selfLimitingMonths: null,
  },
  backPain: {
    kind: 'backPain',
    chronic: false,
    minAge: 25,
    onsetPpm: 1_800,
    costPercent: 35,
    treatmentMonths: 3,
    curePercent: 80,
    drain: [12, 4],
    medicationPercent: 0,
    selfLimitingMonths: 9,
  },
  asthma: {
    kind: 'asthma',
    chronic: true,
    minAge: 2,
    onsetPpm: 500,
    costPercent: 20,
    treatmentMonths: 1,
    curePercent: 0,
    drain: [25, 4],
    medicationPercent: 4,
    selfLimitingMonths: null,
    cure: { costPercent: 500, months: 6, percent: 60 },
  },
  hypertension: {
    kind: 'hypertension',
    chronic: true,
    minAge: 35,
    onsetPpm: 1_400,
    costPercent: 15,
    treatmentMonths: 1,
    curePercent: 0,
    drain: [15, 2],
    medicationPercent: 2,
    selfLimitingMonths: null,
    cure: { costPercent: 400, months: 2, percent: 55 },
  },
  diabetes: {
    kind: 'diabetes',
    chronic: true,
    minAge: 35,
    onsetPpm: 800,
    costPercent: 35,
    treatmentMonths: 2,
    curePercent: 0,
    drain: [25, 5],
    medicationPercent: 6,
    selfLimitingMonths: null,
    cure: { costPercent: 1200, months: 3, percent: 60 },
  },
  depression: {
    kind: 'depression',
    chronic: false,
    minAge: 14,
    onsetPpm: 1_500,
    costPercent: 30,
    treatmentMonths: 6,
    curePercent: 75,
    drain: [10, 3],
    medicationPercent: 0,
    selfLimitingMonths: 18,
  },
  heartDisease: {
    kind: 'heartDisease',
    chronic: true,
    minAge: 50,
    onsetPpm: 500,
    costPercent: 400,
    treatmentMonths: 2,
    curePercent: 0,
    drain: [45, 8],
    medicationPercent: 8,
    selfLimitingMonths: null,
    cure: { costPercent: 2500, months: 3, percent: 75 },
  },
  seriousIllness: {
    kind: 'seriousIllness',
    chronic: false,
    minAge: 40,
    onsetPpm: 250,
    costPercent: 1500,
    treatmentMonths: 6,
    curePercent: 75,
    drain: [80, 20],
    medicationPercent: 0,
    selfLimitingMonths: null,
  },
};

export type HealthRejection =
  'unknownCondition' | 'alreadyTreated' | 'privateInCustody' | 'notTreatable' | 'noCure';

export const HEALTH_MESSAGES: Record<HealthRejection, string> = {
  unknownCondition: 'There is no such condition.',
  alreadyTreated: 'This is already being treated.',
  privateInCustody: 'Only public care is available in custody.',
  notTreatable: 'This clears up by itself; there is nothing to treat.',
  noCure: 'There is no cure for this; it can only be treated.',
};

export class HealthError extends Error {
  readonly code: HealthRejection;
  constructor(code: HealthRejection) {
    super(HEALTH_MESSAGES[code]);
    this.name = 'HealthError';
    this.code = code;
  }
}

export function publicWaitMonths(world: World, c: Character): number {
  const base = getInstitutions(c.countryCode).healthcare.publicWaitMonths;
  // Busier when the economy is weak.
  const cycle = world.economy[c.countryCode]?.cycle ?? 0;
  return Math.max(0, base + (cycle < -200 ? 1 : 0));
}

export function treatmentCost(world: World, c: Character, condition: HealthCondition): bigint {
  const rule = CONDITIONS[condition.kind];
  const percent = condition.procedure && rule.cure ? rule.cure.costPercent : rule.costPercent;
  return applyPercent(medianWage(world, c.countryCode), percent);
}

/** What the cure would cost after coverage, or null when the condition has none. */
export function cureQuote(
  world: World,
  c: Character,
  condition: HealthCondition,
): { public: bigint; private: bigint; percent: number; months: number } | null {
  const cure = CONDITIONS[condition.kind].cure;
  if (!cure) return null;
  const gross = treatmentCost(world, c, { ...condition, procedure: true });
  return {
    public: medicalDue(world, c, gross, 'public'),
    private: medicalDue(world, c, gross, 'private'),
    percent: cure.percent,
    months: cure.months,
  };
}

/** What the person would pay for each kind of care, after coverage and insurance. */
export function careQuote(
  world: World,
  c: Character,
  condition: HealthCondition,
): { public: bigint; private: bigint; waitMonths: number } {
  const gross = treatmentCost(world, c, condition);
  return {
    public: medicalDue(world, c, gross, 'public'),
    private: medicalDue(world, c, gross, 'private'),
    waitMonths: publicWaitMonths(world, c),
  };
}

function active(world: World, c: Character): HealthCondition[] {
  return sortedValues(world.civics.conditions).filter(
    (h) => h.characterId === c.id && h.status !== 'resolved',
  );
}

export function diagnose(world: World, c: Character, kind: ConditionKind): HealthCondition {
  const existing = active(world, c).find((h) => h.kind === kind);
  if (existing) return existing;
  const condition: HealthCondition = {
    id: nextId(world, 'cond'),
    characterId: c.id,
    kind,
    severity: withRng(world, 'civics', (rng) => rng.range(300, 800)),
    diagnosedTick: world.tick,
    status: 'untreated',
    care: null,
    waitUntilTick: null,
    treatmentEndTick: null,
    resolvedTick: null,
  };
  world.civics.conditions[condition.id] = condition;
  addNotification(world, 'health', 'ntf.diagnosed', { kind }, 'health', condition.id);
  if (CONDITIONS[kind].chronic || kind === 'seriousIllness')
    addBiography(world, c.id, 'health', 'bio.diagnosed', { kind });
  return condition;
}

function startTreatment(world: World, c: Character, h: HealthCondition): void {
  const rule = CONDITIONS[h.kind];
  payMedicalCost(world, c, treatmentCost(world, c, h), h.id, h.care ?? 'public');
  h.status = 'treating';
  h.waitUntilTick = null;
  h.treatmentEndTick =
    world.tick + (h.procedure && rule.cure ? rule.cure.months : rule.treatmentMonths);
}

/** Starts treatment (with `cure`, the curing therapy or operation) now or after the public wait. */
export function treat(
  world: World,
  c: Character,
  conditionId: string,
  care: 'public' | 'private',
  cure = false,
): void {
  const h = world.civics.conditions[conditionId];
  if (h?.characterId !== c.id || h.status === 'resolved') throw new HealthError('unknownCondition');
  if (cure && !CONDITIONS[h.kind].cure) throw new HealthError('noCure');
  if (h.status !== 'untreated' && !(cure && h.status === 'managed'))
    throw new HealthError('alreadyTreated');
  if (care === 'private' && inCustody(world, c)) throw new HealthError('privateInCustody');
  if (h.kind === 'flu') throw new HealthError('notTreatable');
  h.care = care;
  if (cure) h.procedure = true;
  const wait = care === 'public' ? publicWaitMonths(world, c) : 0;
  if (wait > 0) {
    h.status = 'waiting';
    h.waitUntilTick = world.tick + wait;
  } else {
    startTreatment(world, c, h);
  }
}

function onsetMultiplier(c: Character, age: number, kind: ConditionKind): number {
  let m = 100;
  const stress = c.stats.stress;
  const exercise = c.habits.exercise;
  if (kind === 'hypertension' || kind === 'heartDisease')
    m += Math.max(0, age - 40) * 4 + Math.floor(stress / 10);
  if (kind === 'diabetes') m += Math.max(0, age - 40) * 3 + (exercise < 30 ? 60 : 0);
  if (kind === 'seriousIllness') m += Math.max(0, age - 45) * 8;
  if (kind === 'depression') m = stress > 700 ? 300 : stress > 500 ? 120 : 40;
  if (kind === 'injury' && exercise > 60) m += 50;
  if (kind === 'backPain') m += Math.max(0, age - 30) * 2;
  if (c.stats.health < 400) m += 50;
  if (exercise > 60 && kind !== 'injury') m -= 25;
  return clamp(m, 10, 800);
}

/** Monthly health for the player: new conditions, waiting lists, treatment, drain. */
export function processHealth(world: World): void {
  const c = world.characters[world.activeCharacterId];
  if (c?.death !== null) return;
  const age = ageYears(world, c);
  const current = active(world, c);

  // At most one new condition a month.
  if (current.length < 4) {
    for (const rule of Object.values(CONDITIONS)) {
      if (age < rule.minAge || current.some((h) => h.kind === rule.kind)) continue;
      const ppm = Math.floor((rule.onsetPpm * onsetMultiplier(c, age, rule.kind)) / 100);
      if (withRng(world, 'civics', (rng) => rng.chancePpm(ppm))) {
        diagnose(world, c, rule.kind);
        break;
      }
    }
  }

  for (const h of active(world, c)) {
    const rule = CONDITIONS[h.kind];
    if (h.diagnosedTick === world.tick) continue;
    if (h.status === 'waiting' && h.waitUntilTick !== null && world.tick >= h.waitUntilTick) {
      startTreatment(world, c, h);
      addNotification(world, 'health', 'ntf.treatmentStarted', { kind: h.kind }, 'health', h.id);
    }
    const unwell = h.status === 'untreated' || h.status === 'waiting';
    let drain = unwell ? rule.drain[0] : rule.drain[1];
    // Long-term conditions only take health in the months they flare up (milder when managed).
    if (rule.chronic && h.status !== 'treating') {
      const odds = FLARE_PERCENT[unwell ? 'untreated' : 'managed'];
      const flare = withRng(world, 'civics', (rng) => rng.int(100) < odds);
      if (flare) addNotification(world, 'health', 'ntf.flareUp', { kind: h.kind }, 'health', h.id);
      drain = !flare ? 0 : unwell ? rule.drain[0] : Math.floor(rule.drain[0] / 2);
    }
    const scaled = Math.floor((drain * (500 + h.severity)) / 1000);
    if (scaled > 0) changeStat(world, c, 'health', -scaled, `condition:${h.kind}`);
    if (h.kind === 'depression') {
      changeStat(world, c, 'happiness', h.status === 'treating' ? -5 : -25, 'condition:depression');
    }

    if (
      h.status === 'treating' &&
      h.treatmentEndTick !== null &&
      world.tick >= h.treatmentEndTick
    ) {
      if (h.procedure && rule.cure) {
        const cured = rule.cure.percent;
        delete h.procedure;
        if (withRng(world, 'civics', (rng) => rng.int(100) < cured)) {
          h.status = 'resolved';
          h.resolvedTick = world.tick;
          changeStat(world, c, 'health', 80, `cured:${h.kind}`);
          addNotification(world, 'health', 'ntf.conditionCured', { kind: h.kind }, 'health', h.id);
        } else {
          h.status = 'managed';
          addNotification(world, 'health', 'ntf.cureFailed', { kind: h.kind }, 'health', h.id);
        }
      } else if (rule.chronic) {
        h.status = 'managed';
        addNotification(world, 'health', 'ntf.conditionManaged', { kind: h.kind }, 'health', h.id);
      } else if (withRng(world, 'civics', (rng) => rng.int(100) < rule.curePercent)) {
        h.status = 'resolved';
        h.resolvedTick = world.tick;
        changeStat(world, c, 'health', 40, `treated:${h.kind}`);
        addNotification(world, 'health', 'ntf.conditionResolved', { kind: h.kind }, 'health', h.id);
      } else {
        h.status = 'untreated';
        h.care = null;
        h.treatmentEndTick = null;
        h.severity = clamp(h.severity - 150, 100, 1000);
        addNotification(world, 'health', 'ntf.treatmentFailed', { kind: h.kind }, 'health', h.id);
      }
    } else if (h.status === 'managed' && rule.medicationPercent > 0) {
      payMedicalCost(
        world,
        c,
        applyPercent(medianWage(world, c.countryCode), rule.medicationPercent),
        h.id,
        'public',
      );
    } else if (
      (h.status === 'untreated' || h.status === 'waiting') &&
      rule.selfLimitingMonths !== null &&
      world.tick - h.diagnosedTick >= rule.selfLimitingMonths
    ) {
      h.status = 'resolved';
      h.resolvedTick = world.tick;
      addNotification(world, 'health', 'ntf.conditionResolved', { kind: h.kind }, 'health', h.id);
    } else if (h.status === 'untreated') {
      h.severity = clamp(h.severity + (rule.chronic ? 10 : 20), 0, 1000);
    }
  }

  // Resolved conditions are kept for a year (history), then dropped to bound the world size.
  for (const h of sortedValues(world.civics.conditions)) {
    if (h.status === 'resolved' && h.resolvedTick !== null && world.tick - h.resolvedTick > 12)
      Reflect.deleteProperty(world.civics.conditions, h.id);
    else if (world.characters[h.characterId]?.death !== null && h.characterId !== c.id)
      Reflect.deleteProperty(world.civics.conditions, h.id);
  }
}
