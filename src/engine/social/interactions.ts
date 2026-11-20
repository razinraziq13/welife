import { clamp, sortedValues } from '../core/data';
import { applyPercent } from '../core/money';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { diminishingPercent, ensureActivityMonth } from '../activities/activities';
import { spendHours, timeBudget } from '../calendar/time';
import { changeNeed, changeStat } from '../characters/stats';
import { emptyFinance, moveToHousehold } from '../characters/factory';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor } from '../economy/finance';
import type { Character, RelationType, World } from '../state/schema';
import {
  ADULT_AGE,
  DATE_CLOSENESS,
  canConceive,
  endPartnership,
  expect,
  formPartnership,
  setPartnershipStatus,
  shareMoment,
} from './family';
import { addMemory, memoriesAbout } from './memories';
import {
  CONTEXTUAL,
  CONTEXTUAL_BLOCK_MESSAGES,
  CONTEXTUAL_IDS,
  contextualBlock,
  contextualOutcome,
  type ContextualBlock,
  type ContextualId,
} from './contextual';
import { createPotentialPartner, meetPeople } from './npcs';
import { matchesDatingPreferences, type DatingPreferences } from './datingPreferences';
import { FAMILY_TYPES, adjustPair, findRelationship, kinship, linkPair } from './relationships';

/**
 * Things the player can do with other people (spec §3.11: interactions, conflicts,
 * partnerships, non-explicit family planning). Every interaction costs free time; repeating
 * one with the same person in a month gives diminishing returns. Outcomes depend on
 * chemistry, closeness, personality and seeded chance. PROPOSED TUNING.
 */

export const INTERACTION_IDS = [
  'chat',
  'play',
  'hangOut',
  'deepTalk',
  'help',
  'compliment',
  'gift',
  'apologize',
  'argue',
  'askAdvice',
  'befriend',
  'endFriendship',
  'askOut',
  'propose',
  'moveIn',
  'breakUp',
  'planFamily',
  'stopPlanning',
  'adopt',
  ...CONTEXTUAL_IDS,
] as const;
export type InteractionId = (typeof INTERACTION_IDS)[number];

export interface InteractionDefinition {
  id: InteractionId;
  hours: number;
  /** Minimum age of the player. */
  minAge: number;
}

export const INTERACTIONS: Record<InteractionId, InteractionDefinition> = {
  chat: { id: 'chat', hours: 2, minAge: 3 },
  play: { id: 'play', hours: 4, minAge: 3 },
  hangOut: { id: 'hangOut', hours: 6, minAge: 10 },
  deepTalk: { id: 'deepTalk', hours: 3, minAge: 12 },
  help: { id: 'help', hours: 4, minAge: 7 },
  compliment: { id: 'compliment', hours: 1, minAge: 5 },
  gift: { id: 'gift', hours: 2, minAge: 6 },
  apologize: { id: 'apologize', hours: 2, minAge: 4 },
  argue: { id: 'argue', hours: 2, minAge: 6 },
  askAdvice: { id: 'askAdvice', hours: 2, minAge: 8 },
  befriend: { id: 'befriend', hours: 3, minAge: 5 },
  endFriendship: { id: 'endFriendship', hours: 1, minAge: 8 },
  askOut: { id: 'askOut', hours: 4, minAge: ADULT_AGE },
  propose: { id: 'propose', hours: 4, minAge: ADULT_AGE },
  moveIn: { id: 'moveIn', hours: 8, minAge: ADULT_AGE },
  breakUp: { id: 'breakUp', hours: 2, minAge: ADULT_AGE },
  planFamily: { id: 'planFamily', hours: 1, minAge: ADULT_AGE },
  stopPlanning: { id: 'stopPlanning', hours: 1, minAge: ADULT_AGE },
  adopt: { id: 'adopt', hours: 10, minAge: 25 },
  ...(Object.fromEntries(CONTEXTUAL_IDS.map((id) => [id, { id, ...CONTEXTUAL[id] }])) as Record<
    ContextualId,
    InteractionDefinition
  >),
};

function isContextual(id: InteractionId): id is ContextualId {
  return (CONTEXTUAL_IDS as readonly string[]).includes(id);
}

