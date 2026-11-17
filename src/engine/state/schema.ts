import { z } from 'zod';

/**
 * Authoritative world-state schema. Everything the simulation knows lives in one
 * serializable `World` object so that a snapshot restores the *entire* world (spec §5).
 *
 * Numeric conventions (determinism, spec §4):
 * - Stats, needs and skills are fixed-point integers in tenths: 0..1000 displays as 0..100.
 * - Traits and habits are integers 0..100.
 * - No floating-point values are stored anywhere in the world.
 */

export const WORLD_SCHEMA_VERSION = 1;

export const STAT_KEYS = [
  'health',
  'happiness',
  'intelligence',
  'energy',
  'stress',
  'socialSkill',
  'discipline',
  'reputation',
  'confidence',
  'creativity',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const NEED_KEYS = ['rest', 'nutrition', 'social', 'leisure'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];

export const SKILL_KEYS = ['reading', 'logic', 'fitness', 'music', 'art', 'socializing'] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export const TRAIT_KEYS = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export const HABIT_KEYS = ['exercise', 'reading', 'sleepRoutine', 'creativePractice'] as const;
export type HabitKey = (typeof HABIT_KEYS)[number];

export const GENDERS = ['female', 'male', 'nonbinary'] as const;
export type Gender = (typeof GENDERS)[number];

export const DIFFICULTIES = ['casual', 'realistic', 'challenging'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const WEALTH_TIERS = [
  'low',
  'lower-middle',
  'middle',
  'upper-middle',
  'wealthy',
  'very-wealthy',
  'royal',
] as const;
export type WealthTier = (typeof WEALTH_TIERS)[number];

export const SCENARIO_IDS = [
  'royal',
  'noble',
  'wealthy',
  'middle',
  'lowIncome',
  'immigrant',
  'singleParent',
  'adopted',
  'political',
  'businessHeir',
  'rural',
  'random',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];
/** Scenarios a world can actually have ("random" resolves to one of these). */
export type ConcreteScenarioId = Exclude<ScenarioId, 'random'>;

export const NOTIFICATION_CATEGORIES = ['life', 'event', 'health', 'family', 'system'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

const Id = z.string().min(1).max(80);
const Fixed = z.number().int().min(0).max(1000);
const Percent = z.number().int().min(0).max(100);
const Uint32 = z.number().int().min(0).max(0xffffffff);

export const YearMonthSchema = z
  .object({ year: z.number().int().min(1800).max(9999), month: z.number().int().min(1).max(12) })
  .strict();
export type YearMonth = z.infer<typeof YearMonthSchema>;

export const StatsSchema = z.record(z.enum(STAT_KEYS), Fixed);
export type Stats = z.infer<typeof StatsSchema>;
export const NeedsSchema = z.record(z.enum(NEED_KEYS), Fixed);
export type Needs = z.infer<typeof NeedsSchema>;
export const SkillsSchema = z.record(z.enum(SKILL_KEYS), Fixed);
export type Skills = z.infer<typeof SkillsSchema>;
export const TraitsSchema = z.record(z.enum(TRAIT_KEYS), Percent);
export type Traits = z.infer<typeof TraitsSchema>;
export const HabitsSchema = z.record(z.enum(HABIT_KEYS), Percent);
export type Habits = z.infer<typeof HabitsSchema>;

export const APPEARANCE_LIMITS = {
  skinTone: 10,
  hairColor: 8,
  hairStyle: 8,
  eyeColor: 6,
  faceShape: 3,
} as const;

export const AppearanceSchema = z
  .object({
    skinTone: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.skinTone - 1),
    hairColor: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.hairColor - 1),
    hairStyle: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.hairStyle - 1),
    eyeColor: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.eyeColor - 1),
    faceShape: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.faceShape - 1),
    freckles: z.boolean(),
  })
  .strict();
export type Appearance = z.infer<typeof AppearanceSchema>;

export const IdentitySchema = z
  .object({
    firstName: z.string().min(1).max(40),
    lastName: z.string().max(40),
    gender: z.enum(GENDERS),
    /** Hereditary or courtesy title where the scenario provides one (e.g. "Tengku"). */
    title: z.string().max(40).nullable(),
    nameOrder: z.enum(['given-first', 'family-first']),
  })
  .strict();
export type Identity = z.infer<typeof IdentitySchema>;

export const StatChangeSchema = z
  .object({
    tick: z.number().int().min(0),
    key: z.string().max(40),
    delta: z.number().int(),
    cause: z.string().max(80),
  })
  .strict();
export type StatChange = z.infer<typeof StatChangeSchema>;

export const CharacterSchema = z
  .object({
    id: Id,
    identity: IdentitySchema,
    birth: YearMonthSchema,
    death: YearMonthSchema.nullable(),
    deathCause: z.string().max(40).nullable(),
    locationId: Id,
    countryCode: z.string().length(2),
    householdId: Id,
    /** Simulation detail level (spec §4 NPCs); the player is always "close". */
    tier: z.enum(['close', 'relevant']),
    stats: StatsSchema,
    needs: NeedsSchema,
    skills: SkillsSchema,
    traits: TraitsSchema,
    habits: HabitsSchema,
    appearance: AppearanceSchema,
    flags: z.record(z.string(), z.boolean()),
    /** Most recent explicit stat changes with causes (bounded). */
    statLog: z.array(StatChangeSchema).max(60),
  })
  .strict();
export type Character = z.infer<typeof CharacterSchema>;

