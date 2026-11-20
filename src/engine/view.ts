import { ageOf, monthsUntilBirthday, type Age } from './core/clock';
import { sortedValues } from './core/data';
import { applyPercent } from './core/money';
import { activeCharacter, isAlive } from './core/world';
import { listActivities, type ActivityAvailability } from './activities/activities';
import {
  CHECKUP_COST_PERCENT,
  VACATIONS,
  plannedHours,
  upcoming,
  type UpcomingEntry,
} from './calendar/calendar';
import { timeBudgetFor, type TimeLine } from './calendar/time';
import {
  CREATIVE_PATHS,
  JOB_MESSAGES,
  creativePathBlock,
  type CreativePath,
  counterOfferChance,
  experienceMonths,
  jobEligibility,
  requiredIndustryExperience,
  type JobRejection,
} from './career/jobs';
import { findOccupation, getOccupation, industryName, jobTitle } from './career/occupations';
import { displayName } from './characters/names';
import { lifeStage, type LifeStage } from './characters/stats';
import { getEventIn } from './content/packs';
import type { EventDefinition, Predicate } from './events/schema';
import { medianWage } from './economy/economy';
import {
  DEFAULT_LIFESTYLE,
  FINANCE_MESSAGES,
  LUMP_SUM_AGE,
  LUMP_SUM_PERCENT,
  lumpSumAmount,
  lumpSumBlock,
  retirementDraw,
  debtLimitPercent,
  educationFees,
  insurancePremium,
  loanPayments,
  rateFor,
  livingCosts,
  monthlyNetIncome,
  rentFor,
  statePension,
} from './economy/finance';
import { assetsOf, liabilitiesOf, monthTotals } from './economy/ledger';
import { convertCurrency, currencyCountry, netWorthIn } from './economy/fx';
import { CLUBS, PROGRAMS, findProgram, type ProgramLevel } from './education/catalog';
import {
  applicationEligibility,
  clubEligibility,
  leavingAge,
  stageName,
  type EducationRejection,
} from './education/school';
import { choiceAvailability, textParams } from './events/runtime';
import { projectHub, type HubView } from './activities/hub';
import {
  WORK_ACTIONS,
  WORK_ACTION_IDS,
  WORK_ACTION_MESSAGES,
  actingRole,
  careerTrack,
  jobSatisfaction,
  workActionBlock,
  type CareerTrack,
  type Satisfaction,
  type WorkActionId,
} from './career/workActions';
import { projectActing } from './career/acting';
import { ADULT_AGE, DATE_CLOSENESS, familyHomeFor } from './social/family';
import { datingProfileTraits } from './social/datingPreferences';
import {
  INTERACTIONS,
  INTERACTION_BLOCK_MESSAGES,
  INTERACTION_IDS,
  datingAppStatus,
  interactionBlock,
  isRomanticProspectBase,
  type InteractionId,
} from './social/interactions';
import { memoriesAbout } from './social/memories';
import { childrenOf, kinship, parentsOf, siblingsOf } from './social/relationships';
import { getCountry, getLocation } from './world/countries';
import { getRules, RULES_SOURCE } from './world/rules';
import { projectEnterprise, type EnterpriseView } from './viewEnterprise';
import { projectCivic, type CivicView } from './viewCivic';
import {
  projectAchievements,
  projectLegacy,
  projectMedia,
  projectPacks,
  type AchievementsView,
  type LegacyView,
  type MediaView,
  type PackSummary,
} from './viewLegacy';
import type { SimState } from './core/commands';
import type {
  Account,
  Employment,
  Appearance,
  Award,
  BiographyEntry,
  Character,
  EducationRecord,
  Habits,
  Household,
  Identity,
  MonthSummary,
  Needs,
  Notification,
  Partnership,
  RecurringPlan,
  RelationType,
  Skills,
  StatChange,
  Stats,
  StudyApplication,
  World,
  YearMonth,
} from './state/schema';

/**
 * Read-only projection of the simulation for the UI. The UI renders this; it never sees
 * or mutates the authoritative world directly.
 */

export interface PersonView {
  id: string;
  identity: Identity;
  displayName: string;
  age: Age;
  stage: LifeStage;
  alive: boolean;
  appearance: Appearance;
  /** Relationship to the player (family role first), from the player's side. */
  relation: RelationType | null;
  closeness: number | null;
  birth: YearMonth;
  death: YearMonth | null;
}

export interface PersonSummary extends PersonView {
  trust: number;
  respect: number;
  conflict: number;
  chemistry: number;
  lastContactTick: number;
  isPartner: boolean;
  sameHousehold: boolean;
  tier: Character['tier'];
}

export interface PendingEventView {
  instanceId: string;
  definitionId: string;
  /** The event text (built-in or from a content pack). */
  text: EventDefinition['text']['en'];
  /** Event category, for its icon. */
  category: EventDefinition['category'];
  /** In-game month the decision belongs to (the month being advanced into). */
  clock: YearMonth;
  /** For a closed choice, `unmet` is the condition that keeps it closed (null when open). */
  choices: { id: string; available: boolean; unmet: Predicate | null }[];
  /** Values for {subject} and context placeholders in the event text. */
  params: Record<string, string | number>;
}

export interface CurrencyView {
  code: string;
  exponent: number;
  symbol: string;
}

export interface EducationView {
  current: {
    stage: string;
    stageName: string;
    institution: string;
    kind: 'public' | 'private';
    programId: string | null;
    programName: string | null;
    level: string;
    yearsCompleted: number;
    years: number;
    grade: number;
    scholarshipPercent: number;
  } | null;
  effort: Character['education']['effort'];
  history: (EducationRecord & { stageName: string; programName: string | null })[];
  qualifications: string[];
  awards: Award[];
  reports: { tick: number; grade: number }[];
  clubs: {
    id: string;
    name: string;
    hours: number;
    feeMinor: bigint;
    competition: string | null;
    member: boolean;
    block: EducationRejection | null;
  }[];
  applications: (StudyApplication & { programName: string })[];
  programs: {
    id: string;
    name: string;
    levels: { level: ProgramLevel; block: EducationRejection | null }[];
  }[];
  canApply: boolean;
  leavingAge: number;
  canLeave: boolean;
  schoolYearStartMonth: number;
  fees: { school: bigint; tuition: bigint; clubs: bigint };
  studentLoans: boolean;
  hasStudentLoan: boolean;
}