export type InteractionBlock =
  | 'tooYoung'
  | 'targetTooYoung'
  | 'unknownPerson'
  | 'deceased'
  | 'self'
  | 'notNow'
  | 'noTime'
  | 'family'
  | 'notClose'
  | 'notPartner'
  | 'alreadyPartnered'
  | 'theyArePartnered'
  | 'noConflict'
  | 'alreadyFriends'
  | 'notFriends'
  | 'noHome'
  | 'livingTogether'
  | 'cannotAfford'
  | 'expecting'
  | ContextualBlock;

export const INTERACTION_BLOCK_MESSAGES: Record<InteractionBlock, string> = {
  tooYoung: 'You are too young for this.',
  targetTooYoung: 'They are too young for this.',
  unknownPerson: 'You do not know this person.',
  deceased: 'This person has died.',
  self: 'You cannot do this with yourself.',
  notNow: 'This is not possible right now.',
  noTime: 'You have no free time left this month.',
  family: 'Not with a family member.',
  notClose: 'You are not close enough yet.',
  notPartner: 'This is only for your partner.',
  alreadyPartnered: 'You are already in a relationship.',
  theyArePartnered: 'They are already in a relationship.',
  noConflict: 'There is nothing to apologise for.',
  alreadyFriends: 'You are already friends.',
  notFriends: 'You are not friends.',
  noHome: 'You need a home of your own first (Finance: move out).',
  livingTogether: 'You already live together.',
  cannotAfford: 'You cannot afford this right now.',
  expecting: 'A child is already on the way.',
  ...CONTEXTUAL_BLOCK_MESSAGES,
};

function relationOf(world: World, player: Character, other: Character): RelationType | null {
  return (
    kinship(world, player.id, other.id) ??
    findRelationship(world, player.id, other.id)?.type ??
    null
  );
}

/** Why an interaction is unavailable (null when it can be attempted). */
export function interactionBlock(
  world: World,
  player: Character,
  other: Character | undefined,
  id: InteractionId,
): InteractionBlock | null {
  if (!other) return 'unknownPerson';
  if (other.id === player.id) return 'self';
  if (other.death !== null) return 'deceased';
  const rel = findRelationship(world, player.id, other.id);
  if (!rel) return 'unknownPerson';
  const def = INTERACTIONS[id];
  const age = ageYears(world, player);
  const theirAge = ageYears(world, other);
  if (age < def.minAge) return 'tooYoung';
  const relation = relationOf(world, player, other);
  const isFamily = relation !== null && FAMILY_TYPES.has(relation);
  const partner = player.partnership?.partnerId === other.id ? player.partnership : null;
  const hours = timeBudget(world);
  if (hours.used + def.hours > hours.total) return 'noTime';
  if (isContextual(id))
    return contextualBlock(world, player, other, id, {
      rel,
      relation,
      isFamily,
      isPartner: partner !== null,
      age,
      theirAge,
    });
  switch (id) {
    case 'chat':
      return theirAge < 2 ? 'targetTooYoung' : null;
    case 'play':
      return age > 13 && theirAge > 13 ? 'notNow' : null;
    case 'hangOut':
    case 'compliment':
    case 'help':
    case 'gift':
      return theirAge < 3
        ? 'targetTooYoung'
        : id === 'gift' && !canPay(world, player, giftCost(world, player))
          ? 'cannotAfford'
          : null;
    case 'deepTalk':
      return theirAge < 10 ? 'targetTooYoung' : rel.closeness < 40 ? 'notClose' : null;
    case 'apologize':
      return rel.conflict < 15 ? 'noConflict' : null;
    case 'argue':
      return theirAge < 5 ? 'targetTooYoung' : null;
    case 'askAdvice':
      return theirAge < 12 ? 'targetTooYoung' : null;
    case 'befriend':
      if (isFamily || partner) return 'family';
      if (rel.type === 'friend') return 'alreadyFriends';
      if (theirAge < 4) return 'targetTooYoung';
      return rel.closeness < 30 ? 'notClose' : null;
    case 'endFriendship':
      return rel.type === 'friend' ? null : 'notFriends';
    case 'askOut':
      if (theirAge < ADULT_AGE) return 'targetTooYoung';
      if (isFamily) return 'family';
      if (player.partnership) return 'alreadyPartnered';
      if (other.partnership) return 'theyArePartnered';
      return rel.closeness < DATE_CLOSENESS ? 'notClose' : null;
    case 'propose':
      if (!partner) return 'notPartner';
      return partner.status !== 'dating' || world.tick - partner.since < 6 ? 'notNow' : null;
    case 'moveIn': {
      if (!partner) return 'notPartner';
      if (other.householdId === player.householdId) return 'livingTogether';
      return world.households[player.householdId]?.finance?.headId === player.id ? null : 'noHome';
    }
    case 'breakUp':
      return partner ? null : 'notPartner';
    case 'planFamily':
      if (!partner) return 'notPartner';
      if (other.householdId !== player.householdId) return 'notNow';
      return partner.planningFamily ? 'notNow' : null;
    case 'stopPlanning':
      return partner?.planningFamily ? null : 'notNow';
    case 'adopt': {
      if (world.households[player.householdId]?.finance?.headId !== player.id) return 'noHome';
      if (!partner) return 'notPartner';
      if (other.householdId !== player.householdId) return 'notNow';
      if (world.expecting.some((e) => e.parentIds.includes(player.id))) return 'expecting';
      return canPay(world, player, adoptionCost(world, player)) ? null : 'cannotAfford';
    }
  }
  return null;
}

