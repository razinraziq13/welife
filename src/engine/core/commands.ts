import { z } from 'zod';
import { deepClone } from './data';
import { assertInvariants } from './invariants';
import { advanceMonth, completePendingMonth, TickError, type TickReport } from './tick';
import { activeCharacter, addBiography, rememberCommand } from './world';
import { performActivity, type ActivityResult } from '../activities/activities';
import {
  CalendarError,
  cancelItem,
  cancelPlan,
  planActivity,
  scheduleItem,
} from '../calendar/calendar';
import { spendHours } from '../calendar/time';
import {
  JobError,
  applyForJob,
  prepareForInterview,
  quitJob,
  CREATIVE_PATHS,
  PROFESSION_PATHS,
  startCreativePath,
  startProfessionPath,
  requestRaise,
  respondToOffer,
  retire,
} from '../career/jobs';
import { WORK_ACTION_IDS, WorkActionError, performWorkAction } from '../career/workActions';
import {
  ActingError,
  PRODUCTION_ACTIONS,
  answerRenewal,
  audition,
  changeAgent,
  productionAction,
  answerCastingOffer,
  withdrawFromProduction,
} from '../career/acting';
import {
  AUDITION_APPROACHES,
  MATCH_APPROACHES,
  SPORTS,
  SPORT_TRAINING,
  MUSIC_GENRES,
  PROMO_LEVELS,
  RELEASE_TYPES,
  SONG_MOODS,
  STUDIOS,
} from '../state/schema';
import { SportError, answerTransfer, chooseSport, train, trial } from '../career/sport';
import {
  CaseworkError,
  declineCase,
  resolveCase,
  takeCase,
  takeLicenceExam,
  workOnCase,
} from '../career/casework';
import {
  MusicError,
  abandonSong,
  answerLabel,
  musicOf,
  playShow,
  recordSong,
  rehearseLive,
  formBand,
  leaveBand,
  hireManager,
  fireManager,
  startTour,
  releaseMusic,
  startSong,
  writeSession,
} from '../career/music';
import {
  LifestyleError,
  findLifestyle,
  performLifestyle,
  visitSalon,
} from '../activities/lifestyle';
import {
  FinanceError,
  LedgerError,
  buyInsurance,
  cancelInsurance,
  moveHome,
  moveOut,
  repayLoan,
  setLifestyle,
  setPensionContribution,
  startStudentLoan,
  takePensionLumpSum,
  takePersonalLoan,
  transferBetween,
} from '../economy/finance';
import {
  EducationError,
  applyForStudy,
  joinClub,
  leaveClub,
  leaveEducation,
  respondToStudyOffer,
} from '../education/school';
import { academicAction } from '../education/academicActions';
import { ChoiceError } from '../events/runtime';
import {
  BusinessError,
  acquireCompetitor,
  closeBranch,
  closeOwnBusiness,
  investInBusiness,
  openBranch,
  payDividend,
  raiseInvestment,
  repayBusinessLoan,
  sellBusiness,
  setManager,
  setMarketing,
  setPrice,
  setStaff,
  setStockTarget,
  setSupplier,
  launchProduct,
  answerClientOffer,
  researchMarket,
  updateProduct,
  discontinueProduct,
  startBusiness,
  takeBusinessLoan,
} from '../business/business';
import {
  BOND_TERMS,
  InvestmentError,
  buyBond,
  buyFund,
  liquidateInvestments,
  sellBond,
  sellFund,
} from '../economy/investments';
import {
  PropertyError,
  buyProperty,
  letProperty,
  listForSale,
  moveIntoProperty,
  renovate,
  stopLetting,
} from '../property/property';
import { familyHomeFor } from '../social/family';
import { HealthError, treat } from '../civics/health';
import { LawError, hireLawyer, setPlea } from '../civics/law';
import { MigrationError, applyForStatus, relocate, withdrawApplication } from '../civics/migration';
import {
  MilitaryError,
  SPECIALTIES,
  deferService,
  enlist,
  leaveService,
  reenlist,
  setServiceRole,
} from '../civics/military';
import {
  CAMPAIGN_ACTIONS,
  PoliticsError,
  campaign,
  joinParty,
  leaveParty,
  resign,
  seekOffice,
  withdrawCampaign,
} from '../civics/politics';
import { ReligionError, setParticipation, setReligion } from '../civics/religion';
import {
  ENGAGEMENTS,
  PATRONAGE_CAUSES,
  RoyalError,
  dropPatronage,
  takePatronage,
  undertakeEngagement,
  type EngagementKind,
} from '../civics/royal';
import { inCustody } from '../civics/status';
import { LegacyError, continueAs } from '../legacy/legacy';
import { WillError, setWill } from '../legacy/inheritance';
import { MediaError, answerOffer, closeProfile, createProfile, post } from '../media/media';
import { PackError, disablePack, enablePack } from '../content/packs';
import { checkAchievements } from '../achievements/achievements';
import { OFFICE_LEVELS, RELIGIONS } from '../world/institutions';
import { enforcePopulation } from '../social/population';
import { buyVehicle, sellVehicle, VehicleError } from '../economy/vehicles';
import { buyLotteryTicket, GamblingError, placeBet } from '../economy/gambling';
import { DatingPreferencesSchema } from '../social/datingPreferences';
import {
  INTERACTION_IDS,
  InteractionError,
  interact,
  lookForLove,
  meetNewPeople,
  respondToDatingProfile,
  type InteractionResult,
} from '../social/interactions';
import {
  APPEARANCE_LIMITS,
  APPLICATION_ROUTES,
  MEDIA_STYLES,
  DIFFICULTIES,
  FUNDS,
  HOME_SIZES,
  PARTICIPATION_LEVELS,
  SERVICE_BRANCHES,
  LIFESTYLES,
  STUDY_EFFORTS,
  WORK_EFFORTS,
  type World,
} from '../state/schema';

/**
 * Player commands (spec §2 "All gameplay writes go through validated commands").
 * Each command carries a unique id and is applied at most once (spec §4 Clock).
 */

const CommandId = z.string().min(4).max(80);
const EntityId = z.string().min(1).max(80);
const AmountMinor = z.string().regex(/^[1-9]\d{0,17}$/, 'Enter a whole amount in minor units.');

const command = <L extends string, T extends z.ZodRawShape>(type: L, shape: T) =>
  z.object({ type: z.literal(type), id: CommandId, ...shape }).strict();