export interface JobView {
  id: string;
  title: string;
  occupationId: string;
  employer: string;
  industry: string;
  contract: string;
  hours: number;
  salaryMinor: bigint;
  performance: number;
  managerId: string | null;
  managerName: string | null;
  startTick: number;
  effort: string;
  nextReviewTick: number;
  raiseAvailableTick: number;
  warnings: number;
  level: number;
}

export interface CareerView {
  /** The acting career: casting board, production and filmography (E89). */
  screen: ReturnType<typeof projectActing>;
  track: CareerTrack | null;
  /** Performing track: screen credits, the role auditions now offer, the current production. */
  acting: {
    /** Musician (gigs and releases) rather than screen work. */
    music: boolean;
    credits: number;
    nextRole: 'extra' | 'supporting' | 'lead';
    contract: {
      kind: 'film' | 'tv' | 'single';
      role: 'extra' | 'supporting' | 'lead';
      monthlyMinor: bigint;
      monthsLeft: number;
    } | null;
  } | null;
  reputation: number;
  specialty: string | null;
  specialtyProgress: number;
  satisfaction: Satisfaction | null;
  actions: {
    id: WorkActionId;
    hours: number;
    energy: number;
    available: boolean;
    reason: string | null;
  }[];
  ownsBusiness: boolean;
  inPolitics: boolean;
}

export interface WorkView {
  minWorkAge: number;
  canWork: boolean;
  career: CareerView;
  job: JobView | null;
  history: {
    id: string;
    title: string;
    employer: string;
    startTick: number;
    endTick: number | null;
    endReason: string | null;
  }[];
  postings: {
    id: string;
    title: string;
    occupationId: string;
    industry: string;
    employer: string;
    contract: string;
    hours: number;
    salaryMinMinor: bigint;
    salaryMaxMinor: bigint;
    applicants: number;
    openings: number;
    expiresTick: number;
    education: string;
    field: string | null;
    experienceNeeded: number;
    experiencedHire: boolean;
    block: JobRejection | null;
    applied: boolean;
  }[];
  applications: {
    id: string;
    title: string;
    employer: string;
    status: string;
    tick: number;
    interviewTick: number | null;
    preparation: number;
    offerSalaryMinor: bigint | null;
    offerExpiresTick: number | null;
    negotiated: boolean;
    /** A rival approached you (gameplay expansion). */
    headhunted: boolean;
    /** Percent chance your employer matches it, or null when you cannot ask (any more). */
    counterChance: number | null;
    referrerName: string | null;
  }[];
  /** Creative paths to start from the Career tab: why not (null = can start now). */
  paths: {
    occupationId: CreativePath;
    title: string;
    block: string | null;
    skills: string[];
    minSkill: number;
  }[];
  retired: boolean;
  canRetire: boolean;
  experienceMonths: number;
}

export interface FinanceView {
  currency: CurrencyView;
  personal: {
    checkingId: string | null;
    savingsId: string | null;
    checking: bigint | null;
    savings: bigint | null;
    retirement: bigint | null;
    assets: bigint;
    liabilities: bigint;
    netWorth: bigint;
    creditScore: number;
    pensionBp: number;
    savingsRateBp: number;
  } | null;
  household: {
    checking: bigint;
    savings: bigint;
    lifestyle: string;
    defaultLifestyle: string;
    housing: string;
    homeSize: string;
    rentMinor: bigint;
    isHead: boolean;
    netWorth: bigint;
    livingCostsMinor: bigint;
    /** The household's own income and spending this month. */
    monthIncome: bigint;
    monthExpenses: bigint;
  } | null;
  loans: {
    id: string;
    product: string;
    balance: bigint;
    currency: CurrencyView;
    rateBp: number;
    paymentMinor: bigint;
    firstPaymentTick: number;
    missedPayments: number;
    termMonths: number;
  }[];
  arrears: bigint;
  policies: {
    id: string;
    type: string;
    premiumMinor: bigint;
    coverageMinor: bigint;
    status: string;
    startTick: number;
  }[];
  quotes: { healthPremiumMinor: bigint; lifeCoverageMinor: bigint; lifePremiumMinor: bigint };
  month: {
    tick: number;
    income: { category: string; amount: bigint }[];
    expenses: { category: string; amount: bigint }[];
    totalIncome: bigint;
    totalExpenses: bigint;
    /** Pension and investment value changes (signed): not cash, left out of the totals. */
    notCash: { category: string; amount: bigint }[];
    /** Debt repaid this month by product (loan and mortgage payments beyond interest). */
    repaid: { product: string; amount: bigint }[];
  };
  history: MonthSummary[];
  taxYear: {
    gross: bigint;
    withheld: bigint;
    social: bigint;
    startTick: number;
    yearStartMonth: number;
  } | null;
  transactions: {
    id: string;
    tick: number;
    kind: string;
    params: Record<string, string | number>;
    amount: bigint;
  }[];
  economy: {
    inflationBp: number;
    unemploymentBp: number;
    policyRateBp: number;
    cycle: number;
    medianWageMinor: bigint;
  };
  benefits: { months: number; amountMinor: bigint };
  statePensionAge: number;
  statePensionEstimateMinor: bigint;
  /** Retirement fund payouts (gameplay expansion): monthly once retired, and a one-off lump sum. */
  retirementPayout: {
    retired: boolean;
    /** Monthly income from the fund if retired now (or as now, when retired). */
    monthlyMinor: bigint;
    lumpSumAge: number;
    lumpSumPercent: number;
    lumpSumMinor: bigint;
    /** Why the lump sum cannot be taken now, or null. */
    lumpSumBlock: string | null;
  };
  netIncomeMinor: bigint;
  /** For loan previews: the rate offered now, current repayments and the affordability limit. */
  personalLoanRateBp: number;
  loanPaymentsMinor: bigint;
  debtLimitPercent: number;
  canMoveOut: boolean;
  moveOutRents: { room: bigint; apartment: bigint; house: bigint };
  canMoveHome: boolean;
  rulesSource: typeof RULES_SOURCE;
}

