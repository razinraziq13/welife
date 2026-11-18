import { z } from 'zod';

/**
 * Authoritative world-state schema. Everything the simulation knows lives in one
 * serializable `World` object so that a snapshot restores the *entire* world (spec §5).
 *
 * Numeric conventions (determinism, spec §4):
 * - Stats, needs and skills are fixed-point integers in tenths: 0..1000 displays as 0..100.
 * - Traits and habits are integers 0..100.
 * - Money is a bigint in currency minor units (spec §4 Finance); rates are basis points.
 * - No floating-point values are stored anywhere in the world.
 *
 * Version 2 (Milestones 3-4) adds NPC populations, memories, partnerships, education,
 * employment, the job market, the double-entry ledger, insurance, the country economy
 * and the calendar.
 */

export const WORLD_SCHEMA_VERSION = 2;

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

export const SKILL_KEYS = [
  'reading',
  'logic',
  'fitness',
  'music',
  'art',
  'socializing',
  'science',
  'technology',
  'business',
  'craft',
  'care',
  'leadership',
] as const;
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

/** Interests drive chemistry between people and the clubs they enjoy. */
export const INTEREST_KEYS = [
  'sports',
  'music',
  'art',
  'books',
  'games',
  'science',
  'technology',
  'nature',
  'cooking',
  'fashion',
  'travel',
  'film',
] as const;
export type InterestKey = (typeof INTEREST_KEYS)[number];

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

