import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { ageYears, withRng } from '../core/world';
import { changeNeed, changeSkill, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { categoryAccount, post } from '../economy/ledger';
import { payExpense, payerFor } from '../economy/finance';
import { activeEmployment, promote } from '../career/jobs';
import { getOccupation } from '../career/occupations';
import { adjustFamilyCloseness } from '../events/effects';
import type { Character, RelationType, Relationship, SkillKey, World } from '../state/schema';
import { shareMoment } from './family';
import { addMemory, memoriesAbout } from './memories';
import { adjustPair } from './relationships';

/**
 * Contextual interactions (gameplay expansion, feature 2): social, family, friendship,
 * romance and professional actions that build on relationships, memories, money and work.
 * Each has preconditions, a time cost, sometimes a money cost, and outcomes that depend on the
 * other person's state (their agreeableness, trust, stress, conflict, memories, money) as well
 * as yours, drawn from the seeded `social` stream. Nothing is guaranteed to go well.
 * All numbers are PROPOSED TUNING.
 */

export const CONTEXTUAL_IDS = [
  'shareSecret',
  'askFavour',
  'gossip',
  'reconcile',
  'askMoney',
  'askPermission',
  'familyGathering',
  'supportRelative',
  'collaborate',
  'discussFuture',
  'talkItThrough',
  'negotiateSalary',
  'askPromotion',
  'network',
  'askMentoring',
] as const;
export type ContextualId = (typeof CONTEXTUAL_IDS)[number];

export const CONTEXTUAL: Record<ContextualId, { hours: number; minAge: number }> = {
  shareSecret: { hours: 2, minAge: 10 },
  askFavour: { hours: 1, minAge: 6 },
  gossip: { hours: 1, minAge: 10 },
  reconcile: { hours: 3, minAge: 8 },
  askMoney: { hours: 1, minAge: 6 },
  askPermission: { hours: 1, minAge: 6 },
  familyGathering: { hours: 6, minAge: 16 },
  supportRelative: { hours: 5, minAge: 12 },
  collaborate: { hours: 6, minAge: 8 },
  discussFuture: { hours: 2, minAge: 18 },
  talkItThrough: { hours: 2, minAge: 8 },
  negotiateSalary: { hours: 2, minAge: 15 },
  askPromotion: { hours: 2, minAge: 15 },
  network: { hours: 3, minAge: 16 },
  askMentoring: { hours: 4, minAge: 14 },
};

export type ContextualBlock =
  | 'notFamily'
  | 'notParent'
  | 'grownUp'
  | 'noAccount'
  | 'theyCannotAfford'
  | 'tooSoon'
  | 'noRift'
  | 'nothingToResolve'
  | 'noJob'
  | 'notYourManager'
  | 'notColleague'
  | 'topLevel'
  | 'notLongEnough'
  | 'performanceTooLow'
  | 'notMoreExperienced';

export const CONTEXTUAL_BLOCK_MESSAGES: Record<ContextualBlock, string> = {
  notFamily: 'Only with a family member.',
  notParent: 'Only with a parent.',
  grownUp: 'You are an adult now and decide this yourself.',
  noAccount: 'You do not have an account to receive money yet.',
  theyCannotAfford: 'They have no money to spare right now.',
  tooSoon: 'You asked recently; give it a few months.',
  noRift: 'There is no falling-out to mend.',
  nothingToResolve: 'There is no disagreement to talk through.',
  noJob: 'You need a job for this.',
  notYourManager: 'Only with your manager.',
  notColleague: 'Only with a colleague or someone in your field.',
  topLevel: 'You are already at the top level of this career.',
  notLongEnough: 'You need at least a year in this role first.',
  performanceTooLow: 'Your performance needs to be at least 60 first.',
  notMoreExperienced: 'They need to be older and more experienced than you.',
};

/** What each new interaction is about (person screen groups). */
export type InteractionGroup = 'social' | 'family' | 'friendship' | 'romance' | 'professional';

const PARENT_TYPES: ReadonlySet<RelationType> = new Set(['parent']);
const MONEY_GIVERS: ReadonlySet<RelationType> = new Set([
  'parent',
  'grandparent',
  'sibling',
  'auntUncle',
]);
const WORK_TYPES: ReadonlySet<RelationType> = new Set(['colleague', 'manager']);

export interface InteractionContext {
  rel: Relationship;
  relation: RelationType | null;
  isFamily: boolean;
  isPartner: boolean;
  age: number;
  theirAge: number;
}

/** Months since the newest memory of `key` that `owner` keeps about `subject` (or Infinity). */
function monthsSince(world: World, owner: string, subject: string, key: string): number {
  const last = memoriesAbout(world, owner, subject)
    .filter((m) => m.key === key)
    .reduce((t, m) => Math.max(t, m.tick), -1);
  return last < 0 ? Number.POSITIVE_INFINITY : world.tick - last;
}

function hasRift(world: World, player: Character, other: Character, rel: Relationship): boolean {
  if (rel.conflict >= 40) return true;
  return (
    rel.closeness < 30 && memoriesAbout(world, other.id, player.id).some((m) => m.valence <= -30)
  );
}

function playerAccount(player: Character): string | null {
  return player.finance?.checkingId ?? player.finance?.savingsId ?? null;
}

function theirMoney(
  world: World,
  other: Character,
): { ownerId: string; checkingId: string } | null {
  const h = world.households[other.householdId]?.finance;
  return h ? { ownerId: other.householdId, checkingId: h.checkingId } : null;
}

function balance(world: World, id: string): bigint {
  return world.ledger.accounts[id]?.balance ?? 0n;
}

/** How much a request for money is for, by age (a share of the median monthly wage). */
export function askMoneyAmount(world: World, player: Character): bigint {
  const age = ageYears(world, player);
  const percent = age < 13 ? 1 : age < 18 ? 3 : 15;
  return applyPercent(medianWage(world, player.countryCode), percent);
}

export function gatheringCost(world: World, player: Character): bigint {
  return applyPercent(medianWage(world, player.countryCode), 3);
}

function canPay(world: World, player: Character, amount: bigint): boolean {
  const payer = payerFor(world, player);
  if (!payer) return false;
  const savings = payer.savingsId ? balance(world, payer.savingsId) : 0n;
  return balance(world, payer.checkingId) + savings >= amount;
}

/** Why a contextual interaction is unavailable (beyond age and time, checked by the caller). */
export function contextualBlock(
  world: World,
  player: Character,
  other: Character,
  id: ContextualId,
  ctx: InteractionContext,
):
  | ContextualBlock
  | 'targetTooYoung'
  | 'notClose'
  | 'notFriends'
  | 'notPartner'
  | 'cannotAfford'
  | null {
  const { rel, relation, isFamily, isPartner, age, theirAge } = ctx;
  const job = activeEmployment(world, player);
  switch (id) {
    case 'shareSecret':
      if (theirAge < 10) return 'targetTooYoung';
      return rel.closeness < 50 ? 'notClose' : null;
    case 'askFavour':
      if (theirAge < 8) return 'targetTooYoung';
      if (rel.closeness < 35) return 'notClose';
      return monthsSince(world, other.id, player.id, 'didFavour') < 3 ? 'tooSoon' : null;
    case 'gossip':
      return theirAge < 10 ? 'targetTooYoung' : null;
    case 'reconcile':
      return hasRift(world, player, other, rel) ? null : 'noRift';
    case 'askMoney': {
      if (!relation || !MONEY_GIVERS.has(relation)) return 'notFamily';
      if (relation === 'sibling' && theirAge < 18) return 'theyCannotAfford';
      if (!playerAccount(player)) return 'noAccount';
      const money = theirMoney(world, other);
      if (
        !money ||
        (money.ownerId === player.householdId &&
          world.households[player.householdId]?.finance?.headId === player.id)
      )
        return 'theyCannotAfford';
      if (balance(world, money.checkingId) < askMoneyAmount(world, player) * 3n)
        return 'theyCannotAfford';
      return monthsSince(world, other.id, player.id, 'gaveMoney') < 6 ? 'tooSoon' : null;
    }
    case 'askPermission':
      if (age >= 18) return 'grownUp';
      return relation && PARENT_TYPES.has(relation) ? null : 'notParent';
    case 'familyGathering':
      if (!isFamily) return 'notFamily';
      return canPay(world, player, gatheringCost(world, player)) ? null : 'cannotAfford';
    case 'supportRelative':
      if (!isFamily) return 'notFamily';
      return theirAge < 3 ? 'targetTooYoung' : null;
    case 'collaborate':
      if (rel.type !== 'friend') return 'notFriends';
      return theirAge < 8 ? 'targetTooYoung' : null;
    case 'discussFuture':
      return isPartner ? null : 'notPartner';
    case 'talkItThrough':
      return rel.conflict < 25 ? 'nothingToResolve' : null;
    case 'negotiateSalary':
      if (!job) return 'noJob';
      if (job.managerId !== other.id) return 'notYourManager';
      return job.raiseRequestedTick !== null && world.tick - job.raiseRequestedTick < 12
        ? 'tooSoon'
        : null;
    case 'askPromotion': {
      if (!job) return 'noJob';
      if (job.managerId !== other.id) return 'notYourManager';
      if (job.terms.level >= getOccupation(job.terms.occupationId).maxLevel) return 'topLevel';
      if (world.tick - (job.levelStartTick ?? job.startTick) < 12) return 'notLongEnough';
      if (job.performance < 600) return 'performanceTooLow';
      return monthsSince(world, other.id, player.id, 'askedForPromotion') < 12 ? 'tooSoon' : null;
    }
    case 'network': {
      if (WORK_TYPES.has(rel.type)) return null;
      const theirJob = activeEmployment(world, other);
      return job && theirJob?.terms.industryId === job.terms.industryId ? null : 'notColleague';
    }
    case 'askMentoring':
      if (!WORK_TYPES.has(rel.type) && rel.type !== 'teacher') return 'notColleague';
      if (theirAge <= age) return 'notMoreExperienced';
      return rel.closeness < 40 ? 'notClose' : null;
  }
  return null;
}

export interface ContextualOutcome {
  outcome: 'success' | 'mixed' | 'failure';
  key: string;
  params?: Record<string, string | number>;
}

/** The player's strongest creative or practical skill, for working on something together. */
function sharedSkill(player: Character): SkillKey {
  const options: SkillKey[] = ['art', 'music', 'technology', 'craft', 'science', 'reading'];
  return options.reduce((best, k) => (player.skills[k] > player.skills[best] ? k : best), 'art');
}

/** Applies a contextual interaction (preconditions already checked). */
export function contextualOutcome(
  world: World,
  player: Character,
  other: Character,
  id: ContextualId,
  ctx: InteractionContext,
  percent: number,
  source: string,
): ContextualOutcome {
  const { rel } = ctx;
  const scale = (n: number) => Math.trunc((n * percent) / 100);
  const agree = other.traits.agreeableness;
  const roll = () => withRng(world, 'social', (rng) => rng.int(100));
  const theirStressed = other.stats.stress > 700;
  const memory = (
    ownerId: string,
    subjectId: string,
    key: string,
    valence: number,
    salience: number,
    decay: 'fast' | 'slow',
  ) => {
    addMemory(world, { ownerId, subjectIds: [subjectId], key, source, valence, salience, decay });
  };

  switch (id) {
    case 'shareSecret': {
      const keep = clamp(
        35 + Math.floor(rel.trust / 2) + Math.floor(agree / 5) - Math.floor(rel.conflict / 2),
        10,
        95,
      );
      if (roll() < keep) {
        adjustPair(world, player.id, other.id, { trust: scale(6), closeness: scale(3) });
        changeStat(world, player, 'stress', -scale(25), 'social:confided');
        memory(other.id, player.id, 'trustedWithSecret', 40, 50, 'slow');
        return { outcome: 'success', key: 'int.shareSecret.kept' };
      }
      adjustPair(world, player.id, other.id, { trust: -8, closeness: -3 });
      changeStat(world, player, 'stress', 40, 'social:secretSpread');
      changeStat(world, player, 'reputation', -20, 'social:secretSpread');
      memory(player.id, other.id, 'secretSpread', -45, 60, 'slow');
      return { outcome: 'failure', key: 'int.shareSecret.leaked' };
    }
    case 'askFavour': {
      const yes = clamp(
        Math.floor(rel.closeness / 2) + Math.floor(agree / 4) - (theirStressed ? 20 : 0),
        10,
        95,
      );
      if (roll() < yes) {
        changeStat(world, player, 'stress', -scale(30), 'social:favour');
        changeStat(world, player, 'happiness', scale(10), 'social:favour');
        adjustPair(world, player.id, other.id, { closeness: -1, trust: scale(2) });
        memory(other.id, player.id, 'didFavour', 5, 20, 'fast');
        return { outcome: 'success', key: 'int.askFavour.yes' };
      }
      adjustPair(world, player.id, other.id, { closeness: -1 });
      return { outcome: 'mixed', key: theirStressed ? 'int.askFavour.busy' : 'int.askFavour.no' };
    }
    case 'gossip': {
      const backfire = clamp(25 + Math.floor((100 - agree) / 4), 10, 60);
      changeStat(world, player, 'reputation', -5, 'social:gossip');
      if (roll() < backfire) {
        changeStat(world, player, 'reputation', -35, 'social:gossip');
        adjustPair(world, player.id, other.id, { trust: -5 });
        memory(other.id, player.id, 'gossiped', -20, 30, 'fast');
        return { outcome: 'failure', key: 'int.gossip.backfired' };
      }
      adjustPair(world, player.id, other.id, { closeness: scale(3) });
      changeNeed(player, 'social', scale(60));
      return { outcome: 'mixed', key: 'int.gossip.bond' };
    }
    case 'reconcile': {
      const brokeUp = memoriesAbout(world, other.id, player.id).some((m) => m.key === 'brokeUp');
      const chance = clamp(
        25 +
          Math.floor(agree / 3) +
          Math.floor(rel.trust / 4) +
          Math.floor(player.stats.socialSkill / 40) -
          (brokeUp ? 15 : 0),
        5,
        90,
      );
      if (roll() < chance) {
        adjustPair(world, player.id, other.id, { conflict: -40, closeness: 8, trust: 5 });
        memory(other.id, player.id, 'reconciled', 35, 50, 'slow');
        memory(player.id, other.id, 'reconciled', 35, 50, 'slow');
        changeStat(world, player, 'happiness', 40, 'social:reconciled');
        return { outcome: 'success', key: 'int.reconcile.yes' };
      }
      adjustPair(world, player.id, other.id, { conflict: -5 });
      return { outcome: 'mixed', key: 'int.reconcile.notReady' };
    }
    case 'askMoney': {
      const amount = askMoneyAmount(world, player);
      const money = theirMoney(world, other);
      const to = playerAccount(player);
      const wealth = world.households[other.householdId]?.wealth ?? 'middle';
      const WEALTH_BONUS: Record<string, number> = {
        low: -15,
        'lower-middle': -5,
        middle: 0,
        'upper-middle': 10,
      };
      const wealthBonus = WEALTH_BONUS[wealth] ?? 20;
      const chance = clamp(
        Math.floor(rel.closeness / 2) +
          wealthBonus +
          (ctx.age < 18 ? 20 : 0) -
          (ctx.age >= 25 ? 15 : 0),
        5,
        90,
      );
      if (!money || !to || roll() >= chance) {
        adjustPair(world, player.id, other.id, { closeness: -1 });
        return { outcome: 'mixed', key: 'int.askMoney.no' };
      }
      const cur = world.ledger.accounts[money.checkingId]?.currency ?? 'USD';
      post(
        world,
        'tx.familyHelp',
        [
          {
            accountId: categoryAccount(world, money.ownerId, 'expense', 'familyHelp', cur),
            debit: amount,
          },
          { accountId: money.checkingId, credit: amount },
          { accountId: to, debit: amount },
          {
            accountId: categoryAccount(world, player.id, 'income', 'familyHelp', cur),
            credit: amount,
          },
        ],
        { params: { name: other.identity.firstName }, source },
      );
      if (ctx.age >= 18) adjustPair(world, player.id, other.id, { respect: -2 });
      memory(other.id, player.id, 'gaveMoney', ctx.age >= 18 ? -5 : 5, 25, 'fast');
      return {
        outcome: 'success',
        key: 'int.askMoney.yes',
        params: { amount: amount.toString() },
      };
    }
    case 'askPermission': {
      const chance = clamp(
        Math.floor(rel.closeness / 2) +
          Math.floor(player.stats.discipline / 25) +
          Math.floor(agree / 5) -
          Math.floor(rel.conflict / 2) -
          10,
        10,
        90,
      );
      if (roll() < chance) {
        changeStat(world, player, 'happiness', 40, 'social:allowed');
        adjustPair(world, player.id, other.id, { closeness: 1 });
        return { outcome: 'success', key: 'int.askPermission.yes' };
      }
      changeStat(world, player, 'happiness', -20, 'social:notAllowed');
      return { outcome: 'mixed', key: 'int.askPermission.no' };
    }
    case 'familyGathering': {
      const payer = payerFor(world, player);
      if (payer)
        payExpense(world, payer, 'gatherings', gatheringCost(world, player), 'tx.gathering', {
          name: other.identity.firstName,
        });
      adjustFamilyCloseness(world, player, 'parents', 2);
      adjustFamilyCloseness(world, player, 'siblings', 2);
      changeNeed(player, 'social', 120);
      if (rel.conflict >= 30 && roll() < 35) {
        adjustPair(world, player.id, other.id, { conflict: 10 });
        return { outcome: 'mixed', key: 'int.familyGathering.tense' };
      }
      adjustPair(world, player.id, other.id, { closeness: scale(4) });
      shareMoment(world, player, other, 'familyGathering', 30, 40, source);
      return { outcome: 'success', key: 'int.familyGathering.good' };
    }
    case 'supportRelative': {
      const needsCare = other.stats.health < 500 || ctx.theirAge >= 65;
      adjustPair(world, player.id, other.id, {
        trust: scale(4),
        closeness: scale(needsCare ? 6 : 3),
      });
      changeStat(world, player, 'stress', 10, 'social:support');
      changeStat(world, player, 'happiness', scale(10), 'social:support');
      changeSkill(world, player, 'care', scale(15), 'social:support');
      memory(other.id, player.id, 'supportedMe', 45, 55, 'slow');
      return {
        outcome: 'success',
        key: needsCare ? 'int.supportRelative.care' : 'int.supportRelative.good',
      };
    }
    case 'collaborate': {
      const skill = sharedSkill(player);
      const great =
        roll() < clamp(Math.floor(rel.chemistry / 2) + Math.floor(agree / 4) + 20, 10, 90);
      changeSkill(world, player, skill, scale(great ? 25 : 10), 'social:collaborate');
      if (great) {
        adjustPair(world, player.id, other.id, { closeness: scale(4) });
        memory(other.id, player.id, 'madeSomethingTogether', 35, 45, 'slow');
        memory(player.id, other.id, 'madeSomethingTogether', 35, 45, 'slow');
        return { outcome: 'success', key: 'int.collaborate.great', params: { skill } };
      }
      adjustPair(world, player.id, other.id, { conflict: 6 });
      return { outcome: 'mixed', key: 'int.collaborate.clash', params: { skill } };
    }
    case 'discussFuture': {
      const aligned = clamp(
        Math.floor(rel.chemistry / 2) +
          Math.floor(rel.trust / 2) -
          Math.floor(rel.conflict / 2) +
          10,
        10,
        90,
      );
      if (roll() < aligned) {
        adjustPair(world, player.id, other.id, { trust: 5, closeness: 2 });
        memory(other.id, player.id, 'sharedPlans', 30, 40, 'slow');
        return { outcome: 'success', key: 'int.discussFuture.aligned' };
      }
      adjustPair(world, player.id, other.id, { conflict: 10 });
      changeStat(world, player, 'stress', 20, 'social:futureTalk');
      return { outcome: 'mixed', key: 'int.discussFuture.differ' };
    }
    case 'talkItThrough': {
      const chance = clamp(
        30 +
          Math.floor(player.stats.socialSkill / 25) +
          Math.floor(agree / 3) +
          Math.floor(rel.trust / 4) -
          Math.floor(rel.conflict / 4),
        5,
        90,
      );
      if (roll() < chance) {
        adjustPair(world, player.id, other.id, { conflict: -30, trust: 3 });
        changeStat(world, player, 'stress', -20, 'social:resolved');
        return { outcome: 'success', key: 'int.talkItThrough.good' };
      }
      adjustPair(world, player.id, other.id, { conflict: 5 });
      changeStat(world, player, 'stress', 15, 'social:unresolved');
      return { outcome: 'failure', key: 'int.talkItThrough.worse' };
    }
    case 'negotiateSalary': {
      const job = activeEmployment(world, player);
      if (!job) return { outcome: 'failure', key: 'int.negotiateSalary.refused' };
      job.raiseRequestedTick = world.tick;
      const chance = clamp(
        Math.floor((job.performance - 300) / 6) +
          Math.floor(player.skills.business / 20) +
          Math.floor((rel.closeness - 50) / 3) +
          Math.floor((player.career.reputation - 200) / 20),
        5,
        90,
      );
      if (roll() < chance) {
        const pct =
          withRng(world, 'career', (rng) => rng.range(3, 8)) +
          (player.career.reputation >= 600 ? 2 : 0);
        job.salaryMinor += applyPercent(job.salaryMinor, pct);
        player.career.reputation = clamp(player.career.reputation + 10, 0, 1000);
        return { outcome: 'success', key: 'int.negotiateSalary.granted', params: { percent: pct } };
      }
      adjustPair(world, player.id, other.id, { closeness: -5 });
      memory(other.id, player.id, 'askedForRaise', -10, 30, 'fast');
      return {
        outcome: 'failure',
        key:
          job.performance < 500 ? 'int.negotiateSalary.performance' : 'int.negotiateSalary.budget',
      };
    }
    case 'askPromotion': {
      const job = activeEmployment(world, player);
      if (!job) return { outcome: 'failure', key: 'int.askPromotion.no' };
      const chance = clamp(
        Math.floor((job.performance - 550) / 4) +
          Math.floor((rel.closeness - 50) / 2) +
          Math.floor((player.career.reputation - 200) / 25) +
          20,
        5,
        85,
      );
      if (roll() < chance) {
        promote(world, player, job, true);
        player.career.reputation = clamp(player.career.reputation + 30, 0, 1000);
        return { outcome: 'success', key: 'int.askPromotion.yes', params: { title: job.title } };
      }
      memory(other.id, player.id, 'askedForPromotion', -5, 25, 'fast');
      return { outcome: 'mixed', key: 'int.askPromotion.no' };
    }
    case 'network': {
      adjustPair(world, player.id, other.id, { closeness: scale(3), respect: scale(1) });
      player.career.reputation = clamp(player.career.reputation + scale(15), 0, 1000);
      memory(other.id, player.id, 'networked', 15, 25, 'fast');
      if (roll() < 20) {
        player.career.reputation = clamp(player.career.reputation + 25, 0, 1000);
        return { outcome: 'success', key: 'int.network.opportunity' };
      }
      return { outcome: 'success', key: 'int.network.good' };
    }
    case 'askMentoring': {
      const job = activeEmployment(world, player);
      const skills = job ? getOccupation(job.terms.occupationId).skills : (['leadership'] as const);
      if (
        roll() <
        clamp(
          30 + Math.floor(agree / 2) + Math.floor(rel.closeness / 4) - (theirStressed ? 25 : 0),
          10,
          90,
        )
      ) {
        for (const k of skills) changeSkill(world, player, k, scale(20), 'social:mentoring');
        player.career.reputation = clamp(player.career.reputation + 5, 0, 1000);
        adjustPair(world, player.id, other.id, { closeness: scale(2), respect: scale(2) });
        memory(player.id, other.id, 'mentoredMe', 40, 50, 'slow');
        return { outcome: 'success', key: 'int.askMentoring.yes' };
      }
      return { outcome: 'mixed', key: 'int.askMentoring.busy' };
    }
  }
}

/** Person-screen groups for every interaction (existing and contextual). */
export const INTERACTION_GROUPS: Record<string, InteractionGroup> = {
  chat: 'social',
  deepTalk: 'social',
  compliment: 'social',
  gift: 'social',
  askAdvice: 'social',
  apologize: 'social',
  argue: 'social',
  shareSecret: 'social',
  askFavour: 'social',
  gossip: 'social',
  reconcile: 'social',
  talkItThrough: 'social',
  askMoney: 'family',
  askPermission: 'family',
  familyGathering: 'family',
  supportRelative: 'family',
  planFamily: 'family',
  stopPlanning: 'family',
  adopt: 'family',
  play: 'friendship',
  hangOut: 'friendship',
  help: 'friendship',
  befriend: 'friendship',
  endFriendship: 'friendship',
  collaborate: 'friendship',
  askOut: 'romance',
  propose: 'romance',
  moveIn: 'romance',
  breakUp: 'romance',
  discussFuture: 'romance',
  negotiateSalary: 'professional',
  askPromotion: 'professional',
  network: 'professional',
  askMentoring: 'professional',
};