export interface CalendarView {
  plans: (RecurringPlan & { hours: number })[];
  plannedHours: number;
  items: World['calendar']['items'];
  upcoming: UpcomingEntry[];
  time: { total: number; used: number; lines: TimeLine[] };
  vacations: { id: string; costMinor: bigint; hours: number }[];
  checkupCostMinor: bigint;
}

interface DatingCandidate {
  id: string;
  name: string;
  age: number;
  closeness: number;
  chemistry: number;
  interested: boolean;
}

export interface SocialView {
  people: PersonSummary[];
  partner: (PersonSummary & { partnership: Partnership }) | null;
  expecting: { kind: string; dueTick: number }[];
  canMeetPeople: boolean;
  /** Single adults only: looking for a partner. */
  dating: {
    canLookForLove: boolean;
    needed: number;
    candidates: DatingCandidate[];
    profiles: (DatingCandidate &
      ReturnType<typeof datingProfileTraits> & {
        interests: Character['interests'];
        location: string;
      })[];
    matches: (DatingCandidate & { askOutReason: string | null })[];
  } | null;
}

export interface GameView {
  worldId: string;
  seed: string;
  clock: YearMonth;
  tick: number;
  rules: World['rules'];
  ruleChanges: World['ruleChanges'];
  lifeStatus: World['lifeStatus'];
  character: PersonView & {
    stats: Stats;
    needs: Needs;
    skills: Skills;
    habits: Habits;
    interests: Character['interests'];
    statLog: StatChange[];
    location: { id: string; name: string; region: string; kind: 'city' | 'rural' };
    countryCode: string;
    nextBirthdayInMonths: number;
    deathCause: string | null;
  };
  household: {
    wealth: Household['wealth'];
    scenario: Household['scenario'];
    flags: Household['flags'];
    originCountryCode: string | null;
    familyTrade: string | null;
    members: PersonView[];
  };
  country: {
    code: string;
    name: string;
    currency: CurrencyView;
    medianMonthlyWageMinor: number;
    costOfLivingIndex: number;
    locationCostIndex: number;
    lifeExpectancy: number;
    sourceStatus: string;
    sourceAsOf: string;
  };
  time: { totalHours: number; usedHours: number };
  activities: ActivityAvailability[];
  /** Activities Hub: every free-time activity with category, cost and availability. */
  hub: HubView;
  feed: BiographyEntry[];
  notifications: Notification[];
  unreadCount: number;
  pendingEvent: PendingEventView | null;
  education: EducationView;
  work: WorkView;
  finance: FinanceView;
  calendar: CalendarView;
  social: SocialView;
  enterprise: EnterpriseView;
  civic: CivicView;
  legacy: LegacyView;
  media: MediaView;
  achievements: AchievementsView;
  packs: PackSummary[];
  /** Titles and outcomes of content-pack events (built-in texts ship with the app). */
  customEventTexts: Record<string, { title: string; outcomes: Record<string, string> }>;
}

function relationTo(
  world: World,
  player: Character,
  c: Character,
): { relation: RelationType | null; rel: World['relationships'][string] | null } {
  if (c.id === player.id) return { relation: null, rel: null };
  const rel =
    sortedValues(world.relationships).find((r) => r.aId === player.id && r.bId === c.id) ?? null;
  const kin = kinship(world, player.id, c.id);
  return {
    relation: player.partnership?.partnerId === c.id ? 'partner' : (kin ?? rel?.type ?? null),
    rel,
  };
}

function personView(world: World, c: Character, player: Character): PersonView {
  const age = ageOf(c.birth, c.death ?? world.clock);
  const { relation, rel } = relationTo(world, player, c);
  return {
    id: c.id,
    identity: c.identity,
    displayName: displayName(c.identity),
    age,
    stage: lifeStage(age.years),
    alive: isAlive(c),
    appearance: c.appearance,
    relation,
    closeness: rel?.closeness ?? null,
    birth: c.birth,
    death: c.death,
  };
}

function personSummary(world: World, c: Character, player: Character): PersonSummary {
  const base = personView(world, c, player);
  const rel = sortedValues(world.relationships).find((r) => r.aId === player.id && r.bId === c.id);
  return {
    ...base,
    trust: rel?.trust ?? 0,
    respect: rel?.respect ?? 0,
    conflict: rel?.conflict ?? 0,
    chemistry: rel?.chemistry ?? 0,
    lastContactTick: rel?.lastContactTick ?? 0,
    isPartner: player.partnership?.partnerId === c.id,
    sameHousehold: c.householdId === player.householdId,
    tier: c.tier,
  };
}

export const FEED_LIMIT = 80;