export const NOTIFICATION_CATEGORIES = [
  'life',
  'event',
  'health',
  'family',
  'social',
  'school',
  'work',
  'money',
  'system',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_TARGETS = [
  'life',
  'character',
  'social',
  'timeline',
  'event',
  'career',
  'finance',
  'calendar',
  'person',
  'family',
] as const;

export const BIOGRAPHY_CATEGORIES = [
  'life',
  'event',
  'health',
  'family',
  'activity',
  'rules',
  'social',
  'school',
  'work',
  'money',
] as const;

/** Relationship roles, always "what B is to A". Family roles come from family links. */
export const RELATION_TYPES = [
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'auntUncle',
  'nieceNephew',
  'cousin',
  'partner',
  'exPartner',
  'friend',
  'classmate',
  'teacher',
  'colleague',
  'manager',
  'neighbour',
  'acquaintance',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const EDUCATION_STAGES = [
  'preschool',
  'primary',
  'lowerSecondary',
  'upperSecondary',
  'tertiary',
] as const;
export type EducationStage = (typeof EDUCATION_STAGES)[number];

export const STUDY_EFFORTS = ['relaxed', 'steady', 'focused'] as const;
export type StudyEffort = (typeof STUDY_EFFORTS)[number];

export const WORK_EFFORTS = ['coast', 'steady', 'hard'] as const;
export type WorkEffort = (typeof WORK_EFFORTS)[number];

export const CONTRACT_TYPES = [
  'permanent',
  'fixedTerm',
  'partTime',
  'casual',
  'internship',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const LIFESTYLES = ['frugal', 'moderate', 'comfortable', 'lavish'] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];

export const HOME_SIZES = ['room', 'apartment', 'house'] as const;
export type HomeSize = (typeof HOME_SIZES)[number];

/** Debit-normal account types (assets and expenses); the rest are credit-normal. */
export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'retirement',
  'expense',
  'loan',
  'arrears',
  'income',
  'equity',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const Id = z.string().min(1).max(80);
const Fixed = z.number().int().min(0).max(1000);
const Percent = z.number().int().min(0).max(100);
const Uint32 = z.number().int().min(0).max(0xffffffff);
const Tick = z.number().int().min(0);
const Minor = z.bigint();
const NonNegativeMinor = z.bigint().min(0n);
const Params = z.record(z.string(), z.union([z.string(), z.number()]));

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

const limit = (max: number) =>
  z
    .number()
    .int()
    .min(0)
    .max(max - 1);

export const AppearanceSchema = z
  .object({
    skinTone: limit(APPEARANCE_LIMITS.skinTone),
    hairColor: limit(APPEARANCE_LIMITS.hairColor),
    hairStyle: limit(APPEARANCE_LIMITS.hairStyle),
    eyeColor: limit(APPEARANCE_LIMITS.eyeColor),
    faceShape: limit(APPEARANCE_LIMITS.faceShape),
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
    tick: Tick,
    key: z.string().max(40),
    delta: z.number().int(),
    cause: z.string().max(80),
  })
  .strict();
export type StatChange = z.infer<typeof StatChangeSchema>;

// ---------------------------------------------------------------------------------------
// Education (spec §4 Education/career, §6 EducationRecord)
// ---------------------------------------------------------------------------------------

export const EnrollmentSchema = z
  .object({
    id: Id,
    stage: z.enum(EDUCATION_STAGES),
    institution: z.string().max(80),
    kind: z.enum(['public', 'private']),
    /** Tertiary programme (null for school stages). */
    programId: z.string().max(40).nullable(),
    level: z.enum(['school', 'diploma', 'bachelor', 'master']),
    startTick: Tick,
    /** School years completed in this stage. */
    yearsCompleted: z.number().int().min(0).max(12),
    /** Total years of this stage. */
    years: z.number().int().min(1).max(12),
    /** Current grade average (fixed-point tenths). */
    grade: Fixed,
    scholarshipPercent: Percent,
  })
  .strict();
export type Enrollment = z.infer<typeof EnrollmentSchema>;

export const EducationRecordSchema = EnrollmentSchema.extend({
  endTick: Tick,
  status: z.enum(['completed', 'left']),
  examScore: Fixed.nullable(),
}).strict();
export type EducationRecord = z.infer<typeof EducationRecordSchema>;

export const AwardSchema = z
  .object({ id: Id, key: z.string().max(60), tick: Tick, params: Params })
  .strict();
export type Award = z.infer<typeof AwardSchema>;

export const StudyApplicationSchema = z
  .object({
    id: Id,
    programId: z.string().max(40),
    level: z.enum(['diploma', 'bachelor', 'master']),
    tick: Tick,
    decisionTick: Tick,
    status: z.enum(['pending', 'accepted', 'rejected', 'declined', 'enrolled', 'expired']),
    scholarshipPercent: Percent,
    /** Admission score once decided (fixed-point tenths). */
    score: Fixed.nullable(),
  })
  .strict();
export type StudyApplication = z.infer<typeof StudyApplicationSchema>;

export const EducationStateSchema = z
  .object({
    current: EnrollmentSchema.nullable(),
    history: z.array(EducationRecordSchema).max(16),
    effort: z.enum(STUDY_EFFORTS),
    clubs: z.array(z.string().max(40)).max(3),
    /** Earned credentials, e.g. "upperSecondary", "bachelor:computing". */
    qualifications: z.array(z.string().max(60)).max(24),
    awards: z.array(AwardSchema).max(40),
    applications: z.array(StudyApplicationSchema).max(24),
    /** Report cards (grade at each report). */
    reports: z.array(z.object({ tick: Tick, grade: Fixed }).strict()).max(48),
  })
  .strict();
export type EducationState = z.infer<typeof EducationStateSchema>;

// ---------------------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------------------

export const PartnershipSchema = z
  .object({
    partnerId: Id,
    status: z.enum(['dating', 'engaged', 'married']),
    since: Tick,
    /** Trying for a child (non-explicit family planning, adults only). */
    planningFamily: z.boolean(),
  })
  .strict();
export type Partnership = z.infer<typeof PartnershipSchema>;

export const CharacterFinanceSchema = z
  .object({
    checkingId: Id.nullable(),
    savingsId: Id.nullable(),
    retirementId: Id.nullable(),
    /** Credit rating 0..1000 (shown as 0..100). */
    creditScore: Fixed,
    /** Voluntary retirement contribution, basis points of gross salary. */
    pensionBp: z.number().int().min(0).max(3000),
    retired: z.boolean(),
    /** Months with earnings-related pension contributions. */
    contributionMonths: z.number().int().min(0),
    /** Sum of monthly gross earnings that counted towards a state pension. */
    pensionableEarnings: NonNegativeMinor,
    taxYear: z
      .object({
        startTick: Tick,
        gross: NonNegativeMinor,
        withheld: NonNegativeMinor,
        social: NonNegativeMinor,
      })
      .strict(),
    /** Months since the last missed payment (for credit). */
    cleanMonths: z.number().int().min(0),
    /** Unemployment benefit months remaining and amount. */
    benefitMonths: z.number().int().min(0).max(60),
    benefitMinor: NonNegativeMinor,
  })
  .strict();
export type CharacterFinance = z.infer<typeof CharacterFinanceSchema>;

export const TIERS = ['close', 'relevant', 'archived'] as const;
export type Tier = (typeof TIERS)[number];

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
    /**
     * Simulation detail level (spec §4 NPCs): close NPCs are simulated monthly in detail,
     * relevant NPCs yearly in simplified form, archived ones (dead, moved away, dormant)
     * not at all. The player is always "close".
     */
    tier: z.enum(TIERS),
    stats: StatsSchema,
    needs: NeedsSchema,
    skills: SkillsSchema,
    traits: TraitsSchema,
    habits: HabitsSchema,
    interests: z.array(z.enum(INTEREST_KEYS)).max(3),
    appearance: AppearanceSchema,
    flags: z.record(z.string(), z.boolean()),
    partnership: PartnershipSchema.nullable(),
    education: EducationStateSchema,
    employmentId: Id.nullable(),
    /** Present for people whose money is tracked in the ledger. */
    finance: CharacterFinanceSchema.nullable(),
    /** Most recent explicit stat changes with causes (bounded). */
    statLog: z.array(StatChangeSchema).max(60),
  })
  .strict();