function giftCost(world: World, player: Character): bigint {
  return applyPercent(medianWage(world, player.countryCode), 2);
}

export function adoptionCost(world: World, player: Character): bigint {
  return applyPercent(medianWage(world, player.countryCode), 150);
}

function canPay(world: World, player: Character, amount: bigint): boolean {
  const payer = payerFor(world, player);
  if (!payer) return false;
  const bal = (id: string | null) => (id ? (world.ledger.accounts[id]?.balance ?? 0n) : 0n);
  return bal(payer.checkingId) + bal(payer.savingsId) >= amount;
}

export interface InteractionResult {
  interactionId: InteractionId;
  personId: string;
  outcome: 'success' | 'mixed' | 'failure';
  /** Localisation key describing what happened. */
  key: string;
  /** Values for the message (amounts, percentages, titles). */
  params?: Record<string, string | number>;
}

/** Success chance from chemistry, closeness, their personality and your social skill. */
function successChance(
  player: Character,
  other: Character,
  closeness: number,
  chemistry: number,
): number {
  return clamp(
    Math.floor(chemistry / 3) +
      Math.floor(closeness / 3) +
      Math.floor(other.traits.agreeableness / 5) +
      Math.floor(player.stats.socialSkill / 50),
    5,
    95,
  );
}