export const CommandSchema = z.discriminatedUnion('type', [
  command('advance', { expectedTick: z.number().int().min(0) }),
  command('choose', { instanceId: EntityId, choiceId: z.string().min(1).max(40) }),
  command('act', { activityId: z.string().min(1).max(40) }),
  command('markRead', {
    notificationIds: z.union([z.literal('all'), z.array(EntityId).max(500)]),
  }),
  command('setDifficulty', { value: z.enum(DIFFICULTIES) }),
  command('setEasyMigration', { value: z.boolean() }),
  // Social (Milestone 3)
  command('interact', { personId: EntityId, interactionId: z.enum(INTERACTION_IDS) }),
  command('meetPeople', {}),
  command('lookForLove', { preferences: DatingPreferencesSchema.optional() }),
  command('respondToDatingProfile', { personId: EntityId, response: z.enum(['like', 'pass']) }),
  // Career play (gameplay expansion)
  command('workAction', { actionId: z.enum(WORK_ACTION_IDS) }),
  command('visitSalon', {
    hairStyle: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.hairStyle - 1),
    hairColor: z
      .number()
      .int()
      .min(0)
      .max(APPEARANCE_LIMITS.hairColor - 1)
      .nullable(),
  }),
  // Education (Milestone 3)
  command('setStudyEffort', { value: z.enum(STUDY_EFFORTS) }),
  command('academicAction', {
    action: z.enum(['coursework', 'groupProject', 'meetLecturer', 'research', 'internship']),
  }),
  command('joinClub', { clubId: z.string().min(1).max(40) }),
  command('leaveClub', { clubId: z.string().min(1).max(40) }),
  command('applyStudy', {
    programId: z.string().min(1).max(40),
    level: z.enum(['diploma', 'bachelor', 'master']),
    kind: z.enum(['public', 'private']).optional(),
  }),
  command('respondStudy', { applicationId: EntityId, accept: z.boolean() }),
  command('leaveSchool', {}),
  // Calendar (Milestone 3)
  command('planActivity', {
    activityId: z.string().min(1).max(40),
    timesPerMonth: z.number().int().min(1).max(4),
  }),
  command('cancelPlan', { planId: EntityId }),
  command('scheduleItem', {
    itemKind: z.enum(['vacation', 'checkup']),
    option: z.string().min(1).max(40),
    tick: z.number().int().min(0),
  }),
  command('cancelItem', { itemId: EntityId }),
  // Work (Milestone 4)
  command('applyJob', { postingId: EntityId }),
  command('prepareInterview', { applicationId: EntityId }),
  command('respondOffer', {
    applicationId: EntityId,
    response: z.enum(['accept', 'negotiate', 'decline', 'counter']),
  }),
  command('withdrawApplication', { applicationId: EntityId }),
  command('quitJob', {}),
  command('startCreativePath', { occupationId: z.enum(CREATIVE_PATHS) }),
  command('startProfessionPath', { path: z.enum(PROFESSION_PATHS) }),
  command('setWorkEffort', { value: z.enum(WORK_EFFORTS) }),
  command('requestRaise', {}),
  command('retire', {}),
  // Money (Milestone 4)
  command('transfer', { from: z.enum(['checking', 'savings']), amountMinor: AmountMinor }),
  command('takeLoan', { amountMinor: AmountMinor, termMonths: z.number().int().min(6).max(120) }),
  command('startStudentLoan', {}),
  command('repayLoan', { loanId: EntityId, amountMinor: AmountMinor }),
  command('buyInsurance', {
    policyType: z.enum(['health', 'life']),
    coverageMinor: z.union([AmountMinor, z.literal('0')]),
  }),
  command('cancelInsurance', { policyId: EntityId }),
  command('setLifestyle', { value: z.enum(LIFESTYLES) }),
  command('setPension', { bp: z.number().int().min(0).max(3000) }),
  command('takePensionLumpSum', {}),
  command('moveOut', { size: z.enum(HOME_SIZES) }),
  command('moveHome', {}),
  // Companies (Milestone 5)
  command('startBusiness', {
    typeId: z.string().min(1).max(40),
    locationId: EntityId,
    name: z.string().trim().min(1).max(60),
    capitalMinor: AmountMinor,
  }),
  command('openBranch', { businessId: EntityId, locationId: EntityId }),
  command('closeBranch', { businessId: EntityId, branchId: EntityId }),
  command('setStaff', {
    businessId: EntityId,
    branchId: EntityId,
    staff: z.number().int().min(0).max(500),
  }),
  command('setPrice', {
    businessId: EntityId,
    branchId: EntityId,
    pricePercent: z.number().int().min(50).max(250),
  }),
  command('setStock', {
    businessId: EntityId,
    branchId: EntityId,
    units: z.number().int().min(0).max(1_000_000),
  }),
  command('setMarketing', {
    businessId: EntityId,
    amountMinor: z.union([AmountMinor, z.literal('0')]),
  }),
  command('setSupplier', {
    businessId: EntityId,
    supplier: z.enum(['budget', 'standard', 'premium']),
  }),
  command('setManager', { businessId: EntityId, manager: z.enum(['owner', 'hired']) }),
  command('researchMarket', { businessId: EntityId }),
  command('answerClient', {
    businessId: EntityId,
    offerId: EntityId,
    accept: z.boolean(),
    scope: z.enum(['lean', 'thorough']),
  }),
  command('launchProduct', {
    businessId: EntityId,
    name: z.string().trim().min(1).max(40),
    pricePercent: z.number().int().min(50).max(250),
    supplier: z.enum(['budget', 'standard', 'premium']),
  }),
  command('updateProduct', {
    businessId: EntityId,
    productId: EntityId,
    pricePercent: z.number().int().min(50).max(250),
    supplier: z.enum(['budget', 'standard', 'premium']),
    stockTarget: z.number().int().min(0).max(1_000_000),
    marketingMinor: z.union([AmountMinor, z.literal('0')]),
  }),
  command('discontinueProduct', { businessId: EntityId, productId: EntityId }),
  command('investBusiness', { businessId: EntityId, amountMinor: AmountMinor }),
  command('payDividend', { businessId: EntityId, amountMinor: AmountMinor }),
  command('raiseInvestment', { businessId: EntityId, percent: z.number().int().min(5).max(49) }),
  command('sellBusiness', { businessId: EntityId }),
  command('closeBusiness', { businessId: EntityId }),
  command('acquireCompetitor', { businessId: EntityId, competitorId: EntityId }),
  command('businessLoan', {
    businessId: EntityId,
    amountMinor: AmountMinor,
    termMonths: z.number().int().min(6).max(120),
  }),
  command('repayBusinessLoan', {
    businessId: EntityId,
    loanId: EntityId,
    amountMinor: AmountMinor,
  }),
  // Property and investments (Milestone 5)
  command('buyProperty', {
    listingId: EntityId,
    depositMinor: AmountMinor,
    termMonths: z.number().int().min(60).max(360),
  }),
  command('moveIntoProperty', { propertyId: EntityId }),
  command('buyVehicle', { offerId: EntityId }),
  command('sellVehicle', { accountId: EntityId }),
  command('buyLotteryTicket', {}),
  command('audition', { listingId: EntityId, approach: z.enum(AUDITION_APPROACHES) }),
  command('answerCasting', {
    listingId: EntityId,
    response: z.enum(['accept', 'negotiate', 'decline']),
  }),
  command('productionAction', { action: z.enum(PRODUCTION_ACTIONS) }),
  command('leaveProduction', {}),
  command('answerRenewal', { accept: z.boolean() }),
  command('actingAgent', { sign: z.boolean() }),
  command('startSong', {
    title: z.string().trim().min(1).max(60),
    genre: z.enum(MUSIC_GENRES),
    mood: z.enum(SONG_MOODS),
    coWrite: z.boolean(),
  }),
  command('writeSong', { songId: EntityId }),
  command('abandonSong', { songId: EntityId }),
  command('recordSong', { songId: EntityId, studio: z.enum(STUDIOS) }),
  command('releaseMusic', {
    title: z.string().trim().max(60),
    kind: z.enum(RELEASE_TYPES),
    viaLabel: z.boolean(),
    promo: z.enum(PROMO_LEVELS),
  }),
  command('rehearseLive', {}),
  command('formBand', { name: z.string().trim().min(1).max(40) }),
  command('leaveBand', {}),
  command('hireManager', {}),
  command('fireManager', {}),
  command('startTour', {}),
  command('playShow', { venueId: EntityId }),
  command('answerLabel', { response: z.enum(['accept', 'negotiate', 'decline']) }),
  command('setMusicAutopilot', { value: z.boolean() }),
  command('chooseSport', { sport: z.enum(SPORTS) }),
  command('sportTrial', {}),
  command('answerTransfer', { accept: z.boolean() }),
  command('sportTrain', { kind: z.enum(SPORT_TRAINING) }),
  command('setSportApproach', { approach: z.enum(MATCH_APPROACHES) }),
  command('setSportAutopilot', { value: z.boolean() }),
  command('takeCase', { caseId: EntityId }),
  command('declineCase', { caseId: EntityId }),
  command('workOnCase', { caseId: EntityId, action: z.enum(['examine', 'clarify', 'prepare']) }),
  command('resolveCase', { caseId: EntityId, optionId: z.string().min(1).max(20) }),
  command('takeLicenceExam', { profession: z.enum(['law', 'medicine']) }),
  command('placeBet', { amountMinor: AmountMinor }),
  command('letProperty', { propertyId: EntityId, rentMinor: AmountMinor }),
  command('stopLetting', { propertyId: EntityId }),
  command('renovate', { propertyId: EntityId, level: z.enum(['light', 'major']) }),
  command('listProperty', { propertyId: EntityId, list: z.boolean() }),
  command('buyFund', { fund: z.enum(FUNDS), amountMinor: AmountMinor }),
  command('sellFund', { fund: z.enum(FUNDS), amountMinor: AmountMinor }),
  command('buyBond', {
    termMonths: z.union(BOND_TERMS.map((m) => z.literal(m))),
    amountMinor: AmountMinor,
  }),
  command('sellBond', { accountId: EntityId }),
  command('liquidateInvestments', {}),
  // Milestone 6: migration, health, law, religion, military, politics, royal duties.
  command('applyVisa', {
    countryCode: z.string().length(2),
    route: z.enum(APPLICATION_ROUTES),
    renounce: z.boolean(),
  }),
  command('withdrawVisa', { applicationId: EntityId }),
  command('relocate', { locationId: EntityId }),
  command('treatCondition', {
    conditionId: EntityId,
    care: z.enum(['public', 'private']),
    cure: z.boolean().optional(),
  }),
  command('hireLawyer', { caseId: EntityId, lawyer: z.enum(['none', 'legalAid', 'private']) }),
  command('setPlea', { caseId: EntityId, plea: z.enum(['guilty', 'notGuilty', 'settle']) }),
  command('setReligion', { religion: z.enum(RELIGIONS) }),
  command('setParticipation', { level: z.enum(PARTICIPATION_LEVELS) }),
  command('enlist', { branch: z.enum(SERVICE_BRANCHES), track: z.enum(['enlisted', 'officer']) }),
  command('deferService', {}),
  command('reenlist', {}),
  command('setServiceRole', {
    specialty: z.enum(SPECIALTIES),
    posting: z.enum(['home', 'overseas']),
  }),
  command('leaveService', {}),
  command('joinParty', { partyId: z.string().min(1).max(40) }),
  command('leaveParty', {}),
  command('seekOffice', { level: z.enum(OFFICE_LEVELS) }),
  command('campaign', { action: z.enum(CAMPAIGN_ACTIONS) }),
  command('withdrawCampaign', {}),
  command('resignOffice', {}),
  command('royalEngagement', {
    kind: z.enum(Object.keys(ENGAGEMENTS) as [EngagementKind, ...EngagementKind[]]),
  }),
  command('takePatronage', { cause: z.enum(PATRONAGE_CAUSES) }),
  command('dropPatronage', { cause: z.enum(PATRONAGE_CAUSES) }),
  // Milestones 7-8: legacy, wills, social media, content packs.
  command('continueAs', { characterId: EntityId }),
  command('setWill', {
    beneficiaries: z
      .array(
        z.object({ characterId: EntityId, sharesBp: z.number().int().min(1).max(10_000) }).strict(),
      )
      .min(1)
      .max(8),
  }),
  command('createProfile', {
    platformId: z.string().min(2).max(20),
    niche: z.string().min(2).max(20),
    handle: z.string().min(2).max(30),
  }),
  command('post', { profileId: EntityId, style: z.enum(MEDIA_STYLES) }),
  command('answerSponsor', { profileId: EntityId, accept: z.boolean() }),
  command('closeProfile', { profileId: EntityId }),
  /** The pack file is validated in full by the engine (content/packs.ts). */
  command('enablePack', { pack: z.unknown() }),
  command('disablePack', { packId: z.string().min(3).max(40) }),
]);
export type Command = z.infer<typeof CommandSchema>;

