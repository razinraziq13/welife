import { z } from 'zod';
import { OFFICE_LEVELS, RELIGIONS, VISA_ROUTES } from '../world/institutions';

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
 * and the calendar. Version 3 (Milestone 5) adds businesses, competitors, properties,
 * the property market, investment funds, exchange rates and house prices. Version 4
 * (Milestone 6) adds citizenship and residence, visa applications, health conditions,
 * legal cases, military service, political careers, royal duties and religion. Version 5
 * (Milestones 7-8) adds the family lineage, wills and estates, succession, social media,
 * achievements and the content packs enabled for this world.
 */

export const WORLD_SCHEMA_VERSION = 5;

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
  'business',
  'property',
  'world',
  'civic',
  'legacy',
  'media',
  'achievement',
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
  'business',
  'property',
  'world',
  'health',
  'politics',
  'military',
  'legal',
  'religion',
  'legacy',
  'media',
  'achievements',
  'biography',
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
  'business',
  'property',
  'world',
  'civic',
  'politics',
  'military',
  'legal',
  'religion',
  'legacy',
  'media',
  'achievement',
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

export const WORK_EFFORTS = ['coast', 'steady', 'hard'] as const;

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
  'investment',
  'property',
  'vehicle',
  'stake',
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

export const ACTING_FORMATS = ['film', 'tv'] as const;
export const ACTING_GENRES = [
  'drama',
  'comedy',
  'action',
  'thriller',
  'romance',
  'family',
] as const;
export const PROMINENCES = ['background', 'supporting', 'lead'] as const;
export const AUDITION_APPROACHES = ['restrained', 'energetic', 'comedic', 'character'] as const;
export type AuditionApproach = (typeof AUDITION_APPROACHES)[number];

/** What a production is, shared by casting listings, the current production and credits. */
const ProductionInfo = {
  title: z.string().min(1).max(60),
  format: z.enum(ACTING_FORMATS),
  genre: z.enum(ACTING_GENRES),
  studio: z.string().min(1).max(60),
  director: z.string().max(80),
  character: z.string().min(1).max(80),
  prominence: z.enum(PROMINENCES),
  /** Script quality, 0-100. */
  script: Percent,
  budget: z.enum(['indie', 'studio']),
};

export const CastingListingSchema = z
  .object({
    id: Id,
    ...ProductionInfo,
    /** A past director who asked for you (their NPC id), else a new director. */
    directorId: Id.nullable(),
    /** Filming months (TV: one season). */
    months: z.number().int().min(1).max(6),
    /** Film: the whole fee; TV: pay per month of filming. */
    payMinor: NonNegativeMinor,
    deadlineTick: Tick,
    status: z.enum(['open', 'offered', 'rejected']),
    feedback: z.string().max(60).nullable(),
    negotiated: z.boolean(),
  })
  .strict();

export const ProductionSchema = z
  .object({
    ...ProductionInfo,
    stage: z.enum(['rehearsal', 'filming', 'post', 'renewal']),
    monthsLeft: z.number().int().min(0).max(12),
    months: z.number().int().min(1).max(6),
    payMinor: NonNegativeMinor,
    earnedMinor: NonNegativeMinor,
    /** Preparation for the role, 0-100. */
    prep: Percent,
    /** Publicity done for the release, 0-100. */
    promo: Percent,
    season: z.number().int().min(1).max(30),
    castId: Id,
    directorId: Id,
    startTick: Tick,
  })
  .strict();

export const CreditSchema = z
  .object({
    ...ProductionInfo,
    startTick: Tick,
    endTick: Tick,
    seasons: z.number().int().min(1).max(30),
    earnedMinor: NonNegativeMinor,
    /** Critics' and audiences' verdicts, 0-100. */
    critics: Percent,
    audience: Percent,
    award: z.enum(['nominated', 'won']).nullable(),
    coStar: z.string().max(80),
  })
  .strict();

export const ActingSchema = z
  .object({
    /** How widely known you are, 0-1000 (industry reputation is `career.reputation`). */
    recognition: Fixed,
    /** How strong critics think your completed work is, 0-1000. */
    critics: Fixed,
    board: z.array(CastingListingSchema).max(8),
    production: ProductionSchema.nullable(),
    filmography: z.array(CreditSchema).max(80),
    agent: z
      .object({ id: Id, name: z.string().max(80), commissionPct: Percent, skill: Percent })
      .strict()
      .nullable(),
  })
  .strict();
