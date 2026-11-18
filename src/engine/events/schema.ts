import { z } from 'zod';
import {
  CASE_KINDS,
  CONDITION_KINDS,
  HABIT_KEYS,
  NEED_KEYS,
  SKILL_KEYS,
  STAT_KEYS,
} from '../state/schema';

/**
 * Declarative event schema (spec §4 Events, §7). Content is pure data: no functions,
 * no code execution. The same schema validates built-in content and (from M8) imported packs.
 *
 * Fact values for stats/needs/skills/grades are fixed-point tenths (0..1000 = 0..100 shown).
 * An event may be about another person (its "subject"): the runtime picks a suitable person
 * from the player's relationships, and effects can change that relationship or create
 * memories that make other events eligible years later (spec §4 Butterfly effects).
 */

const FACT_PATTERN =
  /^(age\.(years|totalMonths)|month|isBirthMonth|stage|country|scenario|wealth|gender|difficulty|(stats|needs|skills|traits|habits)\.[a-zA-Z]+|flags\.[a-zA-Z0-9._-]+|school\.(stage|grade|final|private)|clubs\.[a-z-]+|job\.(employed|industry|level|performance|tenure)|money\.(savingsMonths|inDebt)|social\.(friends|partnered|married|children)|home\.own|memory\.[a-zA-Z0-9-]+|economy\.cycle|business\.(count|types)|property\.(count|rentals)|civic\.(citizen|newcomer|religion|participation|serving|veteran|office|candidate|duty|custody|voter|calledUp)|law\.(juries|drinkingAge)|health\.conditions|money\.netWorthMonths|media\.(followers|profiles)|legacy\.(generation|inherited|hasWill)|civic\.(citizenships|countriesLived)|career\.jobs|education\.degree|social\.grandchildren|achievements\.count)$/;

export const FactSchema = z.string().regex(FACT_PATTERN, 'Unknown fact name');

export type Predicate =
  | { kind: 'all'; of: Predicate[] }
  | { kind: 'any'; of: Predicate[] }
  | { kind: 'not'; of: Predicate }
  | {
      kind: 'cmp';
      fact: string;
      op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
      value: string | number | boolean;
    }
  | { kind: 'in'; fact: string; values: (string | number)[] };

export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('all'), of: z.array(PredicateSchema).max(20) }).strict(),
    z.object({ kind: z.literal('any'), of: z.array(PredicateSchema).max(20) }).strict(),
    z.object({ kind: z.literal('not'), of: PredicateSchema }).strict(),
    z
      .object({
        kind: z.literal('cmp'),
        fact: FactSchema,
        op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
        value: z.union([z.string().max(60), z.number().int(), z.boolean()]),
      })
      .strict(),
    z
      .object({
        kind: z.literal('in'),
        fact: FactSchema,
        values: z
          .array(z.union([z.string().max(60), z.number().int()]))
          .min(1)
          .max(50),
      })
      .strict(),
  ]),
);

export const SUBJECT_ROLES = [
  'parent',
  'sibling',
  'grandparent',
  'child',
  'relative',
  'partner',
  'friend',
  'classmate',
  'teacher',
  'colleague',
  'manager',
  'neighbour',
  'anyone',
] as const;
export type SubjectRole = (typeof SUBJECT_ROLES)[number];

/** Who an event is about. The runtime picks one matching person (seeded). */
export const SubjectSchema = z
  .object({
    role: z.enum(SUBJECT_ROLES),
    minCloseness: z.number().int().min(0).max(100),
    maxCloseness: z.number().int().min(0).max(100),
    minAge: z.number().int().min(0).max(120),
    maxAge: z.number().int().min(0).max(120),
    /** Only people who remember this about the player. */
    memory: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9-]{1,39}$/)
      .nullable(),
  })
  .strict();
export type Subject = z.infer<typeof SubjectSchema>;

const FixedDelta = z.number().int().min(-1000).max(1000);
const Small = z.number().int().min(-100).max(100);

/** Engine actions content may trigger (a closed list; content cannot run code). */
export const EVENT_ACTIONS = [
  'interview.confident',
  'interview.honest',
  'interview.curious',
] as const;

/** Events can be about one of the player's companies or properties (picked by the runtime). */
export const EVENT_ASSETS = ['business', 'rentalProperty', 'property'] as const;