export type Character = z.infer<typeof CharacterSchema>;

export const HouseholdFinanceSchema = z
  .object({
    checkingId: Id,
    savingsId: Id,
    lifestyle: z.enum(LIFESTYLES),
    housing: z.enum(['owned', 'rented']),
    homeSize: z.enum(HOME_SIZES),
    /** Monthly rent while renting (0 when owned). */
    rentMinor: NonNegativeMinor,
    /** Who manages the household's money (the player once they run their own home). */
    headId: Id,
  })
  .strict();
export type HouseholdFinance = z.infer<typeof HouseholdFinanceSchema>;

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
    /** Ledger-tracked households (the player's and the player's parents'); null otherwise. */
    finance: HouseholdFinanceSchema.nullable(),
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
    type: z.enum(RELATION_TYPES),
    closeness: Percent,
    trust: Percent,
    respect: Percent,
    conflict: Percent,
    /** Compatibility of personalities and interests, fixed when the two meet (spec §4). */
    chemistry: Percent,
    /** Shared moments (bounded counter). */
    history: z.number().int().min(0).max(1000),
    since: Tick,
    lastContactTick: Tick,
  })
  .strict();
export type Relationship = z.infer<typeof RelationshipSchema>;

/** Durable NPC (and player) memories (spec §4 NPCs, §6 NPCMemory). */
export const MemorySchema = z
  .object({
    id: Id,
    ownerId: Id,
    subjectIds: z.array(Id).min(1).max(4),
    key: z.string().regex(/^[a-z][a-zA-Z0-9-]{1,39}$/),
    /** Event instance or interaction that created it. */
    source: z.string().max(80),
    tick: Tick,
    valence: z.number().int().min(-100).max(100),
    salience: Percent,
    decay: z.enum(['fast', 'slow', 'permanent']),
  })
  .strict();
export type Memory = z.infer<typeof MemorySchema>;

// ---------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------