function educationView(world: World, c: Character): EducationView {
  const rules = getRules(c.countryCode).education;
  const current = c.education.current;
  const age = ageOf(c.birth, world.clock).years;
  const programName = (id: string | null) => (id ? (findProgram(id)?.name ?? id) : null);
  const canApply =
    c.education.qualifications.includes('upperSecondary') ||
    (current?.stage === 'upperSecondary' && current.yearsCompleted >= current.years - 1);
  const hasStudentLoan = Object.values(world.ledger.accounts).some(
    (a) => a.ownerId === c.id && a.loan?.product === 'student' && a.closedTick === null,
  );
  return {
    current: current
      ? {
          stage: current.stage,
          stageName: stageName(c.countryCode, current.stage),
          institution: current.institution,
          kind: current.kind,
          programId: current.programId,
          programName: programName(current.programId),
          level: current.level,
          yearsCompleted: current.yearsCompleted,
          years: current.years,
          grade: current.grade,
          scholarshipPercent: current.scholarshipPercent,
        }
      : null,
    effort: c.education.effort,
    history: c.education.history.map((h) => ({
      ...h,
      stageName: stageName(c.countryCode, h.stage),
      programName: programName(h.programId),
    })),
    qualifications: c.education.qualifications,
    awards: c.education.awards,
    reports: c.education.reports.slice(-12),
    clubs: CLUBS.map((club) => ({
      id: club.id,
      name: club.name,
      hours: club.hours,
      feeMinor: applyPercent(medianWage(world, c.countryCode), club.feePercent),
      competition: club.competition?.name ?? null,
      member: c.education.clubs.includes(club.id),
      block: c.education.clubs.includes(club.id) ? null : clubEligibility(world, c, club.id),
    })),
    applications: c.education.applications.map((a) => ({
      ...a,
      programName: programName(a.programId) ?? a.programId,
    })),
    programs:
      age >= 15
        ? PROGRAMS.map((p) => ({
            id: p.id,
            name: p.name,
            levels: p.levels.map((level) => ({
              level,
              block: applicationEligibility(c, p.id, level),
            })),
          }))
        : [],
    canApply,
    leavingAge: leavingAge(c.countryCode),
    canLeave:
      current !== null && (current.stage === 'tertiary' || age >= leavingAge(c.countryCode)),
    schoolYearStartMonth: rules.schoolYearStartMonth,
    fees: educationFees(world, c),
    studentLoans: rules.studentLoans,
    hasStudentLoan,
  };
}

function careerView(world: World, c: Character, e: Employment | undefined): CareerView {
  const track = e ? careerTrack(e) : null;
  return {
    track,
    screen: projectActing(world, c),
    acting:
      track === 'performing'
        ? {
            music: e?.terms.occupationId === 'musician' || e?.terms.occupationId === 'singer',
            credits: c.career.credits ?? 0,
            nextRole: actingRole(c),
            contract: c.career.contract ?? null,
          }
        : null,
    reputation: c.career.reputation,
    specialty: c.career.specialty,
    specialtyProgress: c.career.specialtyProgress,
    satisfaction: e ? jobSatisfaction(world, c, e) : null,
    actions: track
      ? WORK_ACTION_IDS.filter(
          (id) =>
            WORK_ACTIONS[id].track === track && workActionBlock(world, c, id) !== 'otherTrack',
        ).map((id) => {
          const block = workActionBlock(world, c, id);
          return {
            id,
            hours: WORK_ACTIONS[id].hours,
            energy: WORK_ACTIONS[id].energy,
            available: block === null,
            reason: block ? WORK_ACTION_MESSAGES[block] : null,
          };
        })
      : [],
    ownsBusiness: Object.values(world.businesses).some(
      (b) => b.status === 'active' && b.owners.some((o) => o.ownerId === c.id),
    ),
    inPolitics: Object.values(world.civics.politics).some((p) => p.characterId === c.id),
  };
}

function workView(world: World, c: Character): WorkView {
  const rules = getRules(c.countryCode);
  const age = ageOf(c.birth, world.clock).years;
  const e = c.employmentId ? world.employment[c.employmentId] : undefined;
  const manager = e?.managerId ? world.characters[e.managerId] : undefined;
  const activeApps = sortedValues(world.jobs.applications).filter((a) => a.characterId === c.id);
  return {
    minWorkAge: rules.work.minWorkAge,
    canWork: age >= rules.work.minWorkAge,
    career: careerView(world, c, e?.status === 'active' ? e : undefined),
    job:
      e?.status === 'active'
        ? {
            id: e.id,
            title: e.title,
            occupationId: e.terms.occupationId,
            employer: e.terms.employer,
            industry: industryName(e.terms.industryId),
            contract: e.terms.contract,
            hours: e.terms.hours,
            salaryMinor: e.salaryMinor,
            performance: e.performance,
            managerId: manager?.id ?? null,
            managerName: manager ? displayName(manager.identity, false) : null,
            startTick: e.startTick,
            effort: e.effort,
            nextReviewTick: e.lastReviewTick + 12,
            raiseAvailableTick:
              e.raiseRequestedTick === null ? world.tick : e.raiseRequestedTick + 12,
            warnings: e.warnings,
            level: e.terms.level,
          }
        : null,
    history: sortedValues(world.employment)
      .filter((x) => x.characterId === c.id && x.status === 'ended')
      .sort((a, b) => b.startTick - a.startTick)
      .map((x) => ({
        id: x.id,
        title: x.title,
        employer: x.terms.employer,
        startTick: x.startTick,
        endTick: x.endTick,
        endReason: x.endReason,
      })),
    postings: sortedValues(world.jobs.postings)
      .filter((p) => p.terms.locationId === c.locationId)
      .sort((a, b) => b.postedTick - a.postedTick || (a.id < b.id ? -1 : 1))
      .map((p) => {
        const occupation = getOccupation(p.terms.occupationId);
        return {
          id: p.id,
          title: findOccupation(p.terms.occupationId)
            ? jobTitleFor(p.terms.occupationId, p.terms.level)
            : p.terms.occupationId,
          occupationId: p.terms.occupationId,
          industry: industryName(p.terms.industryId),
          employer: p.terms.employer,
          contract: p.terms.contract,
          hours: p.terms.hours,
          salaryMinMinor: p.terms.salaryMinMinor,
          salaryMaxMinor: p.terms.salaryMaxMinor,
          applicants: p.applicants,
          openings: p.openings,
          expiresTick: p.expiresTick,
          education: occupation.education,
          field: occupation.field,
          experienceNeeded: requiredIndustryExperience(
            occupation,
            p.terms.level,
            c.education.qualifications,
          ),
          experiencedHire: occupation.minExperienceMonths > 0,
          block: jobEligibility(world, c, p.terms),
          applied: activeApps.some(
            (a) =>
              a.postingId === p.id &&
              (a.status === 'applied' || a.status === 'interview' || a.status === 'offered'),
          ),
        };
      }),
    applications: activeApps
      .sort((a, b) => b.tick - a.tick)
      .map((a) => ({
        id: a.id,
        title: jobTitleFor(a.terms.occupationId, a.terms.level),
        employer: a.terms.employer,
        status: a.status,
        tick: a.tick,
        interviewTick: a.interviewTick,
        preparation: a.preparation,
        offerSalaryMinor: a.offerSalaryMinor,
        offerExpiresTick: a.offerExpiresTick,
        negotiated: a.negotiated,
        headhunted: a.headhunted === true,
        counterChance:
          a.headhunted === true && a.countered !== true && e?.status === 'active'
            ? counterOfferChance(world, c, e)
            : null,
        referrerName: a.referrerId
          ? (world.characters[a.referrerId]?.identity.firstName ?? null)
          : null,
      })),
    paths: CREATIVE_PATHS.map((id) => {
      const block = creativePathBlock(world, c, id);
      return {
        occupationId: id,
        title: getOccupation(id).title,
        block: block ? JOB_MESSAGES[block] : null,
        skills: [...getOccupation(id).skills],
        minSkill: Math.round(getOccupation(id).minSkill / 10),
      };
    }),
    retired: c.finance?.retired ?? false,
    canRetire: age >= 55 && !(c.finance?.retired ?? false),
    experienceMonths: experienceMonths(world, c.id, null),
  };
}