export const EffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stat'), key: z.enum(STAT_KEYS), delta: FixedDelta }).strict(),
  z.object({ kind: z.literal('need'), key: z.enum(NEED_KEYS), delta: FixedDelta }).strict(),
  z.object({ kind: z.literal('skill'), key: z.enum(SKILL_KEYS), delta: FixedDelta }).strict(),
  z
    .object({
      kind: z.literal('habit'),
      key: z.enum(HABIT_KEYS),
      delta: z.number().int().min(-100).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('flag'),
      flag: z.string().regex(/^[a-zA-Z0-9._-]{1,60}$/),
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('relationship'),
      with: z.enum(['parents', 'siblings', 'friends', 'partner']),
      closeness: z.number().int().min(-100).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('subjectRelationship'),
      closeness: Small,
      trust: Small,
      respect: Small,
      conflict: Small,
    })
    .strict(),
  z.object({ kind: z.literal('subjectFriend') }).strict(),
  z
    .object({
      kind: z.literal('memory'),
      /** Who remembers: the subject (about the player) or the player (about the subject). */
      owner: z.enum(['subject', 'player']),
      key: z.string().regex(/^[a-z][a-zA-Z0-9-]{1,39}$/),
      valence: Small,
      salience: z.number().int().min(1).max(100),
      decay: z.enum(['fast', 'slow', 'permanent']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('money'),
      /** Percent of the local median monthly wage; negative is a cost. */
      percent: z.number().int().min(-2000).max(2000),
      category: z.string().regex(/^[a-z][a-zA-Z]{1,30}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('medical'),
      /** Treatment cost before coverage, percent of the median monthly wage. */
      percent: z.number().int().min(1).max(5000),
    })
    .strict(),
  z.object({ kind: z.literal('grade'), delta: FixedDelta }).strict(),
  z.object({ kind: z.literal('performance'), delta: FixedDelta }).strict(),
  z.object({ kind: z.literal('action'), action: z.enum(EVENT_ACTIONS) }).strict(),
  z
    .object({
      kind: z.literal('businessCash'),
      /** Percent of the company country's median monthly wage; negative is a cost. */
      percent: z.number().int().min(-5000).max(5000),
    })
    .strict(),
  z.object({ kind: z.literal('businessQuality'), delta: Small }).strict(),
  z.object({ kind: z.literal('businessBrand'), delta: Small }).strict(),
  z.object({ kind: z.literal('propertyCondition'), delta: FixedDelta }).strict(),
  // Milestone 6: open a legal case, diagnose a condition, a policy decision in office, duties.
  z
    .object({
      kind: z.literal('legalCase'),
      caseKind: z.enum(CASE_KINDS),
      strength: z.number().int().min(0).max(1000),
      role: z.enum(['defendant', 'claimant']),
    })
    .strict(),
  z.object({ kind: z.literal('condition'), condition: z.enum(CONDITION_KINDS) }).strict(),
  z
    .object({
      kind: z.literal('policy'),
      policyId: z.string().regex(/^[a-z][a-zA-Z0-9-]{1,39}$/),
      approval: z.number().int().min(-200).max(200),
      cycle: z.number().int().min(-100).max(100),
      inflationBp: z.number().int().min(-100).max(100),
    })
    .strict(),
  z
    .object({ kind: z.literal('dutyApproval'), delta: z.number().int().min(-200).max(200) })
    .strict(),
  z
    .object({
      kind: z.literal('propertyCost'),
      /** Repair cost, basis points of the property's value. */
      valueBp: z.number().int().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule'),
      eventId: z.string().min(1).max(60),
      inMonths: z.number().int().min(1).max(240),
      chancePercent: z.number().int().min(1).max(100),
      /** The follow-up is about the same person. */
      keepSubject: z.boolean(),
    })
    .strict(),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const ChoiceSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-zA-Z0-9-]{0,39}$/),
    requires: PredicateSchema.nullable(),
    effects: z.array(EffectSchema).max(20),
  })
  .strict();
export type Choice = z.infer<typeof ChoiceSchema>;

export const EventTextSchema = z
  .object({
    title: z.string().min(1).max(80),
    /** May use {subject} (the person's first name) and context fields such as {employer}. */
    body: z.string().min(1).max(600),
    choices: z.record(z.string(), z.string().min(1).max(120)),
    /** Short outcome line per choice (or "default" for events without choices). */
    outcomes: z.record(z.string(), z.string().min(1).max(200)),
  })
  .strict();

export const EVENT_CATEGORIES = [
  'childhood',
  'teen',
  'adult',
  'health',
  'family',
  'personal',
  'school',
  'social',
  'work',
  'money',
  'romance',
  'business',
  'property',
  'civic',
] as const;