export const EventInstanceSchema = z
  .object({
    id: Id,
    definitionId: Id,
    definitionVersion: z.number().int().min(1),
    tick: Tick,
    characterId: Id,
    status: z.enum(['pending', 'resolved']),
    choiceId: z.string().max(40).nullable(),
    /** Set when this instance was created by a delayed consequence. */
    sourceInstanceId: Id.nullable(),
    /** The other person the event is about, if any. */
    subjectId: Id.nullable(),
    /** Engine-provided details (e.g. the job application an interview belongs to). */
    context: Params,
  })
  .strict();
export type EventInstance = z.infer<typeof EventInstanceSchema>;

export const ScheduledConsequenceSchema = z
  .object({
    id: Id,
    sourceInstanceId: Id,
    eventId: Id,
    characterId: Id,
    dueTick: Tick,
    subjectId: Id.nullable(),
    context: Params,
  })
  .strict();
export type ScheduledConsequence = z.infer<typeof ScheduledConsequenceSchema>;

export const NotificationSchema = z
  .object({
    id: Id,
    tick: Tick,
    category: z.enum(NOTIFICATION_CATEGORIES),
    messageKey: z.string().max(80),
    params: Params,
    read: z.boolean(),
    /** In-game screen the notification leads to. */
    target: z.enum(NOTIFICATION_TARGETS),
    /** Entity the notification is about (e.g. a person), when it has one. */
    targetId: Id.nullable(),
  })
  .strict();
export type Notification = z.infer<typeof NotificationSchema>;

export const BiographyEntrySchema = z
  .object({
    id: Id,
    tick: Tick,
    characterId: Id,
    category: z.enum(BIOGRAPHY_CATEGORIES),
    key: z.string().max(80),
    params: Params,
  })
  .strict();
export type BiographyEntry = z.infer<typeof BiographyEntrySchema>;

// ---------------------------------------------------------------------------------------
// Work (spec §4 Education/career, §6 EmploymentRecord)
// ---------------------------------------------------------------------------------------

/** The terms of a job, shared by postings, applications and employment. */
export const JobTermsSchema = z
  .object({
    occupationId: z.string().max(40),
    level: z.number().int().min(0).max(4),
    employer: z.string().max(80),
    industryId: z.string().max(40),
    contract: z.enum(CONTRACT_TYPES),
    /** Monthly working hours. */
    hours: z.number().int().min(10).max(240),
    salaryMinMinor: NonNegativeMinor,
    salaryMaxMinor: NonNegativeMinor,
    locationId: Id,
  })
  .strict();
export type JobTerms = z.infer<typeof JobTermsSchema>;

export const PostingSchema = z
  .object({
    id: Id,
    terms: JobTermsSchema,
    openings: z.number().int().min(1).max(20),
    /** Other applicants competing for the role. */
    applicants: z.number().int().min(0).max(500),
    postedTick: Tick,
    expiresTick: Tick,
  })
  .strict();
export type Posting = z.infer<typeof PostingSchema>;

export const JobApplicationSchema = z
  .object({
    id: Id,
    postingId: Id,
    characterId: Id,
    terms: JobTermsSchema,
    applicants: z.number().int().min(0).max(500),
    tick: Tick,
    status: z.enum([
      'applied',
      'interview',
      'offered',
      'hired',
      'rejected',
      'declined',
      'withdrawn',
      'expired',
    ]),
    interviewTick: Tick.nullable(),
    /** Interview preparation, 0..100. */
    preparation: Percent,
    /** Someone who put in a good word (butterfly effect: helps, never guarantees). */
    referrerId: Id.nullable(),
    score: Fixed.nullable(),
    offerSalaryMinor: NonNegativeMinor.nullable(),
    offerExpiresTick: Tick.nullable(),
    negotiated: z.boolean(),
  })
  .strict();
export type JobApplication = z.infer<typeof JobApplicationSchema>;

export const EmploymentSchema = z
  .object({
    id: Id,
    characterId: Id,
    terms: JobTermsSchema,
    title: z.string().max(80),
    salaryMinor: NonNegativeMinor,
    performance: Fixed,
    managerId: Id.nullable(),
    startTick: Tick,
    endTick: Tick.nullable(),
    status: z.enum(['active', 'ended']),
    endReason: z
      .enum([
        'quit',
        'laidOff',
        'dismissed',
        'retired',
        'contractEnded',
        'died',
        'promoted',
        'moved',
      ])
      .nullable(),
    lastReviewTick: Tick,
    warnings: z.number().int().min(0).max(3),
    effort: z.enum(WORK_EFFORTS),
    raiseRequestedTick: Tick.nullable(),
  })
  .strict();