export type ActingState = z.infer<typeof ActingSchema>;
export type CastingListing = z.infer<typeof CastingListingSchema>;
export type Production = z.infer<typeof ProductionSchema>;

export const MUSIC_GENRES = [
  'pop',
  'rock',
  'hiphop',
  'jazz',
  'electronic',
  'folk',
  'classical',
  'country',
  'rnb',
] as const;
export const SONG_MOODS = ['upbeat', 'melancholy', 'romantic', 'defiant', 'dreamy'] as const;
export const STUDIOS = ['home', 'independent', 'professional'] as const;
export const RELEASE_TYPES = ['single', 'ep', 'album'] as const;
export const VENUE_KINDS = ['cafe', 'club', 'festival', 'theatre', 'arena'] as const;
export const PROMO_LEVELS = ['none', 'small', 'big'] as const;

export const SongSchema = z
  .object({
    id: Id,
    title: z.string().min(1).max(60),
    genre: z.enum(MUSIC_GENRES),
    mood: z.enum(SONG_MOODS),
    /** Co-writer (an NPC) and their name as credited; null when written alone. */
    coWriterId: Id.nullable(),
    coWriter: z.string().max(80),
    /** The player's songwriting share in basis points; the co-writer has the rest. */
    shareBp: z.number().int().min(0).max(10_000),
    progress: Percent,
    quality: Percent,
    /** Recording quality once recorded, 0-100. */
    production: Percent,
    status: z.enum(['draft', 'recording', 'recorded', 'released']),
    studio: z.enum(STUDIOS).nullable(),
    createdTick: Tick,
  })
  .strict();

export const MusicReleaseSchema = z
  .object({
    id: Id,
    title: z.string().min(1).max(60),
    type: z.enum(RELEASE_TYPES),
    songIds: z.array(Id).min(1).max(8),
    /** The label that put it out (kept after the deal ends); null when independent. */
    label: z.string().max(60).nullable(),
    /** The artist's share of royalties after any label, percent. */
    artistPct: Percent,
    tick: Tick,
    appeal: Percent,
    critics: Percent,
    /** How much it is being listened to now, 0-100; decays month by month. */
    momentum: Percent,
    /** Best chart position (1-10); 0 if it never charted. */
    peakRank: z.number().int().min(0).max(10),
    grossMinor: NonNegativeMinor,
    paidMinor: NonNegativeMinor,
    award: z.enum(['nominated', 'won']).nullable(),
  })
  .strict();

export const VenueOfferSchema = z
  .object({
    id: Id,
    venue: z.string().min(1).max(60),
    kind: z.enum(VENUE_KINDS),
    capacity: z.number().int().min(1).max(100_000),
    ticketMinor: NonNegativeMinor,
    /** Sound, crew and travel, paid when you play. */
    costMinor: NonNegativeMinor,
    minSongs: z.number().int().min(1).max(12),
    minFans: z.number().int().min(0),
  })
  .strict();

export const LabelDealSchema = z
  .object({
    name: z.string().min(1).max(60),
    artistPct: Percent,
    advanceMinor: NonNegativeMinor,
    releasesOwed: z.number().int().min(0).max(5),
  })
  .strict();

export const MusicSchema = z
  .object({
    songs: z.array(SongSchema).max(60),
    releases: z.array(MusicReleaseSchema).max(60),
    fans: z.number().int().min(0).max(100_000_000),
    /** Wider public recognition and critics' view of your work, 0-1000. */
    recognition: Fixed,
    critics: Fixed,
    /** Readiness for live shows, 0-100. */
    prep: Percent,
    label: LabelDealSchema.extend({ unrecoupedMinor: NonNegativeMinor, endTick: Tick })
      .strict()
      .nullable(),
    labelOffer: LabelDealSchema.extend({ expiresTick: Tick, negotiated: z.boolean() })
      .strict()
      .nullable(),
    venues: z.array(VenueOfferSchema).max(5),
    /** Last month's chart, top 10. */
    chart: z
      .array(
        z
          .object({ title: z.string().max(60), artist: z.string().max(80), player: z.boolean() })
          .strict(),
      )
      .max(10),
    /** Simulated mode: routine writing, recording, releasing and shows run themselves. */
    autopilot: z.boolean(),
  })
  .strict();