/** Performs an interaction. Throws InteractionError when it is unavailable. */
export function interact(world: World, personId: string, id: InteractionId): InteractionResult {
  const player = world.characters[world.activeCharacterId] as Character;
  const other = world.characters[personId];
  const block = interactionBlock(world, player, other, id);
  if (block || !other) throw new InteractionError(block ?? 'unknownPerson');
  const def = INTERACTIONS[id];
  spendHours(world, def.hours);
  const countKey = `int:${personId}`;
  const times = world.activity.counts[countKey] ?? 0;
  world.activity.counts[countKey] = times + 1;
  const percent = diminishingPercent(times);
  const scale = (n: number) => Math.trunc((n * percent) / 100);
  const rel = findRelationship(world, player.id, other.id);
  const closeness = rel?.closeness ?? 0;
  const chemistry = rel?.chemistry ?? 50;
  const roll = withRng(world, 'social', (rng) => rng.int(100));
  const chance = successChance(player, other, closeness, chemistry);
  const success = roll < chance;
  const result = (outcome: InteractionResult['outcome'], key: string): InteractionResult => ({
    interactionId: id,
    personId,
    outcome,
    key,
  });
  const source = `int:${String(world.tick)}:${id}`;
  if (isContextual(id) && rel) {
    const relation = relationOf(world, player, other);
    const done = contextualOutcome(
      world,
      player,
      other,
      id,
      {
        rel,
        relation,
        isFamily: relation !== null && FAMILY_TYPES.has(relation),
        isPartner: player.partnership?.partnerId === other.id,
        age: ageYears(world, player),
        theirAge: ageYears(world, other),
      },
      percent,
      source,
    );
    return { interactionId: id, personId, ...done };
  }

  switch (id) {
    case 'chat':
      adjustPair(world, player.id, other.id, { closeness: scale(success ? 3 : 1) });
      changeNeed(player, 'social', scale(60));
      return result(success ? 'success' : 'mixed', success ? 'int.chat.good' : 'int.chat.ok');
    case 'play':
      adjustPair(world, player.id, other.id, { closeness: scale(4) });
      changeNeed(player, 'leisure', scale(100));
      changeStat(world, player, 'happiness', scale(15), 'social:play');
      return result('success', 'int.play');
    case 'hangOut':
      adjustPair(world, player.id, other.id, {
        closeness: scale(success ? 5 : 2),
        trust: scale(1),
      });
      changeNeed(player, 'social', scale(100));
      changeNeed(player, 'leisure', scale(80));
      if (success && times === 0 && chemistry >= 70)
        shareMoment(world, player, other, 'greatDay', 30, 30, source);
      return result(success ? 'success' : 'mixed', success ? 'int.hangOut.good' : 'int.hangOut.ok');
    case 'deepTalk':
      adjustPair(world, player.id, other.id, {
        closeness: scale(2),
        trust: scale(success ? 4 : 1),
      });
      changeStat(world, player, 'stress', -scale(30), 'social:deepTalk');
      if (success && times === 0)
        addMemory(world, {
          ownerId: other.id,
          subjectIds: [player.id],
          key: 'confided',
          source,
          valence: 35,
          salience: 40,
          decay: 'fast',
        });
      return result(
        success ? 'success' : 'mixed',
        success ? 'int.deepTalk.good' : 'int.deepTalk.ok',
      );
    case 'help':
      adjustPair(world, player.id, other.id, {
        trust: scale(3),
        respect: scale(3),
        closeness: scale(2),
      });
      changeStat(world, player, 'happiness', scale(10), 'social:help');
      if (times === 0)
        addMemory(world, {
          ownerId: other.id,
          subjectIds: [player.id],
          key: 'helpedMe',
          source,
          valence: 50,
          salience: 50,
          decay: 'slow',
        });
      return result('success', 'int.help');
    case 'compliment':
      if (success) {
        adjustPair(world, player.id, other.id, { closeness: scale(2), respect: scale(1) });
        return result('success', 'int.compliment.good');
      }
      changeStat(world, player, 'confidence', -5, 'social:awkward');
      return result('failure', 'int.compliment.awkward');
    case 'gift': {
      const payer = payerFor(world, player);
      if (payer)
        payExpense(world, payer, 'gifts', giftCost(world, player), 'tx.gift', {
          name: other.identity.firstName,
        });
      adjustPair(world, player.id, other.id, { closeness: scale(4), trust: scale(1) });
      if (times === 0)
        addMemory(world, {
          ownerId: other.id,
          subjectIds: [player.id],
          key: 'gift',
          source,
          valence: 30,
          salience: 30,
          decay: 'fast',
        });
      return result('success', 'int.gift');
    }
    case 'apologize': {
      const sincere = withRng(
        world,
        'social',
        (rng) => rng.int(100) < 40 + Math.floor(other.traits.agreeableness / 2),
      );
      adjustPair(world, player.id, other.id, {
        conflict: sincere ? -25 : -8,
        trust: sincere ? 2 : 0,
      });
      return result(
        sincere ? 'success' : 'mixed',
        sincere ? 'int.apologize.good' : 'int.apologize.ok',
      );
    }
    case 'argue': {
      const clears = withRng(world, 'social', (rng) => rng.int(100) < 20);
      if (clears) {
        adjustPair(world, player.id, other.id, { conflict: -10, respect: 3 });
        return result('mixed', 'int.argue.clears');
      }
      adjustPair(world, player.id, other.id, { conflict: 20, closeness: -5 });
      changeStat(world, player, 'stress', 40, 'social:argument');
      addMemory(world, {
        ownerId: other.id,
        subjectIds: [player.id],
        key: 'argument',
        source,
        valence: -40,
        salience: 40,
        decay: 'fast',
      });
      return result('failure', 'int.argue');
    }
    case 'askAdvice':
      adjustPair(world, player.id, other.id, { trust: scale(2), respect: scale(1) });
      changeStat(world, player, 'stress', -scale(20), 'social:advice');
      changeStat(world, player, 'discipline', scale(5), 'social:advice');
      return result('success', 'int.askAdvice');
    case 'befriend': {
      const accepts = roll < clamp(Math.floor((chemistry + closeness) / 2) + 15, 10, 95);
      if (!accepts) {
        adjustPair(world, player.id, other.id, { closeness: 1 });
        return result('failure', 'int.befriend.notYet');
      }
      linkPair(world, player, other, 'friend', 'friend', { closeness });
      shareMoment(world, player, other, 'becameFriends', 40, 50, source);
      addBiography(world, player.id, 'social', 'bio.newFriend', { name: other.identity.firstName });
      return result('success', 'int.befriend.yes');
    }
    case 'endFriendship':
      linkPair(world, player, other, 'acquaintance', 'acquaintance', { closeness });
      adjustPair(world, player.id, other.id, { closeness: -20, trust: -10 });
      addMemory(world, {
        ownerId: other.id,
        subjectIds: [player.id],
        key: 'endedFriendship',
        source,
        valence: -30,
        salience: 40,
        decay: 'slow',
      });
      return result('mixed', 'int.endFriendship');
    case 'askOut': {
      // Someone who is interested in you is more likely to say yes.
      const interested = memoriesAbout(world, other.id, player.id).some(
        (m) => m.key === 'interestedInYou',
      );
      const accepts =
        roll <
        clamp(
          Math.floor((chemistry + closeness) / 2) +
            Math.floor(player.stats.confidence / 40) -
            15 +
            (interested ? 15 : 0),
          5,
          90,
        );
      if (!accepts) {
        changeStat(world, player, 'confidence', -30, 'social:turnedDown');
        addMemory(world, {
          ownerId: player.id,
          subjectIds: [other.id],
          key: 'turnedDown',
          source,
          valence: -30,
          salience: 40,
          decay: 'fast',
        });
        return result('failure', 'int.askOut.no');
      }
      formPartnership(world, player, other, 'dating');
      linkPair(world, player, other, 'partner', 'partner', { closeness });
      shareMoment(world, player, other, 'firstDate', 60, 70, source);
      addBiography(world, player.id, 'social', 'bio.startedDating', {
        name: other.identity.firstName,
      });
      return result('success', 'int.askOut.yes');
    }
    case 'propose': {
      const accepts = roll < clamp(Math.floor((closeness + (rel?.trust ?? 50)) / 2) + 20, 5, 95);
      if (!accepts) {
        adjustPair(world, player.id, other.id, { closeness: -5 });
        changeStat(world, player, 'happiness', -60, 'social:proposal');
        return result('failure', 'int.propose.no');
      }
      setPartnershipStatus(player, other, 'engaged');
      shareMoment(world, player, other, 'engaged', 80, 90, source);
      scheduleWedding(world, player, other);
      addBiography(world, player.id, 'social', 'bio.engaged', { name: other.identity.firstName });
      return result('success', 'int.propose.yes');
    }
    case 'moveIn':
      moveToHousehold(world, other, player.householdId);
      other.finance ??= emptyFinance(world.tick);
      adjustPair(world, player.id, other.id, { closeness: 5 });
      addBiography(world, player.id, 'social', 'bio.movedIn', { name: other.identity.firstName });
      return result('success', 'int.moveIn');
    case 'breakUp':
      addMemory(world, {
        ownerId: other.id,
        subjectIds: [player.id],
        key: 'brokeUp',
        source,
        valence: -60,
        salience: 70,
        decay: 'slow',
      });
      endPartnership(world, player, 'breakup');
      changeStat(world, player, 'happiness', -80, 'social:breakUp');
      changeStat(world, player, 'stress', 60, 'social:breakUp');
      cancelWedding(world);
      addBiography(world, player.id, 'social', 'bio.brokeUp', { name: other.identity.firstName });
      return result('mixed', 'int.breakUp');
    case 'planFamily':
      if (player.partnership) player.partnership.planningFamily = true;
      if (other.partnership) other.partnership.planningFamily = true;
      return result(
        'success',
        canConceive(world, player, other) ? 'int.planFamily' : 'int.planFamily.adopt',
      );
    case 'stopPlanning':
      if (player.partnership) player.partnership.planningFamily = false;
      if (other.partnership) other.partnership.planningFamily = false;
      return result('success', 'int.stopPlanning');
    case 'adopt': {
      const payer = payerFor(world, player);
      if (payer) payExpense(world, payer, 'adoption', adoptionCost(world, player), 'tx.adoption');
      const parents = player.partnership ? [player.id, other.id] : [player.id];
      expect(world, 'adoption', parents, player.householdId, 12);
      addNotification(world, 'family', 'ntf.adoptionStarted', {}, 'family');
      addBiography(world, player.id, 'family', 'bio.adoptionStarted', {});
      return result('success', 'int.adopt');
    }
  }
  // A contextual interaction without a relationship (already refused by the eligibility check).
  throw new InteractionError('unknownPerson');
}