export type Employment = z.infer<typeof EmploymentSchema>;

// ---------------------------------------------------------------------------------------
// Money (spec §4 Finance, §6 FinancialAccount / LedgerTransaction / LedgerEntry / Loan)
// ---------------------------------------------------------------------------------------

export const LoanTermsSchema = z
  .object({
    product: z.enum(['personal', 'student']),
    /** Annual interest, basis points. */
    rateBp: z.number().int().min(0).max(10_000),
    termMonths: z.number().int().min(1).max(600),
    paymentMinor: NonNegativeMinor,
    principalMinor: NonNegativeMinor,
    /** Repayments start at this tick (student loans wait until study ends). */
    firstPaymentTick: Tick,
    missedPayments: z.number().int().min(0),
  })
  .strict();
export type LoanTerms = z.infer<typeof LoanTermsSchema>;

export const AccountSchema = z
  .object({
    id: Id,
    /** Character or household id. */
    ownerId: Id,
    type: z.enum(ACCOUNT_TYPES),
    /** Category for income/expense accounts (e.g. "salary", "rent"). */
    category: z.string().max(40),
    currency: z.string().length(3),
    /** Natural balance: positive on its normal side (debit or credit). */
    balance: Minor,
    /** Annual interest paid on savings, basis points. */
    rateBp: z.number().int().min(0).max(10_000),
    openedTick: Tick,
    closedTick: Tick.nullable(),
    loan: LoanTermsSchema.nullable(),
  })
  .strict();
export type Account = z.infer<typeof AccountSchema>;

export const LedgerEntrySchema = z
  .object({ accountId: Id, debit: NonNegativeMinor, credit: NonNegativeMinor })
  .strict();
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerTransactionSchema = z
  .object({
    id: Id,
    tick: Tick,
    /** Description key, e.g. "tx.salary". */
    kind: z.string().max(60),
    params: Params,
    /** Event instance or command that caused it. */
    source: z.string().max(80).nullable(),
    entries: z.array(LedgerEntrySchema).min(2).max(24),
  })
  .strict();
export type LedgerTransaction = z.infer<typeof LedgerTransactionSchema>;

export const MonthSummarySchema = z
  .object({ tick: Tick, income: NonNegativeMinor, expenses: NonNegativeMinor, netWorth: Minor })
  .strict();
export type MonthSummary = z.infer<typeof MonthSummarySchema>;

export const LedgerSchema = z
  .object({
    accounts: z.record(Id, AccountSchema),
    /** Transactions by month (key = tick); months older than the retention window are dropped. */
    journal: z.record(z.string().regex(/^\d+$/), z.array(LedgerTransactionSchema)),
    /** Monthly totals per owner (append-only, bounded). */
    history: z.record(Id, z.array(MonthSummarySchema)),
  })
  .strict();
export type Ledger = z.infer<typeof LedgerSchema>;

export const PolicySchema = z
  .object({
    id: Id,
    holderId: Id,
    type: z.enum(['health', 'life']),
    premiumMinor: NonNegativeMinor,
    coverageMinor: NonNegativeMinor,
    startTick: Tick,
    status: z.enum(['active', 'cancelled', 'lapsed', 'paidOut']),
  })
  .strict();
export type Policy = z.infer<typeof PolicySchema>;