export type MusicState = z.infer<typeof MusicSchema>;
export type Song = z.infer<typeof SongSchema>;
export type MusicRelease = z.infer<typeof MusicReleaseSchema>;

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
    /** The one-off retirement lump sum has been taken (optional: older saves lack it). */
    lumpSumTaken: z.boolean().optional(),
  })
  .strict();
export type CharacterFinance = z.infer<typeof CharacterFinanceSchema>;

export const RESIDENCE_STATUSES = ['citizen', 'permanent', 'visa'] as const;
export type ResidenceStatus = (typeof RESIDENCE_STATUSES)[number];
export const PARTICIPATION_LEVELS = ['none', 'occasional', 'regular', 'devout'] as const;
export type Participation = (typeof PARTICIPATION_LEVELS)[number];
const CountryCode = z.string().length(2);

/** Citizenship, residence, belief and custody (Milestone 6). */
export const CivicSchema = z
  .object({
    citizenships: z.array(CountryCode).min(1).max(6),
    /** Legal status in the country the person lives in. */
    residence: z
      .object({
        countryCode: CountryCode,
        status: z.enum(RESIDENCE_STATUSES),
        route: z.enum(VISA_ROUTES).nullable(),
        sinceTick: z.number().int().min(0),
        /** When a visa must be renewed (null for citizens and permanent residents). */
        expiresTick: z.number().int().min(0).nullable(),
      })
      .strict(),
    /** Months of legal residence per country (for permanent residence and naturalisation). */
    residedMonths: z.record(CountryCode, z.number().int().min(0)),
    /** Months as a permanent resident per country. */
    permanentMonths: z.record(CountryCode, z.number().int().min(0)),
    religion: z.enum(RELIGIONS),
    participation: z.enum(PARTICIPATION_LEVELS),
    /** In custody until this tick (non-graphic; most actions are unavailable meanwhile). */
    custodyUntilTick: z.number().int().min(0).nullable(),
    veteran: z.boolean(),
  })
  .strict();
export type Civic = z.infer<typeof CivicSchema>;

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
    civic: CivicSchema,
    /**
     * Working life beyond a single job (gameplay expansion): professional reputation (0-1000),
     * a specialism once earned, and progress towards one. Defaults keep older saves loading.
     */
    career: z
      .object({
        reputation: Fixed,
        specialty: z.string().max(40).nullable(),
        specialtyProgress: Percent,
        /** Community standing from volunteering, 0-1000 (optional: older saves lack it). */
        community: Fixed.optional(),
        /** Acting: screen credits earned and the contract in progress (optional). */
        credits: z.number().int().min(0).optional(),
        contract: z
          .object({
            kind: z.enum(['film', 'tv', 'single']),
            role: z.enum(['extra', 'supporting', 'lead']),
            /** TV pay or single royalties per month; film is paid up front, so 0. */
            monthlyMinor: NonNegativeMinor,
            monthsLeft: z.number().int().min(0).max(12),
          })
          .strict()
          .optional(),
        /** The acting career (decision E89): casting board, production, filmography. */
        acting: ActingSchema.optional(),
        /** The music career (decision E90): songs, releases, label, live shows. */
        music: MusicSchema.optional(),
      })
      .strict()
      .default({ reputation: 200, specialty: null, specialtyProgress: 0 }),
    /** Personal projects in progress (activity id -> percent complete). */
    projects: z.record(z.string().max(40), Percent).default({}),
  })
  .strict();
export type Character = z.infer<typeof CharacterSchema>;

export const DEFAULT_CAREER: Character['career'] = {
  reputation: 200,
  specialty: null,
  specialtyProgress: 0,
};

export const HouseholdFinanceSchema = z
  .object({
    checkingId: Id,
    savingsId: Id,
    lifestyle: z.enum(LIFESTYLES),
    housing: z.enum(['owned', 'rented']),
    homeSize: z.enum(HOME_SIZES),
    /** Monthly rent while renting (0 when owned). */
    rentMinor: NonNegativeMinor,
    /** The owned property the household lives in (its upkeep is charged there). */
    propertyId: Id.nullable(),
    /** Who manages the household's money (the player once they run their own home). */
    headId: Id,
  })
  .strict();

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
    /** A rival employer approached the player with this offer (no application was made). */
    headhunted: z.boolean().optional(),
    /** The player already asked their current employer to match this offer. */
    countered: z.boolean().optional(),
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
    /** Time at the current grade, separate from total time with the employer. */
    levelStartTick: Tick.optional(),
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
    product: z.enum(['personal', 'student', 'mortgage', 'business']),
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