function jobTitleFor(occupationId: string, level: number): string {
  return jobTitle(getOccupation(occupationId), level);
}

function financeView(world: World, c: Character): FinanceView {
  const country = getCountry(c.countryCode);
  const rules = getRules(c.countryCode);
  const bal = (id: string | null | undefined) =>
    id ? (world.ledger.accounts[id]?.balance ?? null) : null;
  const h = world.households[c.householdId];
  const isHead = h?.finance?.headId === c.id;
  const owners = isHead ? [c.id, h.id] : [c.id];
  const homeValue = (amount: bigint, currency: string) =>
    convertCurrency(world, amount, currency, country.currency.code);
  const householdTotals = h?.finance ? monthTotals(world, h.id, world.tick, homeValue) : null;
  const totals = { income: new Map<string, bigint>(), expenses: new Map<string, bigint>() };
  for (const owner of owners) {
    const t =
      owner === h?.id && householdTotals
        ? householdTotals
        : monthTotals(world, owner, world.tick, homeValue);
    for (const [key, amount] of t.byCategory) {
      const [kind, category = ''] = key.split(':');
      const map = kind === 'income' ? totals.income : totals.expenses;
      map.set(category, (map.get(category) ?? 0n) + amount);
    }
  }
  // Debt repaid this month (the part of each loan or mortgage payment beyond its interest):
  // real money out that is not spending, so it is shown separately.
  const repaidBy = new Map<string, bigint>();
  for (const tx of world.ledger.journal[String(world.tick)] ?? []) {
    if (tx.kind !== 'tx.loanPayment' && tx.kind !== 'tx.loanInterest') continue;
    for (const e of tx.entries) {
      const a = world.ledger.accounts[e.accountId];
      if (a?.type !== 'loan' || !a.loan || !owners.includes(a.ownerId)) continue;
      const product = a.loan.product;
      repaidBy.set(
        product,
        (repaidBy.get(product) ?? 0n) + homeValue(e.debit - e.credit, a.currency),
      );
    }
  }
  const repaid = [...repaidBy]
    .map(([product, amount]) => ({ product, amount }))
    .filter((x) => x.amount > 0n);
  const NOT_CASH = new Set(['employerPension', 'investment', 'investmentLoss', 'depreciation']);
  const lines = (map: Map<string, bigint>, notCash: boolean) =>
    [...map]
      .filter(([category, amount]) => amount !== 0n && NOT_CASH.has(category) === notCash)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => (b.amount > a.amount ? 1 : -1));
  const sumOf = (map: Map<string, bigint>) =>
    [...map].reduce((s, [category, amount]) => (NOT_CASH.has(category) ? s : s + amount), 0n);
  const accountsOwned = (owner: string): Account[] =>
    sortedValues(world.ledger.accounts).filter((a) => a.ownerId === owner && a.closedTick === null);
  const personalAccounts = accountsOwned(c.id);
  const arrears = [...personalAccounts, ...(isHead ? accountsOwned(h.id) : [])]
    .filter((a) => a.type === 'arrears')
    .reduce((s, a) => s + homeValue(a.balance, a.currency), 0n);
  const assetAccountIds = new Set(
    [
      c.finance?.checkingId,
      c.finance?.savingsId,
      c.finance?.retirementId,
      ...(h?.finance?.headId === c.id ? [h.finance.checkingId, h.finance.savingsId] : []),
    ].filter((x): x is string => !!x),
  );
  const transactions: FinanceView['transactions'] = [];
  for (
    let tick = world.tick;
    tick >= Math.max(0, world.tick - 3) && transactions.length < 40;
    tick--
  ) {
    for (const tx of [...(world.ledger.journal[String(tick)] ?? [])].reverse()) {
      let amount = 0n;
      let touches = false;
      for (const e of tx.entries) {
        if (assetAccountIds.has(e.accountId)) {
          touches = true;
          amount += e.debit - e.credit;
        }
      }
      if (touches && amount !== 0n)
        transactions.push({ id: tx.id, tick: tx.tick, kind: tx.kind, params: tx.params, amount });
      if (transactions.length >= 40) break;
    }
  }
  const economy = world.economy[c.countryCode];
  const median = medianWage(world, c.countryCode);
  const age = ageOf(c.birth, world.clock).years;
  const lifeCoverage = median * 120n;
  return {
    currency: country.currency,
    personal: c.finance
      ? {
          checkingId: c.finance.checkingId,
          savingsId: c.finance.savingsId,
          checking: bal(c.finance.checkingId),
          savings: bal(c.finance.savingsId),
          retirement: bal(c.finance.retirementId),
          assets: assetsOf(world, c.id, homeValue),
          liabilities: liabilitiesOf(world, c.id, homeValue),
          netWorth: netWorthIn(world, c.id, country.currency.code),
          creditScore: c.finance.creditScore,
          pensionBp: c.finance.pensionBp,
          savingsRateBp: c.finance.savingsId
            ? (world.ledger.accounts[c.finance.savingsId]?.rateBp ?? 0)
            : 0,
        }
      : null,
    household: h?.finance
      ? {
          checking: bal(h.finance.checkingId) ?? 0n,
          savings: bal(h.finance.savingsId) ?? 0n,
          lifestyle: h.finance.lifestyle,
          defaultLifestyle: DEFAULT_LIFESTYLE[h.wealth],
          housing: h.finance.housing,
          homeSize: h.finance.homeSize,
          rentMinor: h.finance.rentMinor,
          isHead,
          netWorth:
            netWorthIn(world, h.id, country.currency.code) +
            (isHead ? netWorthIn(world, c.id, country.currency.code) : 0n),
          livingCostsMinor: livingCosts(world, h),
          monthIncome: householdTotals?.income ?? 0n,
          monthExpenses: householdTotals?.expenses ?? 0n,
        }
      : null,
    loans: personalAccounts
      .filter((a) => a.type === 'loan' && a.loan)
      .map((a) => ({
        id: a.id,
        product: a.loan?.product ?? 'personal',
        balance: a.balance,
        currency: getCountry(currencyCountry(a.currency)).currency,
        rateBp: a.loan?.rateBp ?? 0,
        paymentMinor: a.loan?.paymentMinor ?? 0n,
        firstPaymentTick: a.loan?.firstPaymentTick ?? 0,
        missedPayments: a.loan?.missedPayments ?? 0,
        termMonths: a.loan?.termMonths ?? 0,
      })),
    arrears,
    policies: sortedValues(world.insurance)
      .filter((p) => p.holderId === c.id)
      .map((p) => ({
        id: p.id,
        type: p.type,
        premiumMinor: p.premiumMinor,
        coverageMinor: p.coverageMinor,
        status: p.status,
        startTick: p.startTick,
      })),
    quotes: {
      healthPremiumMinor: insurancePremium(world, c, 'health', 0n),
      lifeCoverageMinor: lifeCoverage,
      lifePremiumMinor: insurancePremium(world, c, 'life', lifeCoverage),
    },
    month: {
      tick: world.tick,
      income: lines(totals.income, false),
      expenses: lines(totals.expenses, false),
      // Pension contributions by the employer and investment value changes never reach the
      // current account. shortcut: a bond sold above face value is cash but booked as investment
      // income, so it lands here; split the category if that starts to matter.
      notCash: [
        ...lines(totals.income, true),
        ...lines(totals.expenses, true).map((x) => ({ ...x, amount: -x.amount })),
      ],
      totalIncome: sumOf(totals.income),
      totalExpenses: sumOf(totals.expenses),
      repaid,
    },
    history: (world.ledger.history[c.id] ?? []).slice(-24),
    taxYear: c.finance ? { ...c.finance.taxYear, yearStartMonth: rules.tax.yearStartMonth } : null,
    transactions,
    economy: {
      inflationBp: economy?.inflationBp ?? rules.rates.inflationBp,
      unemploymentBp: economy?.unemploymentBp ?? rules.rates.unemploymentBp,
      policyRateBp: economy?.policyRateBp ?? rules.rates.policyBp,
      cycle: economy?.cycle ?? 0,
      medianWageMinor: median,
    },
    benefits: { months: c.finance?.benefitMonths ?? 0, amountMinor: c.finance?.benefitMinor ?? 0n },
    statePensionAge: rules.pension.stateAge,
    statePensionEstimateMinor: statePension(world, c, true),
    retirementPayout: {
      retired: c.finance?.retired ?? false,
      monthlyMinor: retirementDraw(world, c),
      lumpSumAge: LUMP_SUM_AGE,
      lumpSumPercent: LUMP_SUM_PERCENT,
      lumpSumMinor: lumpSumAmount(world, c),
      lumpSumBlock: ((code) => (code ? FINANCE_MESSAGES[code] : null))(lumpSumBlock(world, c)),
    },
    netIncomeMinor: monthlyNetIncome(world, c),
    personalLoanRateBp: rateFor(world, c, 'personal'),
    loanPaymentsMinor: loanPayments(world, c),
    debtLimitPercent: debtLimitPercent(world),
    canMoveOut: age >= 18 && !isHead,
    moveOutRents: {
      room: rentFor(world, c.locationId, 'room'),
      apartment: rentFor(world, c.locationId, 'apartment'),
      house: rentFor(world, c.locationId, 'house'),
    },
    canMoveHome: isHead && h.memberIds.length === 1 && familyHomeFor(world, c) !== null,
    rulesSource: RULES_SOURCE,
  };
}

