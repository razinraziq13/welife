import { z } from 'zod';
import { HABIT_KEYS, NEED_KEYS, SKILL_KEYS, STAT_KEYS } from '../state/schema';

/**
 * Declarative event schema (spec §4 Events, §7). Content is pure data: no functions,
 * no code execution. The same schema validates built-in content and (from M8) imported packs.
 *
 * Fact values for stats/needs/skills are fixed-point tenths (0..1000 = 0..100 displayed).
 */

const FACT_PATTERN =
  /^(age\.(years|totalMonths)|month|isBirthMonth|stage|country|scenario|wealth|gender|difficulty|(stats|needs|skills|traits|habits)\.[a-zA-Z]+|flags\.[a-zA-Z0-9._-]+)$/;

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

const FixedDelta = z.number().int().min(-1000).max(1000);

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
      with: z.enum(['parents', 'siblings']),
      closeness: z.number().int().min(-100).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule'),
      eventId: z.string().min(1).max(60),
      inMonths: z.number().int().min(1).max(240),
      chancePercent: z.number().int().min(1).max(100),
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
    body: z.string().min(1).max(600),
    choices: z.record(z.string(), z.string().min(1).max(120)),
    /** Short outcome line per choice (or "default" for events without choices). */
    outcomes: z.record(z.string(), z.string().min(1).max(200)),
  })
  .strict();

export const EventDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,59}$/),
    version: z.number().int().min(1),
    category: z.enum(['childhood', 'teen', 'adult', 'health', 'family', 'personal']),
    /** Only fires when scheduled by another event's delayed consequence. */
    scheduledOnly: z.boolean(),
    when: PredicateSchema,
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
        if (!byId.has(effect.eventId)) {
          issues.push({ path: event.id, message: `Schedules unknown event "${effect.eventId}".` });
        } else targets.push(effect.eventId);
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