export const EventDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,59}$/),
    version: z.number().int().min(1),
    category: z.enum(EVENT_CATEGORIES),
    /** Only fires when scheduled by another event's delayed consequence or the engine. */
    scheduledOnly: z.boolean(),
    when: PredicateSchema,
    subject: SubjectSchema.nullable(),
    asset: z.enum(EVENT_ASSETS).nullable(),
    /** Base probability per eligible month, in parts per million. */
    chancePpm: z.number().int().min(0).max(1_000_000),
    multipliers: z
      .array(
        z.object({ when: PredicateSchema, percent: z.number().int().min(0).max(1000) }).strict(),
      )
      .max(10),
    cooldownMonths: z.number().int().min(0).max(1200),
    maxOccurrences: z.number().int().min(1).nullable(),
    exclusiveGroup: z.string().max(40).nullable(),
    effects: z.array(EffectSchema).max(20),
    choices: z.array(ChoiceSchema).max(5),
    text: z.object({ en: EventTextSchema }).strict(),
  })
  .strict()
  .superRefine((def, ctx) => {
    if (def.choices.length === 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['choices'],
        message: 'An event needs 0 or 2-5 choices.',
      });
    }
    const ids = new Set<string>();
    def.choices.forEach((choice, index) => {
      if (ids.has(choice.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['choices', index, 'id'],
          message: 'Duplicate choice id.',
        });
      }
      ids.add(choice.id);
      if (!(choice.id in def.text.en.choices)) {
        ctx.addIssue({
          code: 'custom',
          path: ['text', 'en', 'choices', choice.id],
          message: 'Missing choice label.',
        });
      }
      if (!(choice.id in def.text.en.outcomes)) {
        ctx.addIssue({
          code: 'custom',
          path: ['text', 'en', 'outcomes', choice.id],
          message: 'Missing outcome text.',
        });
      }
    });
    if (def.choices.length === 0 && !('default' in def.text.en.outcomes)) {
      ctx.addIssue({
        code: 'custom',
        path: ['text', 'en', 'outcomes', 'default'],
        message: 'Missing outcome text.',
      });
    }
    const allEffects = [...def.effects, ...def.choices.flatMap((c) => c.effects)];
    const needsSubject = allEffects.some(
      (e) =>
        e.kind === 'subjectRelationship' ||
        e.kind === 'subjectFriend' ||
        e.kind === 'memory' ||
        (e.kind === 'schedule' && e.keepSubject),
    );
    if (needsSubject && def.subject === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['subject'],
        message: 'Effects refer to a subject but the event has none.',
      });
    }
    const needsAsset = allEffects.some(
      (e) => e.kind.startsWith('business') || e.kind.startsWith('property'),
    );
    if (needsAsset && def.asset === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['asset'],
        message: 'Effects refer to a company or property but the event has none.',
      });
    }
    if (def.subject && def.subject.minAge > def.subject.maxAge) {
      ctx.addIssue({ code: 'custom', path: ['subject', 'minAge'], message: 'minAge > maxAge.' });
    }
  });
export type EventDefinition = z.infer<typeof EventDefinitionSchema>;

export interface ContentValidationIssue {
  path: string;
  message: string;
}

/**
 * Validates a whole event set: shape, unique ids, schedule references and cycles among
 * scheduled-only events (which could otherwise chain forever).
 */
export function validateEventSet(raw: unknown[]): {
  events: EventDefinition[];
  issues: ContentValidationIssue[];
} {
  const issues: ContentValidationIssue[] = [];
  const events: EventDefinition[] = [];
  raw.forEach((item, index) => {
    const parsed = EventDefinitionSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ path: [index, ...issue.path].map(String).join('.'), message: issue.message });
      }
    } else events.push(parsed.data);
  });
  const byId = new Map<string, EventDefinition>();
  for (const event of events) {
    if (byId.has(event.id)) issues.push({ path: event.id, message: 'Duplicate event id.' });
    byId.set(event.id, event);
  }
  const edges = new Map<string, string[]>();
  for (const event of events) {
    const targets: string[] = [];
    const collect = (effects: readonly Effect[]) => {
      for (const effect of effects) {
        if (effect.kind !== 'schedule') continue;
        const target = byId.get(effect.eventId);
        if (!target) {
          issues.push({ path: event.id, message: `Schedules unknown event "${effect.eventId}".` });
          continue;
        }
        if (effect.keepSubject && target.subject === null) {
          issues.push({ path: event.id, message: `"${effect.eventId}" has no subject to keep.` });
        }
        targets.push(effect.eventId);
      }
    };
    collect(event.effects);
    for (const choice of event.choices) collect(choice.effects);
    edges.set(event.id, targets);
  }
  // Cycle detection over schedule edges.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, trail: string[]): void => {
    const mark = state.get(id);
    if (mark === 'done') return;
    if (mark === 'visiting') {
      issues.push({ path: id, message: `Scheduling cycle: ${[...trail, id].join(' -> ')}` });
      return;
    }
    state.set(id, 'visiting');
    for (const next of edges.get(id) ?? []) visit(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of [...edges.keys()].sort()) visit(id, []);
  return { events, issues };
}