function calendarView(world: World, c: Character): CalendarView {
  const budget = timeBudgetFor(world, c);
  const median = medianWage(world, c.countryCode);
  return {
    plans: world.calendar.plans.map((p) => ({
      ...p,
      hours:
        (listActivities(world).find((a) => a.id === p.activityId)?.hours ?? 0) * p.timesPerMonth,
    })),
    plannedHours: plannedHours(world),
    items: world.calendar.items.filter(
      (i) => i.status === 'scheduled' || i.tick >= world.tick - 12,
    ),
    upcoming: upcoming(world, 12),
    time: budget,
    vacations: VACATIONS.map((v) => ({
      id: v.id,
      costMinor: applyPercent(median, v.costPercent),
      hours: v.hours,
    })),
    checkupCostMinor: applyPercent(median, CHECKUP_COST_PERCENT),
  };
}

function socialView(world: World, c: Character): SocialView {
  const people: PersonSummary[] = [];
  for (const rel of sortedValues(world.relationships)) {
    if (rel.aId !== c.id) continue;
    const other = world.characters[rel.bId];
    if (!other) continue;
    if (other.tier === 'archived' && other.death === null && !kinship(world, c.id, other.id))
      continue;
    people.push(personSummary(world, other, c));
  }
  const partner = c.partnership ? world.characters[c.partnership.partnerId] : undefined;
  return {
    people,
    partner:
      partner && c.partnership
        ? { ...personSummary(world, partner, c), partnership: c.partnership }
        : null,
    expecting: world.expecting
      .filter((e) => e.parentIds.includes(c.id))
      .map((e) => ({ kind: e.kind, dueTick: e.dueTick })),
    canMeetPeople: ageOf(c.birth, world.clock).years >= 16,
    dating: datingView(world, c),
  };
}