export const VEHICLE_KINDS = ['car', 'aeroplane', 'helicopter'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

const VehicleSchema = z.strictObject({
  offerId: Id,
  kind: z.enum(VEHICLE_KINDS),
  name: z.string().min(1).max(50),
  yearsUsed: z.number().int().min(0).max(100),
  condition: z.number().int().min(1).max(100),
  purchasedTick: Tick,
  /** Price paid (optional: older saves); running costs scale with it. */
  priceMinor: NonNegativeMinor.optional(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

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
    /** Investment funds: money put in, less the cost of what was sold (optional: older saves). */
    costMinor: NonNegativeMinor.optional(),
    /** Vehicles are individual assets, kept in their purchase currency. */
    vehicle: VehicleSchema.optional(),
    /** A fixed-term government bond held to maturity; the balance is its face value. */
    bond: z
      .object({
        termMonths: z.number().int().min(12).max(120),
        couponBp: z.number().int().min(0).max(3000),
        maturityTick: Tick,
      })
      .strict()
      .optional(),
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

export const FUNDS = [
  'stocks',
  'technology',
  'consumer',
  'selara',
  'meranti',
  'bonds',
  'bitcoin',
] as const;
export type Fund = (typeof FUNDS)[number];
export const MARKET_HISTORY_LIMIT = 25;

const MarketPointSchema = z.strictObject({
  tick: Tick,
  indices: z.record(z.enum(FUNDS), z.number().int().min(500).max(100_000_000)),
});
export type MarketPoint = z.infer<typeof MarketPointSchema>;

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
    /** Currency value against its start level, basis points (simulated exchange rate, R5). */
    fxIndexBp: z.number().int().min(100).max(1_000_000),
    /** House prices against the start level, basis points. */
    housePriceBp: z.number().int().min(500).max(10_000_000),
    /** Bond fund index against the start level, basis points. */
    bondIndexBp: z.number().int().min(500).max(10_000_000),
    /** Monthly closes, beginning when this version first tracks the market. */
    marketHistory: z.array(MarketPointSchema).max(MARKET_HISTORY_LIMIT).optional(),
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

// ---------------------------------------------------------------------------------------
// Businesses, property and investments (spec §4 Business, §6 Business/BusinessBranch/Property)
// ---------------------------------------------------------------------------------------

/** Ownership share in basis points; all owners of one asset add up to 10000 (spec §6). */
export const OwnerShareSchema = z
  .object({
    ownerId: Id,
    sharesBp: z.number().int().min(1).max(10_000),
    /** The owner's ledger account holding the stake (null for owners not tracked in the ledger). */
    stakeAccountId: Id.nullable(),
  })
  .strict();
export type OwnerShare = z.infer<typeof OwnerShareSchema>;

export const StatementSchema = z
  .object({
    tick: Tick,
    unitsDemanded: z.number().int().min(0),
    unitsSold: z.number().int().min(0),
    revenue: Minor,
    cogs: Minor,
    wages: Minor,
    rent: Minor,
    marketing: Minor,
    other: Minor,
    operatingProfit: Minor,
    interest: Minor,
    tax: Minor,
    netProfit: Minor,
  })
  .strict();
export type Statement = z.infer<typeof StatementSchema>;

export const BranchSchema = z
  .object({
    id: Id,
    locationId: Id,
    staff: z.number().int().min(0).max(500),
    /** Monthly wage per member of staff, in the business's currency. */
    wageMinor: NonNegativeMinor,
    /** Price as a percentage of the local reference price. */
    pricePercent: z.number().int().min(50).max(250),
    /** Monthly premises rent, in the business's currency. */
    rentMinor: NonNegativeMinor,
    /** Goods kept in stock (goods businesses only). */
    inventory: z.number().int().min(0),
    /** Stock level restocked to each month. */
    stockTarget: z.number().int().min(0),
    openedTick: Tick,
    lastDemand: z.number().int().min(0),
    lastSold: z.number().int().min(0),
  })
  .strict();
export type Branch = z.infer<typeof BranchSchema>;

export const BusinessSchema = z
  .object({
    id: Id,
    name: z.string().min(1).max(60),
    typeId: z.string().max(40),
    countryCode: z.string().length(2),
    currency: z.string().length(3),
    foundedTick: Tick,
    status: z.enum(['active', 'sold', 'closed']),
    owners: z.array(OwnerShareSchema).min(1).max(10),
    cashAccountId: Id,
    quality: Fixed,
    brand: Fixed,
    marketingMinor: NonNegativeMinor,
    supplier: z.enum(['budget', 'standard', 'premium']),
    manager: z.enum(['owner', 'hired']),
    managerSkill: Fixed,
    branches: z.array(BranchSchema).max(20),
    statement: StatementSchema.nullable(),
    history: z
      .array(z.object({ tick: Tick, revenue: Minor, netProfit: Minor, cash: Minor }).strict())
      .max(160),
    /** Consecutive months the business could not pay its bills. */
    distressMonths: z.number().int().min(0),
    closedTick: Tick.nullable(),
    /** Extra products (Career Expansion), sold at the first outlet; optional for older saves. */
    products: z
      .array(
        z
          .object({
            id: Id,
            name: z.string().trim().min(1).max(40),
            pricePercent: z.number().int().min(50).max(250),
            supplier: z.enum(['budget', 'standard', 'premium']),
            marketingMinor: NonNegativeMinor,
            stockTarget: z.number().int().min(0).max(1_000_000),
            inventory: z.number().int().min(0),
            last: z
              .object({
                demanded: z.number().int().min(0),
                sold: z.number().int().min(0),
                revenue: NonNegativeMinor,
                cost: NonNegativeMinor,
                ads: NonNegativeMinor,
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    /** Client contracts (project firms: consultancy, software, contractor; decision E91). */
    contracts: z
      .object({
        offers: z
          .array(
            z
              .object({
                id: Id,
                client: z.string().min(1).max(60),
                brief: z.string().min(1).max(60),
                /** Staff the work needs and the months the client allows. */
                team: z.number().int().min(1).max(10),
                months: z.number().int().min(1).max(6),
                feeMinor: NonNegativeMinor,
                expiresTick: Tick,
                returning: z.boolean(),
              })
              .strict(),
          )
          .max(3),
        active: z
          .array(
            z
              .object({
                id: Id,
                client: z.string().min(1).max(60),
                brief: z.string().min(1).max(60),
                team: z.number().int().min(1).max(10),
                scope: z.enum(['lean', 'thorough']),
                /** Staff-months of work still to do. */
                workLeft: z.number().int().min(0).max(100),
                deadlineTick: Tick,
                feeMinor: NonNegativeMinor,
                paidMinor: NonNegativeMinor,
                quality: Fixed,
              })
              .strict(),
          )
          .max(4),
        delivered: z.number().int().min(0),
        late: z.number().int().min(0),
        cancelled: z.number().int().min(0),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Business = z.infer<typeof BusinessSchema>;

/** Background competitors (aggregate firms the player competes with and can acquire). */
export const CompetitorSchema = z
  .object({
    id: Id,
    name: z.string().max(60),
    typeId: z.string().max(40),
    locationId: Id,
    quality: Fixed,
    brand: Fixed,
    pricePercent: z.number().int().min(50).max(250),
    /** Relative size (number of outlets). */
    size: z.number().int().min(1).max(10),
    status: z.enum(['active', 'closed', 'acquired']),
    sinceTick: Tick,
  })
  .strict();
export type Competitor = z.infer<typeof CompetitorSchema>;

export const PROPERTY_KINDS = ['apartment', 'house', 'commercial'] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const PropertySchema = z
  .object({
    id: Id,
    locationId: Id,
    kind: z.enum(PROPERTY_KINDS),
    /** Current market value (revalued monthly; the owners' ledger follows it). */
    valueMinor: NonNegativeMinor,
    purchasePriceMinor: NonNegativeMinor,
    purchaseTick: Tick,
    owners: z.array(OwnerShareSchema).min(1).max(4),
    mortgageAccountId: Id.nullable(),
    condition: Fixed,
    use: z.enum(['home', 'rental', 'vacant']),
    /** Asking rent when letting. */
    rentMinor: NonNegativeMinor,
    tenant: z
      .object({
        name: z.string().max(80),
        sinceTick: Tick,
        leaseEndTick: Tick,
        rentMinor: NonNegativeMinor,
        missedPayments: z.number().int().min(0),
      })
      .strict()
      .nullable(),
    renovation: z
      .object({ level: z.enum(['light', 'major']), endTick: Tick })
      .strict()
      .nullable(),
    /** Value premium from renovations, basis points. */
    premiumBp: z.number().int().min(0).max(5000),
    /** Listed for sale since this tick. */
    listedTick: Tick.nullable(),
    status: z.enum(['owned', 'sold', 'repossessed']),
  })
  .strict();
export type Property = z.infer<typeof PropertySchema>;

export const ListingSchema = z
  .object({
    id: Id,
    locationId: Id,
    kind: z.enum(PROPERTY_KINDS),
    askingMinor: NonNegativeMinor,
    condition: Fixed,
    listedTick: Tick,
    expiresTick: Tick,
  })
  .strict();
export type Listing = z.infer<typeof ListingSchema>;

// ---------------------------------------------------------------------------------------
// Institutions (Milestone 6; spec §4 World, Politics, Law, military, religion, §6 records)
// ---------------------------------------------------------------------------------------

export const APPLICATION_ROUTES = [...VISA_ROUTES, 'permanent', 'citizenship'] as const;
export type ApplicationRoute = (typeof APPLICATION_ROUTES)[number];

export const VisaApplicationSchema = z
  .object({
    id: Id,
    characterId: Id,
    countryCode: CountryCode,
    route: z.enum(APPLICATION_ROUTES),
    status: z.enum(['pending', 'approved', 'refused', 'withdrawn', 'used', 'expired']),
    appliedTick: Tick,
    decisionTick: Tick,
    /** An approved visa must be used (by moving) before this tick. */
    useByTick: Tick.nullable(),
    /** Localisation key explaining a refusal. */
    reason: z.string().max(80).nullable(),
    feeMinor: NonNegativeMinor,
    /** Give up other citizenships if the new country requires it. */
    renounce: z.boolean(),
    /** Easy Migration was on when the application was made. */
    easy: z.boolean(),
  })
  .strict();
export type VisaApplication = z.infer<typeof VisaApplicationSchema>;

export const CONDITION_KINDS = [
  'flu',
  'injury',
  'backPain',
  'asthma',
  'hypertension',
  'diabetes',
  'depression',
  'heartDisease',
  'seriousIllness',
  'dental',
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const HealthConditionSchema = z
  .object({
    id: Id,
    characterId: Id,
    kind: z.enum(CONDITION_KINDS),
    severity: Fixed,
    diagnosedTick: Tick,
    status: z.enum(['untreated', 'waiting', 'treating', 'managed', 'resolved']),
    care: z.enum(['public', 'private']).nullable(),
    /** Public waiting list ends at this tick. */
    waitUntilTick: Tick.nullable(),
    treatmentEndTick: Tick.nullable(),
    resolvedTick: Tick.nullable(),
    /** The current treatment is the curing therapy or operation (optional: older saves). */
    procedure: z.literal(true).optional(),
  })
  .strict();
export type HealthCondition = z.infer<typeof HealthConditionSchema>;

export const CASE_KINDS = [
  'traffic',
  'civilClaim',
  'taxAudit',
  'minorOffence',
  'fraud',
  'immigration',
  'serviceEvasion',
] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export const CASE_OUTCOMES = [
  'dismissed',
  'acquitted',
  'settled',
  'won',
  'lost',
  'fine',
  'community',
  'probation',
  'custody',
] as const;
export type CaseOutcome = (typeof CASE_OUTCOMES)[number];

export const LegalCaseSchema = z
  .object({
    id: Id,
    characterId: Id,
    countryCode: CountryCode,
    kind: z.enum(CASE_KINDS),
    role: z.enum(['defendant', 'claimant']),
    /** How strong the case against the person is (or their claim, as claimant). */
    strength: Fixed,
    /** Sum in dispute or the base fine (local currency). */
    amountMinor: NonNegativeMinor,
    filedTick: Tick,
    hearingTick: Tick,
    lawyer: z.enum(['none', 'legalAid', 'private']),
    plea: z.enum(['undecided', 'guilty', 'notGuilty', 'settle']),
    status: z.enum(['open', 'closed']),
    outcome: z.enum(CASE_OUTCOMES).nullable(),
    sentenceMonths: z.number().int().min(0).max(240),
    closedTick: Tick.nullable(),
    convicted: z.boolean(),
    /** When a conviction is spent (no longer shows in most checks). */
    spentTick: Tick.nullable(),
  })
  .strict();
export type LegalCase = z.infer<typeof LegalCaseSchema>;

export const SERVICE_BRANCHES = ['army', 'navy', 'airForce'] as const;
export type ServiceBranch = (typeof SERVICE_BRANCHES)[number];

export const ServiceRecordSchema = z
  .object({
    id: Id,
    characterId: Id,
    countryCode: CountryCode,
    kind: z.enum(['conscript', 'volunteer', 'programme']),
    branch: z.enum(SERVICE_BRANCHES),
    track: z.enum(['enlisted', 'officer']),
    rank: z.number().int().min(0).max(6),
    status: z.enum(['called', 'deferred', 'serving', 'completed', 'exempt', 'discharged']),
    /** When a called-up person must report. */
    reportTick: Tick,
    startTick: Tick.nullable(),
    /** Planned end of service. */
    endTick: Tick.nullable(),
    monthsInRank: z.number().int().min(0),
    monthsServed: z.number().int().min(0),
    /** Career Expansion (optional: older saves lack them). */
    specialty: z.enum(['logistics', 'engineering', 'medical', 'administration']).optional(),
    posting: z.enum(['home', 'overseas']).optional(),
  })
  .strict();
export type ServiceRecord = z.infer<typeof ServiceRecordSchema>;

export const PoliticalCareerSchema = z
  .object({
    id: Id,
    characterId: Id,
    countryCode: CountryCode,
    partyId: z.string().max(40).nullable(),
    joinedTick: Tick.nullable(),
    status: z.enum(['none', 'candidate', 'office', 'seeking']),
    office: z.enum(OFFICE_LEVELS).nullable(),
    campaign: z
      .object({
        level: z.enum(OFFICE_LEVELS),
        electionTick: Tick,
        support: Fixed,
        spentMinor: NonNegativeMinor,
        actions: z.number().int().min(0),
      })
      .strict()
      .nullable(),
    termStartTick: Tick.nullable(),
    termEndTick: Tick.nullable(),
    /** Consecutive terms in the current office. */
    termsInOffice: z.number().int().min(0),
    approval: Fixed,
    history: z
      .array(
        z
          .object({
            tick: Tick,
            level: z.enum(OFFICE_LEVELS),
            result: z.enum(['won', 'lost', 'appointed', 'notAppointed', 'leftOffice']),
            sharePercent: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .max(40),
    policies: z
      .array(
        z.object({ tick: Tick, policyId: z.string().max(40), choice: z.string().max(40) }).strict(),
      )
      .max(60),
  })
  .strict();
export type PoliticalCareer = z.infer<typeof PoliticalCareerSchema>;

export const RoyalDutySchema = z
  .object({
    characterId: Id,
    kind: z.enum(['royal', 'noble']),
    approval: Fixed,
    /** Engagements in the current year (counted from yearStartTick). */
    engagements: z.number().int().min(0),
    yearStartTick: Tick,
    patronages: z.array(z.string().max(40)).max(5),
  })
  .strict();
export type RoyalDuty = z.infer<typeof RoyalDutySchema>;

// ---------------------------------------------------------------------------------------
// Legacy, media, achievements, content packs (Milestones 7-8; spec §4 Legacy, §3.16-3.20)
// ---------------------------------------------------------------------------------------

export const LineageEntrySchema = z
  .object({
    characterId: Id,
    /** 1 for the first life; children of generation n are generation n + 1. */
    generation: z.number().int().min(1).max(500),
    fromTick: Tick,
    toTick: Tick.nullable(),
    reason: z.enum(['start', 'heir', 'switch']),
    peakNetWorthMinor: Minor,
    currency: z.string().length(3),
  })
  .strict();

export const BeneficiarySchema = z
  .object({ characterId: Id, sharesBp: z.number().int().min(1).max(10_000) })
  .strict();

export const EstateSchema = z
  .object({
    id: Id,
    deceasedId: Id,
    tick: Tick,
    currency: z.string().length(3),
    grossMinor: Minor,
    debtsMinor: NonNegativeMinor,
    writtenOffMinor: NonNegativeMinor,
    taxMinor: NonNegativeMinor,
    byWill: z.boolean(),
    heirs: z.array(BeneficiarySchema.extend({ amountMinor: Minor })).max(12),
  })
  .strict();
export type Estate = z.infer<typeof EstateSchema>;

export const LegacySchema = z
  .object({
    generation: z.number().int().min(1).max(500),
    lineage: z.array(LineageEntrySchema).max(500),
    /** Each person's will (beneficiaries and shares); intestacy rules apply without one. */
    wills: z.record(Id, z.array(BeneficiarySchema).min(1).max(8)),
    estates: z.array(EstateSchema).max(200),
    /** Set while the player has died and an heir must be chosen. */
    succession: z
      .object({ deceasedId: Id, candidates: z.array(Id).min(1).max(30) })
      .strict()
      .nullable(),
    /** A royal or noble house: its head passes down the line of succession (separate from inheritance). */
    house: z
      .object({
        kind: z.enum(['royal', 'noble']),
        countryCode: z.string().length(2),
        headId: Id.nullable(),
        title: z.string().max(40).nullable(),
        heads: z.array(z.object({ characterId: Id, fromTick: Tick }).strict()).max(50),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();

export const MEDIA_STYLES = [
  'casual',
  'informative',
  'funny',
  'personal',
  'controversial',
] as const;
export type MediaStyle = (typeof MEDIA_STYLES)[number];

export const MediaProfileSchema = z
  .object({
    id: Id,
    characterId: Id,
    platformId: z.string().min(2).max(20),
    handle: z.string().min(2).max(30),
    niche: z.string().min(2).max(20),
    followers: z.number().int().min(0),
    /** Engagement rate, basis points. */
    engagementBp: z.number().int().min(0).max(3000),
    /** Creator reputation with audiences and brands. */
    trust: Fixed,
    posts: z.number().int().min(0),
    lastPostTick: Tick.nullable(),
    earningsMinor: NonNegativeMinor,
    sponsor: z
      .object({ brand: z.string().max(40), monthlyMinor: NonNegativeMinor, untilTick: Tick })
      .strict()
      .nullable(),
    /** A brand's offer waiting for an answer. */
    offer: z
      .object({
        brand: z.string().max(40),
        monthlyMinor: NonNegativeMinor,
        months: z.number().int().min(1).max(24),
        expiresTick: Tick,
      })
      .strict()
      .nullable(),
    closedTick: Tick.nullable(),
  })
  .strict();
export type MediaProfile = z.infer<typeof MediaProfileSchema>;

export const AchievementUnlockSchema = z
  .object({
    achievementId: z.string().max(60),
    characterId: Id,
    tick: Tick,
    generation: z.number().int().min(1).max(500),
  })
  .strict();

/**
 * A content pack enabled for this world. Its events are stored in the world, so snapshots,
 * rewinds and exports carry them and replays stay deterministic. Event definitions are
 * validated by the event schema when the pack is enabled (and when a save is loaded).
 */
export const PackRecordSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
    name: z.string().min(1).max(60),
    packVersion: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/),
    mode: z.enum(['player', 'developer']),
    author: z.string().max(60),
    /** Disabled packs stay so past events still resolve; their events no longer fire. */
    enabled: z.boolean(),
    enabledTick: Tick,
    events: z.array(z.record(z.string(), z.unknown())).max(200),
  })
  .strict();
export type PackRecord = z.infer<typeof PackRecordSchema>;

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
  'business',
  'property',
  'civics',
  'media',
] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

export const RngStateSchema = z.tuple([Uint32, Uint32, Uint32, Uint32]);

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
    /** "succession": the player has died and an heir is being chosen (spec §4 Legacy). */
    lifeStatus: z.enum(['alive', 'succession', 'ended']),
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
    businesses: z.record(Id, BusinessSchema),
    competitors: z.record(Id, CompetitorSchema),
    properties: z.record(Id, PropertySchema),
    propertyListings: z.record(Id, ListingSchema),
    civics: z
      .object({
        applications: z.record(Id, VisaApplicationSchema),
        conditions: z.record(Id, HealthConditionSchema),
        cases: z.record(Id, LegalCaseSchema),
        service: z.record(Id, ServiceRecordSchema),
        politics: z.record(Id, PoliticalCareerSchema),
        /** Keyed by character id. */
        royal: z.record(Id, RoyalDutySchema),
      })
      .strict(),
    legacy: LegacySchema,
    media: z
      .object({
        profiles: z.record(Id, MediaProfileSchema),
        /** Popularity of each niche, basis points (10000 = normal). */
        trends: z.record(z.string(), z.number().int().min(2000).max(30_000)),
      })
      .strict(),
    achievements: z.record(z.string(), AchievementUnlockSchema),
    contentPacks: z.array(PackRecordSchema).max(20),
    notifications: z.array(NotificationSchema),
    biography: z.array(BiographyEntrySchema),
    /** Recently applied command ids (bounded); prevents double application. */
    recentCommandIds: z.array(z.string().max(80)).max(512),
  })
  .strict();
export type World = z.infer<typeof WorldSchema>;