/** Committed world plus, while a decision is waiting, the uncommitted next month. */
export interface SimState {
  world: World;
  pending: World | null;
}

export type RejectReason =
  | 'duplicate'
  | 'stale'
  | 'pendingChoice'
  | 'noPendingChoice'
  | 'lifeEnded'
  | 'invalidChoice'
  | 'noChange'
  | 'ineligible';

export type CommandOutcome =
  | {
      status: 'rejected';
      reason: RejectReason;
      message: string;
      /** Localisation key (\`err.<ErrorName>.<code>\`) when the refusal has one (spec P-10). */
      key?: string;
    }
  | { status: 'applied'; kind: 'advanced'; report: TickReport }
  | { status: 'applied'; kind: 'pending'; report: TickReport; instanceId: string }
  | { status: 'applied'; kind: 'chosen' }
  /** A decision was made and another one is due in the same month. */
  | { status: 'applied'; kind: 'chainedChoice'; instanceId: string }
  | { status: 'applied'; kind: 'acted'; activity: ActivityResult }
  | { status: 'applied'; kind: 'rule' }
  | { status: 'applied'; kind: 'read'; count: number }
  | { status: 'applied'; kind: 'interacted'; interaction: InteractionResult }
  /** Other actions: a localisation key and parameters describing the result. */
  | { status: 'applied'; kind: 'done'; key: string; params: Record<string, string | number> };