/** Single people the single adult player could date, closest first (roadmap: dating depth). */
function datingView(world: World, c: Character): SocialView['dating'] {
  if (c.death !== null || c.partnership || ageOf(c.birth, world.clock).years < ADULT_AGE)
    return null;
  const candidates = sortedValues(world.relationships)
    .filter((r) => r.aId === c.id)
    .map((r) => ({ r, o: world.characters[r.bId] }))
    .filter(({ o }) => o !== undefined && isRomanticProspectBase(world, c, o))
    .map(({ r, o }) => ({
      id: r.bId,
      name: o ? displayName(o.identity, false) : '',
      age: o ? ageOf(o.birth, world.clock).years : 0,
      closeness: r.closeness,
      chemistry: r.chemistry,
      interested: memoriesAbout(world, r.bId, c.id).some((m) => m.key === 'interestedInYou'),
    }))
    .sort((a, b) => b.closeness - a.closeness || (a.id < b.id ? -1 : 1));
  const profiles: NonNullable<SocialView['dating']>['profiles'] = [];
  const matches: NonNullable<SocialView['dating']>['matches'] = [];
  for (const candidate of candidates) {
    const status = datingAppStatus(world, c, candidate.id);
    const other = world.characters[candidate.id];
    if (!other) continue;
    if (status === 'profile')
      profiles.push({
        ...candidate,
        ...datingProfileTraits(world, other),
        interests: other.interests,
        location: getLocation(other.locationId).location.name,
      });
    if (status === 'match') {
      const block = interactionBlock(world, c, other, 'askOut');
      matches.push({
        ...candidate,
        askOutReason: block ? INTERACTION_BLOCK_MESSAGES[block] : null,
      });
    }
  }
  return {
    canLookForLove: true,
    needed: DATE_CLOSENESS,
    candidates: candidates.slice(0, 6),
    profiles,
    matches,
  };
}

export function projectGame(state: SimState): GameView {
  const world = state.world;
  const player = activeCharacter(world);
  const household = world.households[player.householdId];
  if (!household) throw new Error('Player household missing');
  const { country, location } = getLocation(player.locationId);
  const profile = getCountry(country.code);
  const budget = timeBudgetFor(world, player);

  let pendingEvent: PendingEventView | null = null;
  const pendingWorld = state.pending;
  if (pendingWorld?.events.pendingInstanceId) {
    const instance = pendingWorld.events.instances[pendingWorld.events.pendingInstanceId];
    if (instance) {
      const def = getEventIn(pendingWorld, instance.definitionId);
      pendingEvent = {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        text: def.text.en,
        category: def.category,
        clock: pendingWorld.clock,
        choices: choiceAvailability(pendingWorld, instance.id),
        params: textParams(pendingWorld, instance),
      };
    }
  }

  const members = household.memberIds
    .filter((id) => id !== player.id)
    .map((id) => world.characters[id])
    .filter((c): c is Character => c !== undefined)
    .map((c) => personView(world, c, player));

  return {
    worldId: world.id,
    seed: world.seed,
    clock: world.clock,
    tick: world.tick,
    rules: world.rules,
    ruleChanges: world.ruleChanges,
    lifeStatus: world.lifeStatus,
    character: {
      ...personView(world, player, player),
      stats: player.stats,
      needs: player.needs,
      skills: player.skills,
      habits: player.habits,
      interests: player.interests,
      statLog: player.statLog.slice(-30),
      location: {
        id: location.id,
        name: location.name,
        region: location.region,
        kind: location.kind,
      },
      countryCode: player.countryCode,
      nextBirthdayInMonths: monthsUntilBirthday(player.birth, world.clock),
      deathCause: player.deathCause,
    },
    household: {
      wealth: household.wealth,
      scenario: household.scenario,
      flags: household.flags,
      originCountryCode: household.originCountryCode,
      familyTrade: household.familyTrade,
      members,
    },
    country: {
      code: profile.code,
      name: profile.name,
      currency: profile.currency,
      medianMonthlyWageMinor: profile.economy.medianMonthlyWageMinor,
      costOfLivingIndex: profile.economy.costOfLivingIndex,
      locationCostIndex: location.costIndex,
      lifeExpectancy: profile.lifeExpectancy,
      sourceStatus: profile.source.status,
      sourceAsOf: profile.source.asOf,
    },
    time: { totalHours: budget.total, usedHours: budget.used },
    activities: world.lifeStatus === 'alive' ? listActivities(world) : [],
    hub: projectHub(world),
    feed: world.biography.filter((b) => b.characterId === player.id).slice(-FEED_LIMIT),
    notifications: world.notifications.slice(-100),
    unreadCount: world.notifications.filter((n) => !n.read).length,
    pendingEvent,
    education: educationView(world, player),
    work: workView(world, player),
    finance: financeView(world, player),
    calendar: calendarView(world, player),
    social: socialView(world, player),
    enterprise: projectEnterprise(world, player),
    civic: projectCivic(world, player),
    legacy: projectLegacy(world, player),
    media: projectMedia(world, player),
    achievements: projectAchievements(world),
    ...projectPacks(world),
  };
}

/** Detail for one person (Social: profile, memories, interactions). */
export interface PersonDetailView extends PersonSummary {
  location: string;
  countryCode: string;
  interests: Character['interests'];
  occupation: string | null;
  employer: string | null;
  retired: boolean;
  education: string | null;
  partnerName: string | null;
  partnerId: string | null;
  childrenCount: number;
  theirMemories: { key: string; tick: number; valence: number; salience: number }[];
  yourMemories: { key: string; tick: number; valence: number; salience: number }[];
  interactions: { id: InteractionId; hours: number; available: boolean; reason: string | null }[];
}