/** Aggregate background economy per country (spec §4: simulated after the start date). */
export const EconomySchema = z
  .object({
    /** Price level, basis points of the start level (10000 = start). */
    priceIndexBp: z.number().int().min(1000).max(10_000_000),
    wageIndexBp: z.number().int().min(1000).max(10_000_000),
    unemploymentBp: z.number().int().min(100).max(4000),
    policyRateBp: z.number().int().min(0).max(3000),
    /** Retirement-fund market index, basis points of the start level. */
    marketIndexBp: z.number().int().min(500).max(100_000_000),
    /** Business cycle position, -100 (recession) .. 100 (boom). */
    cycle: z.number().int().min(-100).max(100),
    /** Inflation over the last 12 months, basis points. */
    inflationBp: z.number().int().min(-2000).max(5000),
    /** Price index 12 months ago (for the inflation figure). */
    priceIndexYearAgoBp: z.number().int().min(1000).max(10_000_000),
  })
  .strict();
export type Economy = z.infer<typeof EconomySchema>;

// ---------------------------------------------------------------------------------------
// Calendar and family plans (spec §3.6)
// ---------------------------------------------------------------------------------------

export const RecurringPlanSchema = z
  .object({
    id: Id,
    activityId: z.string().max(40),
    timesPerMonth: z.number().int().min(1).max(4),
    createdTick: Tick,
  })
  .strict();
export type RecurringPlan = z.infer<typeof RecurringPlanSchema>;

export const CalendarItemSchema = z
  .object({
    id: Id,
    kind: z.enum(['vacation', 'checkup', 'wedding']),
    option: z.string().max(40),
    tick: Tick,
    costMinor: NonNegativeMinor,
    hours: z.number().int().min(0).max(200),
    status: z.enum(['scheduled', 'done', 'cancelled', 'missed']),
    /** Person involved (e.g. the partner for a wedding). */
    withId: Id.nullable(),
  })
  .strict();
export type CalendarItem = z.infer<typeof CalendarItemSchema>;

export const ExpectingSchema = z
  .object({
    id: Id,
    kind: z.enum(['birth', 'adoption']),
    parentIds: z.array(Id).min(1).max(2),
    householdId: Id,
    dueTick: Tick,
  })
  .strict();
export type Expecting = z.infer<typeof ExpectingSchema>;

export const RNG_STREAMS = [
  'creation',
  'genetics',
  'events',
  'npc',
  'mortality',
  'social',
  'school',
  'career',
  'economy',
] as const;
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
    tick: Tick,
    rng: z.record(z.enum(RNG_STREAMS), RngStateSchema),
    nextId: z.number().int().min(1),
    rules: z.object({ difficulty: z.enum(DIFFICULTIES), easyMigration: z.boolean() }).strict(),
    ruleChanges: z.array(
      z
        .object({
          tick: Tick,
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
    memories: z.record(Id, MemorySchema),
    events: z
      .object({
        instances: z.record(Id, EventInstanceSchema),
        lastFiredTick: z.record(Id, Tick),
        firedCount: z.record(Id, Tick),
        scheduled: z.array(ScheduledConsequenceSchema),
        pendingInstanceId: Id.nullable(),
      })
      .strict(),
    /** The active character's activity usage in the current month (anti-exploit, spec §4). */
    activity: z
      .object({
        tick: Tick,
        counts: z.record(z.string().max(120), Tick),
        hoursUsed: Tick,
      })
      .strict(),
    employment: z.record(Id, EmploymentSchema),
    jobs: z
      .object({
        postings: z.record(Id, PostingSchema),
        applications: z.record(Id, JobApplicationSchema),
        refreshedTick: Tick,
      })
      .strict(),
    ledger: LedgerSchema,
    insurance: z.record(Id, PolicySchema),
    economy: z.record(z.string().length(2), EconomySchema),
    calendar: z
      .object({
        plans: z.array(RecurringPlanSchema).max(10),
        items: z.array(CalendarItemSchema).max(60),
      })
      .strict(),
    expecting: z.array(ExpectingSchema).max(10),
    notifications: z.array(NotificationSchema),
    biography: z.array(BiographyEntrySchema),
    /** Recently applied command ids (bounded); prevents double application. */
    recentCommandIds: z.array(z.string().max(80)).max(512),
  })
  .strict();
export type World = z.infer<typeof WorldSchema>;