/** True when the outcome moved the committed world into a new month (needs a snapshot). */
export function committedNewMonth(outcome: CommandOutcome): boolean {
  return outcome.status === 'applied' && (outcome.kind === 'advanced' || outcome.kind === 'chosen');
}

/** The localisation key of a domain error, e.g. "err.MigrationError.noStatus". */
function errorKey(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return error instanceof Error && typeof code === 'string'
    ? `err.${error.name}.${code}`
    : undefined;
}

function reject(state: SimState, reason: RejectReason, message: string, key?: string) {
  if (key)
    return { state, outcome: { status: 'rejected', reason, message, key } as CommandOutcome };
  return { state, outcome: { status: 'rejected', reason, message } as CommandOutcome };
}

function seen(state: SimState, id: string): boolean {
  return (
    state.world.recentCommandIds.includes(id) ||
    (state.pending?.recentCommandIds.includes(id) ?? false)
  );
}

class Ineligible extends Error {}

const done = (key: string, params: Record<string, string | number> = {}): CommandOutcome => ({
  status: 'applied',
  kind: 'done',
  key,
  params,
});

/** Actions that need freedom of movement (unavailable in custody, spec §4 Law). */
const BLOCKED_IN_CUSTODY = new Set<string>([
  'academicAction',
  'takeCase',
  'workOnCase',
  'resolveCase',
  'takeLicenceExam',
  'startSong',
  'writeSong',
  'recordSong',
  'releaseMusic',
  'rehearseLive',
  'playShow',
  'audition',
  'answerCasting',
  'productionAction',
  'actingAgent',
  'buyLotteryTicket',
  'placeBet',
  'meetPeople',
  'lookForLove',
  'respondToDatingProfile',
  'workAction',
  'joinClub',
  'applyStudy',
  'planActivity',
  'scheduleItem',
  'applyJob',
  'moveOut',
  'moveHome',
  'takeLoan',
  'startBusiness',
  'openBranch',
  'acquireCompetitor',
  'buyProperty',
  'buyVehicle',
  'sellVehicle',
  'moveIntoProperty',
  'joinParty',
  'campaign',
  'royalEngagement',
  'takePatronage',
]);

/** Repeats of an action this month (for diminishing returns on duties). */
function repeatsThisMonth(world: World, key: string): number {
  if (world.activity.tick !== world.tick) return 0;
  return world.activity.counts[key] ?? 0;
}

function countAction(world: World, key: string): void {
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  world.activity.counts[key] = (world.activity.counts[key] ?? 0) + 1;
}