export function projectPerson(state: SimState, personId: string): PersonDetailView | null {
  const world = state.world;
  const player = activeCharacter(world);
  const c = world.characters[personId];
  if (!c || c.id === player.id) return null;
  const summary = personSummary(world, c, player);
  const job = c.employmentId ? world.employment[c.employmentId] : undefined;
  const partner = c.partnership ? world.characters[c.partnership.partnerId] : undefined;
  const school = c.education.current;
  const highest =
    [...c.education.qualifications].reverse().find((q) => q.includes(':')) ??
    c.education.qualifications[c.education.qualifications.length - 1] ??
    null;
  const memories = (owner: string, about: string) =>
    memoriesAbout(world, owner, about).map((m) => ({
      key: m.key,
      tick: m.tick,
      valence: m.valence,
      salience: m.salience,
    }));
  return {
    ...summary,
    location: getLocation(c.locationId).location.name,
    countryCode: c.countryCode,
    interests: c.interests,
    occupation: job?.status === 'active' ? job.title : null,
    employer: job?.status === 'active' ? job.terms.employer : null,
    retired:
      c.finance?.retired ??
      (job === undefined &&
        ageOf(c.birth, world.clock).years >= getRules(c.countryCode).pension.stateAge),
    education: school ? stageName(c.countryCode, school.stage) : highest,
    partnerName: partner ? displayName(partner.identity, false) : null,
    partnerId: partner?.id ?? null,
    childrenCount: childrenOf(world, c.id).length,
    theirMemories: memories(c.id, player.id),
    yourMemories: memories(player.id, c.id),
    interactions:
      state.pending || world.lifeStatus !== 'alive'
        ? []
        : INTERACTION_IDS.map((id) => {
            const block = interactionBlock(world, player, c, id);
            return {
              id,
              hours: INTERACTIONS[id].hours,
              available: block === null,
              reason: block
                ? id === 'askOut' && block === 'notClose'
                  ? `You need to be closer first: closeness ${String(DATE_CLOSENESS)} needed, you are at ${String(summary.closeness ?? 0)}.`
                  : INTERACTION_BLOCK_MESSAGES[block]
                : null,
            };
          }),
  };
}

/** Family tree node and generations relative to the player (-2 .. +2). */
export interface FamilyNode {
  id: string;
  name: string;
  firstName: string;
  relation: RelationType | 'you' | 'partner' | 'partnerOf' | null;
  alive: boolean;
  birthYear: number;
  deathYear: number | null;
  appearance: Appearance;
  stage: LifeStage;
  ageYears: number;
  partnerIds: string[];
  parentIds: string[];
}

export interface FamilyTreeView {
  generations: { offset: number; nodes: FamilyNode[] }[];
}

export function projectFamily(state: SimState): FamilyTreeView {
  const world = state.world;
  const player = activeCharacter(world);
  const levels = new Map<string, number>();
  const visit = (id: string, level: number) => {
    if (levels.has(id) || Math.abs(level) > 2) return;
    levels.set(id, level);
  };
  visit(player.id, 0);
  for (const p of parentsOf(world, player.id)) {
    visit(p, -1);
    for (const gp of parentsOf(world, p)) visit(gp, -2);
    for (const au of siblingsOf(world, p)) {
      visit(au, -1);
      for (const cousin of childrenOf(world, au)) visit(cousin, 0);
    }
  }
  for (const s of siblingsOf(world, player.id)) {
    visit(s, 0);
    for (const n of childrenOf(world, s)) visit(n, 1);
  }
  for (const k of childrenOf(world, player.id)) {
    visit(k, 1);
    for (const gk of childrenOf(world, k)) visit(gk, 2);
  }
  // Partners appear beside the people they are with.
  for (const [id, level] of [...levels]) {
    const partnerId = world.characters[id]?.partnership?.partnerId;
    if (partnerId && !levels.has(partnerId)) levels.set(partnerId, level);
  }
  const node = (id: string): FamilyNode | null => {
    const c = world.characters[id];
    if (!c) return null;
    const age = ageOf(c.birth, c.death ?? world.clock);
    const kin =
      id === player.id
        ? 'you'
        : player.partnership?.partnerId === id
          ? 'partner'
          : kinship(world, player.id, id);
    return {
      id,
      name: displayName(c.identity, false),
      firstName: c.identity.firstName,
      relation: kin ?? 'partnerOf',
      alive: c.death === null,
      birthYear: c.birth.year,
      deathYear: c.death?.year ?? null,
      appearance: c.appearance,
      stage: lifeStage(age.years),
      ageYears: age.years,
      partnerIds: c.partnership ? [c.partnership.partnerId] : [],
      parentIds: parentsOf(world, id),
    };
  };
  const generations: FamilyTreeView['generations'] = [];
  for (const offset of [-2, -1, 0, 1, 2]) {
    const nodes = [...levels]
      .filter(([, level]) => level === offset)
      .map(([id]) => node(id))
      .filter((n): n is FamilyNode => n !== null)
      .sort((a, b) =>
        a.relation === 'you'
          ? -1
          : b.relation === 'you'
            ? 1
            : a.birthYear - b.birthYear || (a.id < b.id ? -1 : 1),
      );
    if (nodes.length > 0) generations.push({ offset, nodes });
  }
  return { generations };
}

/** Summary shown in the save-slot list. */
export interface SaveSummary {
  characterName: string;
  ageYears: number;
  countryCode: string;
  clock: YearMonth;
  lifeStatus: World['lifeStatus'];
  appearance: Appearance;
  stage: LifeStage;
}

export function summarizeWorld(world: World): SaveSummary {
  const player = activeCharacter(world);
  const age = ageOf(player.birth, player.death ?? world.clock);
  return {
    characterName: displayName(player.identity),
    ageYears: age.years,
    countryCode: player.countryCode,
    clock: world.clock,
    lifeStatus: world.lifeStatus,
    appearance: player.appearance,
    stage: lifeStage(age.years),
  };
}