export const HouseholdSchema = z
  .object({
    id: Id,
    locationId: Id,
    memberIds: z.array(Id),
    wealth: z.enum(WEALTH_TIERS),
    scenario: z.enum(SCENARIO_IDS).exclude(['random']),
    originCountryCode: z.string().length(2).nullable(),
    flags: z
      .object({
        royal: z.boolean(),
        noble: z.boolean(),
        political: z.boolean(),
        businessHeir: z.boolean(),
        immigrant: z.boolean(),
        rural: z.boolean(),
        singleParent: z.boolean(),
        adopted: z.boolean(),
      })
      .strict(),
    /** Short description key of the family's situation, e.g. family trade. */
    familyTrade: z.string().max(40).nullable(),
  })
  .strict();
export type Household = z.infer<typeof HouseholdSchema>;

export const FamilyLinkSchema = z
  .object({
    id: Id,
    parentId: Id,
    childId: Id,
    type: z.enum(['biological', 'adoptive']),
  })
  .strict();
export type FamilyLink = z.infer<typeof FamilyLinkSchema>;

export const RelationshipSchema = z
  .object({
    id: Id,
    aId: Id,
    bId: Id,
    /** Role of B relative to A (e.g. "parent" means B is A's parent). */
    type: z.enum(['parent', 'child', 'sibling']),
    closeness: Percent,
    trust: Percent,
    respect: Percent,
    conflict: Percent,
    lastContactTick: z.number().int().min(0),
  })
  .strict();
export type Relationship = z.infer<typeof RelationshipSchema>;

export const EventInstanceSchema = z
  .object({
    id: Id,
    definitionId: Id,
    definitionVersion: z.number().int().min(1),
    tick: z.number().int().min(0),
    characterId: Id,
    status: z.enum(['pending', 'resolved']),
    choiceId: z.string().max(40).nullable(),
    /** Set when this instance was created by a delayed consequence. */
    sourceInstanceId: Id.nullable(),
  })
  .strict();
export type EventInstance = z.infer<typeof EventInstanceSchema>;

export const ScheduledConsequenceSchema = z
  .object({
    id: Id,
    sourceInstanceId: Id,
    eventId: Id,
    characterId: Id,
    dueTick: z.number().int().min(0),
  })
  .strict();
export type ScheduledConsequence = z.infer<typeof ScheduledConsequenceSchema>;

const ParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const NotificationSchema = z
  .object({
    id: Id,
    tick: z.number().int().min(0),
    category: z.enum(NOTIFICATION_CATEGORIES),
    messageKey: z.string().max(80),
    params: ParamsSchema,
    read: z.boolean(),
    /** In-game screen the notification leads to. */
    target: z.enum(['life', 'character', 'social', 'timeline', 'event']),
  })
  .strict();
export type Notification = z.infer<typeof NotificationSchema>;

export const BiographyEntrySchema = z
  .object({
    id: Id,
    tick: z.number().int().min(0),
    characterId: Id,
    category: z.enum(['life', 'event', 'health', 'family', 'activity', 'rules']),
    key: z.string().max(80),
    params: ParamsSchema,
  })
  .strict();
export type BiographyEntry = z.infer<typeof BiographyEntrySchema>;

export const RNG_STREAMS = ['creation', 'genetics', 'events', 'npc', 'mortality'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

export const RngStateSchema = z.tuple([Uint32, Uint32, Uint32, Uint32]);
export type RngStateTuple = z.infer<typeof RngStateSchema>;

export const WorldSchema = z
  .object({
    schemaVersion: z.literal(WORLD_SCHEMA_VERSION),
    id: Id,
    seed: z.string().min(1).max(64),
    contentVersion: z.string().max(40),
    /** Month index (year*12 + month-1) of the world's first month. */
    startIndex: z.number().int(),
    clock: YearMonthSchema,
    /** Months elapsed since the start; equals monthIndex(clock) - startIndex. */
    tick: z.number().int().min(0),
    rng: z.record(z.enum(RNG_STREAMS), RngStateSchema),
    nextId: z.number().int().min(1),
    rules: z.object({ difficulty: z.enum(DIFFICULTIES), easyMigration: z.boolean() }).strict(),
    ruleChanges: z.array(
      z
        .object({
          tick: z.number().int().min(0),
          rule: z.enum(['difficulty', 'easyMigration']),
          from: z.union([z.string(), z.boolean()]),
          to: z.union([z.string(), z.boolean()]),
        })
        .strict(),
    ),
    activeCharacterId: Id,
    lifeStatus: z.enum(['alive', 'ended']),
    characters: z.record(Id, CharacterSchema),
    households: z.record(Id, HouseholdSchema),
    familyLinks: z.record(Id, FamilyLinkSchema),
    relationships: z.record(Id, RelationshipSchema),
    events: z
      .object({
        instances: z.record(Id, EventInstanceSchema),
        lastFiredTick: z.record(Id, z.number().int().min(0)),
        firedCount: z.record(Id, z.number().int().min(0)),
        scheduled: z.array(ScheduledConsequenceSchema),
        pendingInstanceId: Id.nullable(),
      })
      .strict(),
    /** The active character's activity usage in the current month (anti-exploit, spec §4). */
    activity: z
      .object({
        tick: z.number().int().min(0),
        counts: z.record(Id, z.number().int().min(0)),
        hoursUsed: z.number().int().min(0),
      })
      .strict(),
    notifications: z.array(NotificationSchema),
    biography: z.array(BiographyEntrySchema),
    /** Recently applied command ids (bounded); prevents double application. */
    recentCommandIds: z.array(z.string().max(80)).max(512),
  })
  .strict();
export type World = z.infer<typeof WorldSchema>;