export class InteractionError extends Error {
  readonly code: InteractionBlock;
  constructor(code: InteractionBlock) {
    super(INTERACTION_BLOCK_MESSAGES[code]);
    this.name = 'InteractionError';
    this.code = code;
  }
}

export function weddingCost(world: World, player: Character): bigint {
  const lifestyle = world.households[player.householdId]?.finance?.lifestyle ?? 'moderate';
  const percent =
    lifestyle === 'frugal'
      ? 60
      : lifestyle === 'moderate'
        ? 150
        : lifestyle === 'comfortable'
          ? 300
          : 800;
  return applyPercent(medianWage(world, player.countryCode), percent);
}

function scheduleWedding(world: World, player: Character, partner: Character): void {
  world.calendar.items.push({
    id: nextId(world, 'cal'),
    kind: 'wedding',
    option: 'wedding',
    tick: world.tick + 6,
    costMinor: weddingCost(world, player),
    hours: 0,
    status: 'scheduled',
    withId: partner.id,
  });
}

function cancelWedding(world: World): void {
  for (const item of world.calendar.items)
    if (item.kind === 'wedding' && item.status === 'scheduled') item.status = 'cancelled';
}

/** Going out to meet new people (adults): may introduce someone new. */
export function meetNewPeople(world: World): { personId: string | null } {
  const player = world.characters[world.activeCharacterId] as Character;
  if (ageYears(world, player) < 16) throw new InteractionError('tooYoung');
  if (!spendHours(world, 6)) throw new InteractionError('noTime');
  const times = world.activity.counts['meet-people'] ?? 0;
  world.activity.counts['meet-people'] = times + 1;
  changeNeed(player, 'social', 80);
  const meets = withRng(
    world,
    'social',
    (rng) => rng.int(100) < Math.floor((70 * diminishingPercent(times)) / 100),
  );
  if (!meets) return { personId: null };
  const age = ageYears(world, player);
  let person: Character;
  if (age >= ADULT_AGE) {
    person = createPotentialPartner(world, player);
    linkPair(world, player, person, 'acquaintance', 'acquaintance', {
      closeness: withRng(world, 'social', (rng) => rng.range(25, 50)),
    });
  } else {
    const [peer] = meetPeople(world, player, 1, 'acquaintance', [age - 1, age + 1]);
    if (!peer) return { personId: null };
    person = peer;
  }
  addNotification(
    world,
    'social',
    'ntf.metSomeone',
    { name: person.identity.firstName },
    'person',
    person.id,
  );
  return { personId: person.id };
}