/** Runs a player action on the world copy; domain errors become "ineligible" rejections. */
function playerAction(world: World, cmd: Command): CommandOutcome {
  const player = activeCharacter(world);
  if (BLOCKED_IN_CUSTODY.has(cmd.type) && inCustody(world, player))
    throw new Ineligible('You cannot do this while in custody.');
  switch (cmd.type) {
    case 'interact':
      return {
        status: 'applied',
        kind: 'interacted',
        interaction: interact(world, cmd.personId, cmd.interactionId),
      };
    case 'visitSalon': {
      const r = visitSalon(world, cmd.hairStyle, cmd.hairColor);
      return done(r.key, r.params);
    }
    case 'workAction': {
      const r = performWorkAction(world, player, cmd.actionId);
      return done(r.key, r.params);
    }
    case 'lookForLove': {
      const found = lookForLove(world, cmd.preferences);
      return done(
        found.personId
          ? 'out.foundSomeone'
          : found.noProfiles
            ? 'out.datingNoProfiles'
            : 'out.noOneSpecial',
        {
          personId: found.personId ?? '',
          name: found.personId ? (world.characters[found.personId]?.identity.firstName ?? '') : '',
        },
      );
    }
    case 'respondToDatingProfile':
      respondToDatingProfile(world, cmd.personId, cmd.response);
      return done(cmd.response === 'like' ? 'out.datingAppMatch' : 'out.datingAppPass', {
        name: world.characters[cmd.personId]?.identity.firstName ?? '',
      });
    case 'meetPeople': {
      const met = meetNewPeople(world);
      return done(met.personId ? 'out.metSomeone' : 'out.metNoOne', {
        personId: met.personId ?? '',
        name: met.personId ? (world.characters[met.personId]?.identity.firstName ?? '') : '',
      });
    }
    case 'academicAction':
      academicAction(world, player, cmd.action);
      return done('out.academicAction', { action: cmd.action });
    case 'setStudyEffort':
      if (!player.education.current)
        throw new EducationError('notStudying', 'You are not studying.');
      if (player.education.effort === cmd.value)
        throw new EducationError('noChange', 'That is already your setting.');
      player.education.effort = cmd.value;
      return done('out.studyEffort', { value: cmd.value });
    case 'joinClub':
      joinClub(world, player, cmd.clubId);
      return done('out.joinedClub', { clubId: cmd.clubId });
    case 'leaveClub':
      leaveClub(player, cmd.clubId);
      return done('out.leftClub', { clubId: cmd.clubId });
    case 'applyStudy':
      applyForStudy(world, player, cmd.programId, cmd.level, cmd.kind ?? 'public');
      return done('out.appliedStudy', { programId: cmd.programId, level: cmd.level });
    case 'respondStudy':
      respondToStudyOffer(world, player, cmd.applicationId, cmd.accept);
      return done(cmd.accept ? 'out.acceptedStudy' : 'out.declinedStudy');
    case 'leaveSchool':
      leaveEducation(world, player);
      return done('out.leftSchool');
    case 'planActivity':
      planActivity(world, cmd.activityId, cmd.timesPerMonth);
      return done('out.planned', { activityId: cmd.activityId, times: cmd.timesPerMonth });
    case 'cancelPlan':
      cancelPlan(world, cmd.planId);
      return done('out.planCancelled');
    case 'scheduleItem':
      scheduleItem(world, player, cmd.itemKind, cmd.option, cmd.tick);
      return done('out.scheduled', { kind: cmd.itemKind, option: cmd.option });
    case 'cancelItem':
      cancelItem(world, cmd.itemId);
      return done('out.itemCancelled');
    case 'applyJob': {
      const app = applyForJob(world, player, cmd.postingId);
      return done(app.status === 'interview' ? 'out.shortlisted' : 'out.applied', {
        employer: app.terms.employer,
      });
    }
    case 'prepareInterview': {
      if (!spendHours(world, 6)) throw new Ineligible('You have no free time left this month.');
      const level = prepareForInterview(world, player, cmd.applicationId);
      return done('out.prepared', { level });
    }
    case 'respondOffer': {
      const result = respondToOffer(world, player, cmd.applicationId, cmd.response);
      return done(`out.offer.${result}`);
    }
    case 'withdrawApplication': {
      const app = world.jobs.applications[cmd.applicationId];
      if (
        app?.characterId !== player.id ||
        (app.status !== 'applied' && app.status !== 'interview' && app.status !== 'offered')
      ) {
        throw new Ineligible('There is no application to withdraw.');
      }
      app.status = 'withdrawn';
      world.events.scheduled = world.events.scheduled.filter((s) => s.sourceInstanceId !== app.id);
      return done('out.withdrawn');
    }
    case 'quitJob':
      quitJob(world, player);
      return done('out.quit');
    case 'startProfessionPath':
      startProfessionPath(world, player, cmd.path);
      return done('out.professionPath', { path: cmd.path });
    case 'startCreativePath':
      startCreativePath(world, player, cmd.occupationId);
      return done('out.creativePath', { occupationId: cmd.occupationId });
    case 'setWorkEffort': {
      const job = player.employmentId ? world.employment[player.employmentId] : undefined;
      if (job?.status !== 'active') throw new JobError('noJob');
      if (job.effort === cmd.value) throw new JobError('noChange');
      job.effort = cmd.value;
      return done('out.workEffort', { value: cmd.value });
    }
    case 'requestRaise':
      return done(
        requestRaise(world, player) === 'granted' ? 'out.raiseGranted' : 'out.raiseRefused',
      );
    case 'retire':
      retire(world, player);
      return done('out.retired');
    case 'transfer':
      transferBetween(world, player, cmd.from, BigInt(cmd.amountMinor));
      return done('out.transferred');
    case 'takeLoan':
      takePersonalLoan(world, player, BigInt(cmd.amountMinor), cmd.termMonths);
      return done('out.loanTaken');
    case 'startStudentLoan':
      startStudentLoan(world, player);
      return done('out.studentLoan');
    case 'repayLoan':
      repayLoan(world, player, cmd.loanId, BigInt(cmd.amountMinor));
      return done('out.loanRepaid');
    case 'buyInsurance':
      buyInsurance(world, player, cmd.policyType, BigInt(cmd.coverageMinor));
      return done('out.insured', { type: cmd.policyType });
    case 'cancelInsurance':
      cancelInsurance(world, player, cmd.policyId);
      return done('out.insuranceCancelled');
    case 'setLifestyle':
      setLifestyle(world, player, cmd.value);
      return done('out.lifestyle', { value: cmd.value });
    case 'setPension':
      setPensionContribution(world, player, cmd.bp);
      return done('out.pension', { bp: cmd.bp });
    case 'takePensionLumpSum': {
      takePensionLumpSum(world, player);
      return done('out.pensionLumpSum');
    }
    case 'moveOut':
      moveOut(world, player, cmd.size);
      return done('out.movedOut', { size: cmd.size });
    case 'moveHome': {
      const family = familyHomeFor(world, player);
      if (!family) throw new FinanceError('cannotMoveHome');
      moveHome(world, player, family);
      return done('out.movedHome');
    }
    case 'startBusiness': {
      const business = startBusiness(world, player, {
        typeId: cmd.typeId,
        locationId: cmd.locationId,
        name: cmd.name,
        capitalMinor: BigInt(cmd.capitalMinor),
      });
      return done('out.businessStarted', { business: business.name, businessId: business.id });
    }
    case 'openBranch':
      openBranch(world, player, cmd.businessId, cmd.locationId);
      return done('out.branchOpened');
    case 'closeBranch':
      closeBranch(world, player, cmd.businessId, cmd.branchId);
      return done('out.branchClosed');
    case 'setStaff':
      setStaff(world, player, cmd.businessId, cmd.branchId, cmd.staff);
      return done('out.staffSet', { staff: cmd.staff });
    case 'setPrice':
      setPrice(world, player, cmd.businessId, cmd.branchId, cmd.pricePercent);
      return done('out.priceSet', { percent: cmd.pricePercent });
    case 'setStock':
      setStockTarget(world, player, cmd.businessId, cmd.branchId, cmd.units);
      return done('out.stockSet', { units: cmd.units });
    case 'setMarketing':
      setMarketing(world, player, cmd.businessId, BigInt(cmd.amountMinor));
      return done('out.marketingSet');
    case 'setSupplier':
      setSupplier(world, player, cmd.businessId, cmd.supplier);
      return done('out.supplierSet', { supplier: cmd.supplier });
    case 'researchMarket':
      researchMarket(world, player, cmd.businessId);
      return done('out.marketResearched');
    case 'answerClient':
      answerClientOffer(world, player, cmd.businessId, cmd.offerId, cmd.accept, cmd.scope);
      return done(cmd.accept ? 'out.clientSigned' : 'out.clientDeclined');
    case 'launchProduct':
      launchProduct(world, player, cmd.businessId, cmd.name, cmd.pricePercent, cmd.supplier);
      return done('out.productLaunched', { name: cmd.name });
    case 'updateProduct':
      updateProduct(world, player, cmd.businessId, cmd.productId, {
        pricePercent: cmd.pricePercent,
        supplier: cmd.supplier,
        stockTarget: cmd.stockTarget,
        marketingMinor: BigInt(cmd.marketingMinor),
      });
      return done('out.productUpdated');
    case 'discontinueProduct':
      discontinueProduct(world, player, cmd.businessId, cmd.productId);
      return done('out.productDropped');
    case 'setManager':
      setManager(world, player, cmd.businessId, cmd.manager);
      return done(cmd.manager === 'hired' ? 'out.managerHired' : 'out.managerSelf');
    case 'investBusiness':
      investInBusiness(world, player, cmd.businessId, BigInt(cmd.amountMinor));
      return done('out.businessInvested');
    case 'payDividend':
      payDividend(world, player, cmd.businessId, BigInt(cmd.amountMinor));
      return done('out.dividendPaid');
    case 'raiseInvestment': {
      const investor = raiseInvestment(world, player, cmd.businessId, cmd.percent);
      return done('out.investmentRaised', {
        name: investor.identity.firstName,
        percent: cmd.percent,
      });
    }
    case 'sellBusiness': {
      const price = sellBusiness(world, player, cmd.businessId);
      return done('out.businessSold', { amount: price.toString() });
    }
    case 'closeBusiness':
      closeOwnBusiness(world, player, cmd.businessId);
      return done('out.businessClosed');
    case 'acquireCompetitor':
      acquireCompetitor(world, player, cmd.businessId, cmd.competitorId);
      return done('out.acquired');
    case 'businessLoan':
      takeBusinessLoan(world, player, cmd.businessId, BigInt(cmd.amountMinor), cmd.termMonths);
      return done('out.loanTaken');
    case 'repayBusinessLoan':
      repayBusinessLoan(world, player, cmd.businessId, cmd.loanId, BigInt(cmd.amountMinor));
      return done('out.loanRepaid');
    case 'buyProperty':
      buyProperty(world, player, cmd.listingId, BigInt(cmd.depositMinor), cmd.termMonths);
      return done('out.propertyBought');
    case 'buyVehicle': {
      const vehicle = buyVehicle(world, player, cmd.offerId);
      return done('out.vehicleBought', { name: vehicle.name });
    }
    case 'sellVehicle':
      return done('out.vehicleSold', { name: sellVehicle(world, player, cmd.accountId) });
    case 'audition':
      return done(`out.acting.${audition(world, player, cmd.listingId, cmd.approach).feedback}`);
    case 'answerCasting':
      return done(`out.acting.${answerCastingOffer(world, player, cmd.listingId, cmd.response)}`);
    case 'productionAction':
      return done(`out.acting.${productionAction(world, player, cmd.action)}`);
    case 'leaveProduction':
      withdrawFromProduction(world, player);
      return done('out.acting.left');
    case 'answerRenewal':
      answerRenewal(world, player, cmd.accept);
      return done(cmd.accept ? 'out.acting.renewed' : 'out.acting.leftShow');
    case 'actingAgent': {
      const yes = changeAgent(world, player, cmd.sign);
      if (!cmd.sign) return done('out.acting.agentFired');
      return done(yes ? 'out.acting.agentSigned' : 'out.acting.agentDeclined');
    }
    case 'startSong':
      return done('out.music.started', {
        title: startSong(world, player, cmd.title, cmd.genre, cmd.mood, cmd.coWrite).title,
      });
    case 'writeSong': {
      const song = writeSession(world, player, cmd.songId);
      return done(song.progress >= 100 ? 'out.music.finished' : 'out.music.wrote', {
        title: song.title,
        progress: song.progress,
      });
    }
    case 'abandonSong':
      abandonSong(player, cmd.songId);
      return done('out.music.abandoned');
    case 'recordSong':
      return done('out.music.recording', {
        title: recordSong(world, player, cmd.songId, cmd.studio).title,
      });
    case 'releaseMusic':
      return done('out.music.released', {
        title: releaseMusic(world, player, cmd.title, cmd.kind, cmd.viaLabel, cmd.promo).title,
      });
    case 'formBand':
      formBand(world, player, cmd.name);
      return done('out.music.bandFormed', { band: cmd.name });
    case 'leaveBand':
      leaveBand(player);
      return done('out.music.bandLeft');
    case 'hireManager':
      hireManager(world, player);
      return done('out.music.managerHired');
    case 'fireManager':
      fireManager(player);
      return done('out.music.managerFired');
    case 'startTour':
      startTour(world, player);
      return done('out.music.tourStarted');
    case 'rehearseLive':
      return done('out.music.rehearsed', { prep: rehearseLive(world, player) });
    case 'playShow': {
      const r = playShow(world, player, cmd.venueId);
      return done(r.net >= 0n ? 'out.music.showProfit' : 'out.music.showLoss', {
        venue: r.venue,
        attendance: r.attendance,
        amount: (r.net >= 0n ? r.net : -r.net).toString(),
      });
    }
    case 'answerLabel':
      return done(`out.music.${answerLabel(world, player, cmd.response)}`);
    case 'chooseSport':
      chooseSport(world, player, cmd.sport);
      return done('out.sport.chosen', { sport: cmd.sport });
    case 'answerTransfer':
      return done(`out.sport.transfer.${answerTransfer(world, player, cmd.accept)}`);
    case 'sportTrial':
      return done(trial(world, player) ? 'out.sport.signed' : 'out.sport.rejected', {
        why: player.career.sport?.lastResult ?? '',
      });
    case 'sportTrain':
      train(world, player, cmd.kind);
      return done(`out.sport.${cmd.kind}`);
    case 'setSportApproach':
      if (!player.career.sport) throw new SportError('noSport');
      player.career.sport.approach = cmd.approach;
      return done('out.sport.approach', { approach: cmd.approach });
    case 'setSportAutopilot':
      if (!player.career.sport) throw new SportError('noSport');
      player.career.sport.autopilot = cmd.value;
      return done(cmd.value ? 'out.sport.autoOn' : 'out.sport.autoOff');
    case 'takeCase':
      return done('out.case.taken', { title: takeCase(world, player, cmd.caseId).title });
    case 'declineCase':
      declineCase(player, cmd.caseId);
      return done('out.case.declined');
    case 'workOnCase':
      return done(`out.case.${workOnCase(world, player, cmd.caseId, cmd.action)}`);
    case 'resolveCase': {
      const r = resolveCase(world, player, cmd.caseId, cmd.optionId);
      return done(`out.case.${r.outcome}`, { title: r.title, why: r.why });
    }
    case 'takeLicenceExam':
      return done(
        takeLicenceExam(world, player, cmd.profession)
          ? 'out.licence.passed'
          : 'out.licence.failed',
      );
    case 'setMusicAutopilot':
      musicOf(player).autopilot = cmd.value;
      return done(cmd.value ? 'out.music.autopilotOn' : 'out.music.autopilotOff');
    case 'buyLotteryTicket': {
      const prize = buyLotteryTicket(world, player);
      return done(prize > 0n ? 'out.lotteryWon' : 'out.lotteryLost', { amount: prize.toString() });
    }
    case 'placeBet': {
      const prize = placeBet(world, player, BigInt(cmd.amountMinor));
      return done(prize > 0n ? 'out.betWon' : 'out.betLost', {
        amount: (prize > 0n ? prize : BigInt(cmd.amountMinor)).toString(),
      });
    }
    case 'moveIntoProperty':
      moveIntoProperty(world, player, cmd.propertyId);
      return done('out.movedIntoProperty');
    case 'letProperty':
      letProperty(world, player, cmd.propertyId, BigInt(cmd.rentMinor));
      return done('out.propertyLet');
    case 'stopLetting':
      stopLetting(world, player, cmd.propertyId);
      return done('out.stoppedLetting');
    case 'renovate':
      renovate(world, player, cmd.propertyId, cmd.level);
      return done('out.renovationStarted', { level: cmd.level });
    case 'listProperty':
      listForSale(world, player, cmd.propertyId, cmd.list);
      return done(cmd.list ? 'out.propertyListed' : 'out.propertyUnlisted');
    case 'buyFund':
      buyFund(world, player, cmd.fund, BigInt(cmd.amountMinor));
      return done('out.fundBought', { fund: cmd.fund });
    case 'sellFund':
      sellFund(world, player, cmd.fund, BigInt(cmd.amountMinor));
      return done('out.fundSold', { fund: cmd.fund });
    case 'buyBond':
      buyBond(world, player, cmd.termMonths, BigInt(cmd.amountMinor));
      return done('out.bondBought', { years: cmd.termMonths / 12 });
    case 'sellBond':
      sellBond(world, player, cmd.accountId);
      return done('out.bondSold');
    case 'liquidateInvestments':
      liquidateInvestments(world, player);
      return done('out.investmentsLiquidated');
    case 'applyVisa': {
      const app = applyForStatus(world, player, cmd.countryCode, cmd.route, cmd.renounce);
      return done('out.visaApplied', {
        country: cmd.countryCode,
        route: cmd.route,
        months: app.decisionTick - world.tick,
      });
    }
    case 'withdrawVisa':
      withdrawApplication(world, player, cmd.applicationId);
      return done('out.visaWithdrawn');
    case 'relocate':
      relocate(world, player, cmd.locationId);
      return done('out.relocated', { locationId: cmd.locationId });
    case 'treatCondition':
      treat(world, player, cmd.conditionId, cmd.care, cmd.cure);
      return done(cmd.care === 'public' ? 'out.treatmentPublic' : 'out.treatmentPrivate');
    case 'hireLawyer':
      hireLawyer(world, player, cmd.caseId, cmd.lawyer);
      return done('out.lawyer', { lawyer: cmd.lawyer });
    case 'setPlea':
      setPlea(world, player, cmd.caseId, cmd.plea);
      return done('out.plea', { plea: cmd.plea });
    case 'setReligion':
      setReligion(world, player, cmd.religion);
      return done('out.religion', { religion: cmd.religion });
    case 'setParticipation':
      setParticipation(world, player, cmd.level);
      return done('out.participation', { level: cmd.level });
    case 'enlist':
      enlist(world, player, cmd.branch, cmd.track);
      return done('out.enlisted', { branch: cmd.branch });
    case 'deferService':
      deferService(world, player);
      return done('out.deferred');
    case 'reenlist':
      reenlist(world, player);
      return done('out.reenlisted');
    case 'setServiceRole':
      setServiceRole(world, player, cmd.specialty, cmd.posting);
      return done('out.serviceRole', { specialty: cmd.specialty, posting: cmd.posting });
    case 'leaveService':
      leaveService(world, player);
      return done('out.leftService');
    case 'joinParty':
      joinParty(world, player, cmd.partyId);
      return done('out.joinedParty');
    case 'leaveParty':
      leaveParty(world, player);
      return done('out.leftParty');
    case 'seekOffice':
      seekOffice(world, player, cmd.level);
      return done('out.seekingOffice', { level: cmd.level });
    case 'campaign': {
      const gain = campaign(world, player, cmd.action, (h) => spendHours(world, h));
      return done('out.campaigned', { action: cmd.action, gain: Math.round(gain / 10) });
    }
    case 'withdrawCampaign':
      withdrawCampaign(world, player);
      return done('out.campaignWithdrawn');
    case 'resignOffice':
      resign(world, player);
      return done('out.resigned');
    case 'royalEngagement': {
      const key = `duty:${cmd.kind}`;
      const gain = undertakeEngagement(
        world,
        player,
        cmd.kind,
        (h) => spendHours(world, h),
        repeatsThisMonth(world, key),
      );
      countAction(world, key);
      return done('out.engagement', { kind: cmd.kind, gain: Math.round(gain / 10) });
    }
    case 'takePatronage':
      takePatronage(world, player, cmd.cause);
      return done('out.patronage', { cause: cmd.cause });
    case 'dropPatronage':
      dropPatronage(world, player, cmd.cause);
      return done('out.patronageDropped', { cause: cmd.cause });
    case 'setWill':
      setWill(world, player, cmd.beneficiaries);
      return done('out.will');
    case 'createProfile':
      createProfile(world, player, cmd.platformId, cmd.niche, cmd.handle);
      return done('out.profileCreated');
    case 'post': {
      const key = `post:${cmd.profileId}`;
      const gain = post(
        world,
        player,
        cmd.profileId,
        cmd.style,
        (h) => spendHours(world, h),
        repeatsThisMonth(world, key),
      );
      countAction(world, key);
      return done(gain >= 0 ? 'out.posted' : 'out.postBackfired', { gain: Math.abs(gain) });
    }
    case 'answerSponsor':
      answerOffer(world, player, cmd.profileId, cmd.accept);
      return done(cmd.accept ? 'out.sponsorAccepted' : 'out.sponsorDeclined');
    case 'closeProfile':
      closeProfile(world, player, cmd.profileId);
      return done('out.profileClosed');
    case 'enablePack': {
      const record = enablePack(world, cmd.pack);
      return done('out.packEnabled', { name: record.name, version: record.packVersion });
    }
    case 'disablePack':
      disablePack(world, cmd.packId);
      return done('out.packDisabled');
    default:
      throw new Ineligible('Unknown action.');
  }
}