/**
 * Looking for love (single adults): dating apps, speed dating, a friend's introduction. More
 * likely than going out to introduce someone, and the person is single, interested and a good
 * match: closer to start with and better chemistry. They still decide for themselves later.
 */
export function lookForLove(
  world: World,
  preferences?: DatingPreferences,
): { personId: string | null; noProfiles?: boolean } {
  const player = world.characters[world.activeCharacterId] as Character;
  if (ageYears(world, player) < ADULT_AGE) throw new InteractionError('tooYoung');
  if (player.partnership) throw new InteractionError('alreadyPartnered');
  const pool =
    preferences && Object.values(preferences).some((value) => value !== undefined)
      ? sortedValues(world.characters).filter(
          (person) =>
            person.countryCode === player.countryCode &&
            isRomanticProspectBase(world, player, person) &&
            !findRelationship(world, player.id, person.id) &&
            matchesDatingPreferences(world, person, preferences),
        )
      : null;
  if (pool?.length === 0) return { personId: null, noProfiles: true };
  if (!spendHours(world, 6)) throw new InteractionError('noTime');
  const times = world.activity.counts['look-for-love'] ?? 0;
  world.activity.counts['look-for-love'] = times + 1;
  changeNeed(player, 'social', 60);
  const found = withRng(
    world,
    'social',
    (rng) => rng.int(100) < Math.floor((85 * diminishingPercent(times)) / 100),
  );
  if (!found) return { personId: null };
  const person = pool
    ? withRng(world, 'social', (rng) => rng.pick(pool))
    : createPotentialPartner(world, player);
  linkPair(world, player, person, 'acquaintance', 'acquaintance', {
    closeness: withRng(world, 'social', (rng) => rng.range(38, 52)),
  });
  for (const rel of [
    findRelationship(world, player.id, person.id),
    findRelationship(world, person.id, player.id),
  ])
    if (rel) rel.chemistry = clamp(Math.max(rel.chemistry, 55) + 10, 0, 100);
  addMemory(world, {
    ownerId: person.id,
    subjectIds: [player.id],
    key: 'interestedInYou',
    source: 'love:' + String(world.tick),
    valence: 30,
    salience: 40,
    decay: 'fast',
  });
  addNotification(
    world,
    'social',
    'ntf.metSomeoneSpecial',
    { name: person.identity.firstName },
    'person',
    person.id,
  );
  return { personId: person.id };
}

/** Single adults within ten years of age who are not related. */
export function isRomanticProspectBase(
  world: World,
  player: Character,
  other: Character | undefined,
): boolean {
  if (
    player.death !== null ||
    player.partnership ||
    other?.death !== null ||
    other.id === player.id ||
    other.partnership ||
    other.tier === 'archived'
  )
    return false;
  const a = ageYears(world, player);
  const b = ageYears(world, other);
  return (
    a >= ADULT_AGE &&
    b >= ADULT_AGE &&
    Math.abs(a - b) <= 10 &&
    kinship(world, player.id, other.id) === null
  );
}

const datingPassKey = (personId: string) => `dating:pass:${personId}`;

export function datingAppStatus(
  world: World,
  player: Character,
  personId: string,
): 'match' | 'profile' | null {
  if (memoriesAbout(world, player.id, personId).some((m) => m.key === 'datingAppMatch'))
    return 'match';
  if (world.activity.tick === world.tick && world.activity.counts[datingPassKey(personId)])
    return null;
  return memoriesAbout(world, personId, player.id).some((m) => m.key === 'interestedInYou')
    ? 'profile'
    : null;
}

export function respondToDatingProfile(
  world: World,
  personId: string,
  response: 'like' | 'pass',
): void {
  const player = world.characters[world.activeCharacterId] as Character;
  if (
    !isRomanticProspectBase(world, player, world.characters[personId]) ||
    !findRelationship(world, player.id, personId) ||
    datingAppStatus(world, player, personId) !== 'profile'
  )
    throw new InteractionError('notNow');
  if (response === 'pass') {
    ensureActivityMonth(world);
    world.activity.counts[datingPassKey(personId)] = 1;
    return;
  }
  addMemory(world, {
    ownerId: player.id,
    subjectIds: [personId],
    key: 'datingAppMatch',
    source: `dating-app:${String(world.tick)}`,
    valence: 0,
    salience: 45,
    decay: 'slow',
  });
}