const DOMAIN_ERRORS = [
  Ineligible,
  EducationError,
  JobError,
  FinanceError,
  LedgerError,
  InteractionError,
  WorkActionError,
  LifestyleError,
  CalendarError,
  BusinessError,
  PropertyError,
  VehicleError,
  GamblingError,
  ActingError,
  MusicError,
  CaseworkError,
  SportError,
  InvestmentError,
  MigrationError,
  HealthError,
  LawError,
  ReligionError,
  MilitaryError,
  PoliticsError,
  RoyalError,
  LegacyError,
  WillError,
  MediaError,
  PackError,
];

/**
 * Applies one command. Pure: returns a new state and never modifies the input.
 * Replaying the same commands from the same state always yields the same result.
 */
export function execute(
  state: SimState,
  command: Command,
): { state: SimState; outcome: CommandOutcome } {
  if (seen(state, command.id))
    return reject(state, 'duplicate', 'This command was already applied.');

  if (command.type === 'choose') {
    if (!state.pending) return reject(state, 'noPendingChoice', 'No decision is waiting.');
    try {
      const world = completePendingMonth(state.pending, command.instanceId, command.choiceId);
      rememberCommand(world, command.id);
      const next = world.events.pendingInstanceId;
      if (next !== null) {
        // Another decision is due this month: the month stays uncommitted until it is made.
        return {
          state: { world: state.world, pending: world },
          outcome: { status: 'applied', kind: 'chainedChoice', instanceId: next },
        };
      }
      return { state: { world, pending: null }, outcome: { status: 'applied', kind: 'chosen' } };
    } catch (error) {
      if (error instanceof ChoiceError) return reject(state, 'invalidChoice', error.message);
      throw error;
    }
  }

  if (state.pending) return reject(state, 'pendingChoice', 'Make the waiting decision first.');

  if (command.type === 'advance') {
    if (state.world.lifeStatus !== 'alive')
      return reject(state, 'lifeEnded', 'This life has ended.');
    // Double clicks and retries carry the tick they were issued for; only the first applies.
    if (command.expectedTick !== state.world.tick) {
      return reject(state, 'stale', 'The month has already advanced.');
    }
    try {
      const result = advanceMonth(state.world);
      rememberCommand(result.world, command.id);
      if (result.kind === 'pending') {
        return {
          state: { world: state.world, pending: result.world },
          outcome: {
            status: 'applied',
            kind: 'pending',
            report: result.report,
            instanceId: result.report.pendingInstanceId ?? '',
          },
        };
      }
      return {
        state: { world: result.world, pending: null },
        outcome: { status: 'applied', kind: 'advanced', report: result.report },
      };
    } catch (error) {
      if (error instanceof TickError) {
        return reject(
          state,
          error.code === 'LIFE_ENDED' ? 'lifeEnded' : 'pendingChoice',
          error.message,
        );
      }
      throw error;
    }
  }

  if (command.type === 'continueAs') {
    if (state.world.lifeStatus === 'ended')
      return reject(state, 'lifeEnded', 'This life has ended.');
    const next = deepClone(state.world);
    try {
      continueAs(next, command.characterId);
      checkAchievements(next);
    } catch (error) {
      if (error instanceof LegacyError) return reject(state, 'ineligible', error.message);
      throw error;
    }
    rememberCommand(next, command.id);
    assertInvariants(next);
    return {
      state: { world: next, pending: null },
      outcome: {
        status: 'applied',
        kind: 'done',
        key: 'out.continued',
        params: { characterId: command.characterId },
      },
    };
  }

  const world = deepClone(state.world);
  let outcome: CommandOutcome;
  switch (command.type) {
    case 'act': {
      if (world.lifeStatus !== 'alive') return reject(state, 'lifeEnded', 'This life has ended.');
      if (findLifestyle(command.activityId)) {
        try {
          const r = performLifestyle(world, command.activityId);
          outcome = { status: 'applied', kind: 'done', key: r.key, params: r.params };
        } catch (error) {
          if (error instanceof LifestyleError)
            return reject(state, 'ineligible', error.message, errorKey(error));
          throw error;
        }
        break;
      }
      outcome = {
        status: 'applied',
        kind: 'acted',
        activity: performActivity(world, command.activityId),
      };
      break;
    }
    case 'markRead': {
      let count = 0;
      const ids = command.notificationIds === 'all' ? null : new Set(command.notificationIds);
      for (const n of world.notifications) {
        if (!n.read && (ids === null || ids.has(n.id))) {
          n.read = true;
          count += 1;
        }
      }
      outcome = { status: 'applied', kind: 'read', count };
      break;
    }
    case 'setDifficulty':
    case 'setEasyMigration': {
      const rule = command.type === 'setDifficulty' ? 'difficulty' : 'easyMigration';
      const from = world.rules[rule];
      if (from === command.value)
        return reject(state, 'noChange', 'That setting is already selected.');
      if (rule === 'difficulty')
        world.rules.difficulty = command.value as World['rules']['difficulty'];
      else world.rules.easyMigration = command.value as boolean;
      // Rule changes are part of the timeline (spec §5); they never alter existing status.
      world.ruleChanges.push({ tick: world.tick, rule, from, to: command.value });
      addBiography(world, world.activeCharacterId, 'rules', 'bio.ruleChange', {
        rule,
        value: String(command.value),
      });
      outcome = { status: 'applied', kind: 'rule' };
      break;
    }
    default: {
      if (world.lifeStatus !== 'alive') return reject(state, 'lifeEnded', 'This life has ended.');
      try {
        outcome = playerAction(world, command);
        enforcePopulation(world);
      } catch (error) {
        if (DOMAIN_ERRORS.some((E) => error instanceof E)) {
          return reject(state, 'ineligible', (error as Error).message, errorKey(error));
        }
        throw error;
      }
    }
  }
  rememberCommand(world, command.id);
  assertInvariants(world);
  return { state: { world, pending: null }, outcome };
}

/** Replays commands from a state (spec §5: identical commands reproduce identical outcomes). */
export function replay(
  initial: SimState,
  commands: readonly Command[],
): { state: SimState; outcomes: CommandOutcome[] } {
  let state = initial;
  const outcomes: CommandOutcome[] = [];
  for (const command of commands) {
    const result = execute(state, command);
    state = result.state;
    outcomes.push(result.outcome);
  }
  return { state, outcomes };
}
