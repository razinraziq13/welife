import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { Rng } from '../core/rng';
import { addBiography, addNotification, ageYears, nextId, withRng } from '../core/world';
import { spendHours, timeBudget } from '../calendar/time';
import { changeSkill, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { payExpense, payerFor, receiveIncome } from '../economy/finance';
import { addMemory } from '../social/memories';
import { meetPeople } from '../social/npcs';
import { adjustPair, findRelationship } from '../social/relationships';
import { getCountry } from '../world/countries';
import {
  ACTING_GENRES,
  type ActingState,
  type AuditionApproach,
  type CastingListing,
  type Character,
  type Production,
  type World,
} from '../state/schema';
import { activeEmployment } from './jobs';

/**
 * The acting career (decision E89). Actors (the 'actor' creative path) get a casting board
 * that refreshes monthly; they audition with an approach, negotiate or accept offers, then
 * work through a production: rehearsal, filming, post-production and release (film) or a
 * season that may be renewed (TV). Pay arrives at milestones through the ledger, less the
 * agent's commission. Co-stars and directors are real NPCs; how you treated them is
 * remembered and can bring later work. Releases get critics' and audience verdicts, which
 * move industry reputation, recognition and critical standing separately, and strong work
 * can be nominated for (fictional) Silver Reel awards. All numbers PROPOSED TUNING.
 */

export const NEW_ACTING: ActingState = {
  recognition: 0,
  critics: 0,
  board: [],
  production: null,
  filmography: [],
  agent: null,
};

const BOARD_SIZE = 4;
const AUDITIONS_PER_MONTH = 2;
const PROMINENCE_FEE = { background: 30, supporting: 150, lead: 600 } as const;
const PROMINENCE_TV = { background: 25, supporting: 80, lead: 250 } as const;
const PROMINENCE_REP = { background: 10, supporting: 25, lead: 60 } as const;
/** Film fee milestones: on signing, when filming wraps, on release (percent). */
const FILM_MILESTONES = { signing: 25, wrap: 50, release: 25 } as const;
const POST_MONTHS = 2;
const RENEWAL_MONTHS = 2;
/** Which audition approach suits which genre. */
const APPROACH_FIT: Record<(typeof ACTING_GENRES)[number], readonly AuditionApproach[]> = {
  drama: ['restrained', 'character'],
  comedy: ['comedic', 'energetic'],
  action: ['energetic'],
  thriller: ['restrained'],
  romance: ['restrained', 'character'],
  family: ['comedic', 'energetic'],
};

const WORDS_A = [
  'Silent',
  'Golden',
  'Broken',
  'Midnight',
  'Last',
  'Hidden',
  'Paper',
  'Electric',
  'Wild',
  'Quiet',
  'Northern',
  'Borrowed',
];
const WORDS_B = [
  'Harbour',
  'Summer',
  'Promise',
  'Kingdom',
  'Garden',
  'Signal',
  'River',
  'Letters',
  'Crown',
  'Orbit',
  'Lanterns',
  'Tides',
];
const STUDIOS = [
  'Lumen Pictures',
  'Harbourlight Studios',
  'Red Kite Films',
  'Northstar Television',
  'Copperleaf Media',
  'Bluefin Network',
];
const PARTS = [
  'a detective',
  'the younger sister',
  'a rookie pilot',
  'the best friend',
  'a retired boxer',
  'the new teacher',
  'a chef',
  'the stranger',
  'a nurse',
  'the mayor',
];

export const ACTING_MESSAGES = {
  notActor: 'Casting is for working actors: start the actor path in Career, Paths.',
  closed: 'This casting has closed.',
  inexperienced: 'Casting wants more screen experience for this part.',
  limit: 'You have already auditioned twice this month.',
  noTime: 'You have no free time left this month.',
  tooTired: 'You are too tired; rest first.',
  busy: 'You are filming another production; finish or leave it first.',
  noOffer: 'There is no offer to answer.',
  negotiated: 'You have already negotiated this offer.',
  noProduction: 'You are not working on a production.',
  wrongStage: 'This is not possible at this stage of the production.',
  doneThisMonth: 'You have already done this this month.',
  noCredits: 'Agents only take on actors with at least one screen credit.',
  hasAgent: 'You already have an agent.',
  noAgent: 'You do not have an agent.',
  agentTried: 'You already approached an agent this month.',
  noRenewal: 'There is no renewal to answer.',
} as const;
export type ActingBlock = keyof typeof ACTING_MESSAGES;

export class ActingError extends Error {
  constructor(readonly code: ActingBlock) {
    super(ACTING_MESSAGES[code]);
    this.name = 'ActingError';
  }
}

export const PRODUCTION_ACTIONS = [
  'studyScript',
  'rehearse',
  'workWithCast',
  'meetDirector',
  'promote',
] as const;
export type ProductionAction = (typeof PRODUCTION_ACTIONS)[number];
const ACTION_COST: Record<ProductionAction, { hours: number; energy: number }> = {
  studyScript: { hours: 3, energy: 20 },
  rehearse: { hours: 5, energy: 50 },
  workWithCast: { hours: 3, energy: 20 },
  meetDirector: { hours: 2, energy: 10 },
  promote: { hours: 3, energy: 30 },
};
export function actingOf(c: Character): ActingState {
  c.career.acting ??= { ...NEW_ACTING, board: [], filmography: [] };
  return c.career.acting;
}

export function isActor(world: World, c: Character): boolean {
  return activeEmployment(world, c)?.terms.occupationId === 'actor';
}

const credits = (a: ActingState) => a.filmography.length;

/**
 * Typecasting: with three or more credits, a genre that makes up most of them is what casting
 * knows you for. That genre gets easier to win, every other one harder.
 */
export function knownFor(a: ActingState): (typeof ACTING_GENRES)[number] | null {
  if (a.filmography.length < 3) return null;
  const counts = new Map<string, number>();
  for (const f of a.filmography) counts.set(f.genre, (counts.get(f.genre) ?? 0) + 1);
  const best = ACTING_GENRES.find((g) => (counts.get(g) ?? 0) * 2 > a.filmography.length);
  return best ?? null;
}
/**
 * Industry outlook: one genre is in fashion each calendar year (seeded, no stored state).
 * More castings come in it and its releases draw bigger audiences, but fashion moves on.
 */
export function trendingGenre(world: World): (typeof ACTING_GENRES)[number] {
  const rng = Rng.fromSeed(`${world.seed}:trend:${String(world.clock.year)}`);
  return ACTING_GENRES[rng.int(ACTING_GENRES.length)] ?? 'drama';
}
const TREND_AUDIENCE = 10;
const TYPECAST_BONUS = 10;
const TYPECAST_PENALTY = 8;
const count = (world: World, key: string) =>
  world.activity.tick === world.tick ? (world.activity.counts[`acting:${key}`] ?? 0) : 0;
function mark(world: World, key: string) {
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  world.activity.counts[`acting:${key}`] = count(world, key) + 1;
}
const rep = (c: Character, delta: number) => {
  c.career.reputation = clamp(c.career.reputation + delta, 0, 1000);
};
/** Screen skill, 0-100: art (acting technique) with socializing (presence, chemistry). */
const skillOf = (c: Character) => Math.floor((c.skills.art * 2 + c.skills.socializing) / 30);

function experienceBlock(c: Character, l: CastingListing): ActingBlock | null {
  const a = c.career.acting ?? NEW_ACTING;
  if (l.prominence === 'lead' && (credits(a) < 3 || c.career.reputation < 400))
    return 'inexperienced';
  if (l.prominence === 'supporting' && credits(a) < 1) return 'inexperienced';
  return null;
}

/** Fresh listings: up to four (six with an agent), one from a director who liked you. */
function refreshBoard(world: World, c: Character): void {
  const a = actingOf(c);
  a.board = a.board.filter((l) => l.deadlineTick >= world.tick);
  const size = BOARD_SIZE + (a.agent ? 2 : 0);
  const country = getCountry(c.countryCode);
  const median = medianWage(world, c.countryCode);
  const friendly = a.filmography.length
    ? Object.values(world.relationships).find(
        (r) =>
          r.aId === c.id &&
          r.closeness >= 60 &&
          r.type === 'colleague' &&
          world.characters[r.bId]?.death === null &&
          a.filmography.some((f) => f.director === nameOf(world, r.bId)) &&
          !a.board.some((l) => l.directorId === r.bId),
      )
    : undefined;
  while (a.board.length < size) {
    const rng = new Rng(world.rng.career);
    const format = rng.int(3) === 0 ? 'tv' : 'film';
    const budget = rng.int(3) === 0 ? 'studio' : 'indie';
    const exp = credits(a);
    const prominence =
      exp >= 3 && rng.int(3) === 0
        ? 'lead'
        : exp >= 1 && rng.int(2) === 0
          ? 'supporting'
          : rng.pick(['background', 'background', 'supporting', 'lead'] as const);
    const studioPay = budget === 'studio' ? 250 : 100;
    const pay =
      format === 'film'
        ? applyPercent(applyPercent(median, PROMINENCE_FEE[prominence]), studioPay)
        : applyPercent(applyPercent(median, PROMINENCE_TV[prominence]), studioPay);
    const first = rng.pick(rng.int(2) === 0 ? country.names.female : country.names.male);
    const invited =
      friendly && a.board.every((l) => l.directorId !== friendly.bId) ? friendly.bId : null;
    a.board.push({
      id: nextId(world, 'cast'),
      title: `${rng.pick(WORDS_A)} ${rng.pick(WORDS_B)}`,
      format,
      genre: rng.int(3) === 0 ? trendingGenre(world) : rng.pick(ACTING_GENRES),
      studio: rng.pick(STUDIOS),
      director: invited
        ? nameOf(world, invited)
        : `${rng.pick(rng.int(2) === 0 ? country.names.female : country.names.male)} ${rng.pick(country.names.family)}`,
      directorId: invited,
      character: `${first}, ${rng.pick(PARTS)}`,
      prominence,
      script: rng.range(25, 95),
      budget,
      months: format === 'tv' ? 3 : rng.range(1, 3),
      payMinor: pay,
      deadlineTick: world.tick + rng.range(1, 3),
      status: 'open',
      feedback: null,
      negotiated: false,
    });
    world.rng.career = rng.state();
  }
}

function nameOf(world: World, id: string): string {
  const p = world.characters[id];
  return p ? `${p.identity.firstName} ${p.identity.lastName}`.trim() : '';
}

/** Pays an acting fee into the current account, then the agent's commission out of it. */
function pay(world: World, c: Character, amount: bigint, kind: string): void {
  const into = c.finance?.checkingId ?? c.finance?.savingsId;
  if (!into || amount <= 0n) return;
  receiveIncome(world, c.id, into, 'acting', amount, kind);
  const a = actingOf(c);
  if (a.production) a.production.earnedMinor += amount;
  const payer = payerFor(world, c);
  if (a.agent && payer)
    payExpense(
      world,
      payer,
      'agentFees',
      applyPercent(amount, a.agent.commissionPct),
      'tx.agentCommission',
      {
        name: a.agent.name,
      },
    );
}

export function auditionBlock(
  world: World,
  c: Character,
  l: CastingListing | undefined,
): ActingBlock | null {
  if (!isActor(world, c)) return 'notActor';
  if (l?.status !== 'open' || l.deadlineTick < world.tick) return 'closed';
  const exp = experienceBlock(c, l);
  if (exp) return exp;
  if (count(world, 'audition') >= AUDITIONS_PER_MONTH) return 'limit';
  const t = timeBudget(world);
  if (t.used + 4 > t.total) return 'noTime';
  return c.stats.energy < 50 ? 'tooTired' : null;
}

export function audition(
  world: World,
  c: Character,
  listingId: string,
  approach: AuditionApproach,
) {
  const a = actingOf(c);
  const l = a.board.find((x) => x.id === listingId);
  const block = auditionBlock(world, c, l);
  if (block || !l) throw new ActingError(block ?? 'closed');
  spendHours(world, 4);
  mark(world, 'audition');
  changeStat(world, c, 'energy', -50, 'acting:audition');
  changeSkill(world, c, 'art', 5, 'acting:audition');
  const fits = APPROACH_FIT[l.genre].includes(approach);
  const typecast = knownFor(a);
  const typecastAgainst = typecast !== null && typecast !== l.genre;
  const chance = clamp(
    20 +
      skillOf(c) / 2 +
      Math.floor(c.career.reputation / 40) +
      credits(a) * 3 +
      (fits ? 15 : -5) +
      (l.directorId ? 20 : 0) +
      (a.agent ? Math.floor(a.agent.skill / 10) : 0) +
      (typecast === l.genre ? TYPECAST_BONUS : typecastAgainst ? -TYPECAST_PENALTY : 0) -
      (l.prominence === 'lead' ? 25 : l.prominence === 'supporting' ? 10 : 0) -
      (l.budget === 'studio' ? 10 : 0),
    5,
    85,
  );
  const roll = withRng(world, 'career', (rng) => rng.int(100));
  if (roll < chance) {
    l.status = 'offered';
    l.feedback = fits ? 'strongRead' : 'goodEnough';
    changeStat(world, c, 'confidence', 20, 'acting:offer');
    return { offered: true, feedback: l.feedback };
  }
  l.status = 'rejected';
  // Honest feedback: the main thing that held you back, never the dice.
  l.feedback = !fits
    ? 'wrongApproach'
    : typecastAgainst && roll < chance + TYPECAST_PENALTY
      ? 'typecast'
      : roll < chance + 10
        ? 'closeCall'
        : credits(a) < 2
          ? 'moreExperience'
          : 'otherActor';
  changeStat(world, c, 'confidence', -15, 'acting:rejected');
  return { offered: false, feedback: l.feedback };
}

export function respondBlock(
  c: Character,
  l: CastingListing | undefined,
  response: 'accept' | 'negotiate' | 'decline',
): ActingBlock | null {
  if (l?.status !== 'offered') return 'noOffer';
  if (response === 'negotiate' && l.negotiated) return 'negotiated';
  const p = (c.career.acting ?? NEW_ACTING).production;
  if (response === 'accept' && p && (p.stage === 'rehearsal' || p.stage === 'filming'))
    return 'busy';
  return null;
}

export function answerCastingOffer(
  world: World,
  c: Character,
  listingId: string,
  response: 'accept' | 'negotiate' | 'decline',
): string {
  const a = actingOf(c);
  const l = a.board.find((x) => x.id === listingId);
  const block = respondBlock(c, l, response);
  if (block || !l) throw new ActingError(block ?? 'noOffer');
  if (response === 'decline') {
    a.board = a.board.filter((x) => x !== l);
    return 'declined';
  }
  if (response === 'negotiate') {
    l.negotiated = true;
    const roll = withRng(world, 'career', (rng) => rng.int(100));
    const power =
      30 +
      Math.floor(c.career.reputation / 25) +
      (a.agent ? a.agent.skill / 3 : 0) +
      (l.budget === 'studio' ? 10 : 0);
    if (roll < power) {
      l.payMinor += applyPercent(l.payMinor, 15);
      return 'raised';
    }
    if (roll >= 85) {
      a.board = a.board.filter((x) => x !== l);
      return 'withdrawn';
    }
    return 'heldFirm';
  }
  // Accept: a production that only finished post-production can still release alongside.
  if (a.production) releaseOrEnd(world, c, a.production);
  const age = ageYears(world, c);
  const [coStar] = meetPeople(world, c, 1, 'colleague', [Math.max(18, age - 10), age + 12]);
  let directorId = l.directorId;
  if (!directorId || world.characters[directorId]?.death !== null) {
    const [d] = meetPeople(world, c, 1, 'colleague', [30, 65]);
    if (d) {
      const [given, ...family] = l.director.split(' ');
      d.identity.firstName = given ?? d.identity.firstName;
      d.identity.lastName = family.join(' ');
    }
    directorId = d?.id ?? '';
  }
  a.production = {
    title: l.title,
    format: l.format,
    genre: l.genre,
    studio: l.studio,
    director: l.director,
    character: l.character,
    prominence: l.prominence,
    script: l.script,
    budget: l.budget,
    stage: 'rehearsal',
    monthsLeft: 1,
    months: l.months,
    payMinor: l.payMinor,
    earnedMinor: 0n,
    prep: 10,
    promo: 0,
    season: 1,
    castId: coStar?.id ?? '',
    directorId,
    startTick: world.tick,
  };
  a.board = a.board.filter((x) => x !== l);
  if (l.format === 'film')
    pay(world, c, applyPercent(l.payMinor, FILM_MILESTONES.signing), 'tx.actingSigning');
  addBiography(world, c.id, 'work', 'bio.cast', { title: l.title, character: l.character });
  return 'accepted';
}

export function productionActionBlock(
  world: World,
  c: Character,
  action: ProductionAction,
): ActingBlock | null {
  const p = (c.career.acting ?? NEW_ACTING).production;
  if (!p) return 'noProduction';
  const working = p.stage === 'rehearsal' || p.stage === 'filming';
  if (
    action === 'promote'
      ? !(p.stage === 'post' || (p.format === 'tv' && p.stage === 'filming'))
      : !working
  )
    return 'wrongStage';
  if (count(world, action) > 0) return 'doneThisMonth';
  const cost = ACTION_COST[action];
  const t = timeBudget(world);
  if (t.used + cost.hours > t.total) return 'noTime';
  return c.stats.energy < cost.energy ? 'tooTired' : null;
}

/** Each action once a month; preparation gains shrink as you near full preparation. */
export function productionAction(world: World, c: Character, action: ProductionAction): string {
  const block = productionActionBlock(world, c, action);
  const p = actingOf(c).production;
  if (block || !p) throw new ActingError(block ?? 'noProduction');
  const cost = ACTION_COST[action];
  spendHours(world, cost.hours);
  mark(world, action);
  changeStat(world, c, 'energy', -cost.energy, `acting:${action}`);
  switch (action) {
    case 'studyScript':
      p.prep = clamp(p.prep + Math.max(3, 18 - Math.floor(p.prep / 6)), 0, 100);
      changeSkill(world, c, 'reading', 5, 'acting:script');
      return 'studied';
    case 'rehearse':
      p.prep = clamp(p.prep + Math.max(4, 25 - Math.floor(p.prep / 5)), 0, 100);
      changeSkill(world, c, 'art', 8, 'acting:rehearse');
      changeStat(world, c, 'stress', 15, 'acting:rehearse');
      return 'rehearsed';
    case 'workWithCast':
      adjustPair(world, c.id, p.castId, { closeness: 8, trust: 5 });
      changeSkill(world, c, 'socializing', 5, 'acting:cast');
      return 'bonded';
    case 'meetDirector': {
      const roll = withRng(world, 'career', (rng) => rng.int(100));
      if (p.prep >= 50 || roll < 55) {
        adjustPair(world, c.id, p.directorId, { closeness: 10, respect: 8 });
        p.prep = clamp(p.prep + 5, 0, 100);
        return 'directorPleased';
      }
      adjustPair(world, c.id, p.directorId, { closeness: -6, conflict: 10 });
      changeStat(world, c, 'stress', 20, 'acting:director');
      return 'creativeClash';
    }
    case 'promote':
      p.promo = clamp(p.promo + 30, 0, 100);
      actingOf(c).recognition = clamp(actingOf(c).recognition + 5, 0, 1000);
      return 'promoted';
  }
}

/** Leaving a production: no more pay, a hit to your name and to the director's trust. */
export function withdrawFromProduction(world: World, c: Character): void {
  const a = actingOf(c);
  const p = a.production;
  if (!p) throw new ActingError('noProduction');
  if (p.stage === 'post') throw new ActingError('wrongStage');
  rep(c, -100);
  adjustPair(world, c.id, p.directorId, { closeness: -30, trust: -30 });
  addMemory(world, {
    ownerId: p.directorId,
    subjectIds: [c.id],
    key: 'leftProduction',
    source: 'acting',
    valence: -60,
    salience: 70,
    decay: 'slow',
  });
  if (p.format === 'tv' && p.season > 1) endShow(world, c, p, 'left');
  a.production = null;
}

export function answerRenewal(world: World, c: Character, accept: boolean): void {
  const p = actingOf(c).production;
  if (p?.stage !== 'renewal') throw new ActingError('noRenewal');
  if (!accept) {
    endShow(world, c, p, 'left');
    actingOf(c).production = null;
    return;
  }
  p.season += 1;
  p.stage = 'filming';
  p.monthsLeft = p.months;
  p.payMinor += applyPercent(p.payMinor, 10);
  p.prep = Math.max(30, p.prep - 20);
  p.promo = 0;
}

export function agentBlock(world: World, c: Character, sign: boolean): ActingBlock | null {
  const a = c.career.acting ?? NEW_ACTING;
  if (!sign) return a.agent ? null : 'noAgent';
  if (!isActor(world, c)) return 'notActor';
  if (a.agent) return 'hasAgent';
  if (credits(a) < 1) return 'noCredits';
  return count(world, 'agent') > 0 ? 'agentTried' : null;
}

/** Approach an agent (they may say no) or part ways with yours. */
export function changeAgent(world: World, c: Character, sign: boolean): boolean {
  const block = agentBlock(world, c, sign);
  if (block) throw new ActingError(block);
  const a = actingOf(c);
  if (!sign) {
    if (a.agent) adjustPair(world, c.id, a.agent.id, { closeness: -15 });
    a.agent = null;
    return true;
  }
  mark(world, 'agent');
  const { yes, skill } = withRng(world, 'career', (rng) => ({
    yes: rng.int(100) < 35 + Math.floor(c.career.reputation / 20) + credits(a) * 5,
    skill: rng.range(30, 90),
  }));
  if (!yes) return false;
  const [npc] = meetPeople(world, c, 1, 'colleague', [28, 60]);
  if (!npc) return false;
  a.agent = {
    id: npc.id,
    name: nameOf(world, npc.id),
    commissionPct: skill >= 70 ? 15 : 10,
    skill,
  };
  return true;
}

function verdict(world: World, c: Character, p: Production) {
  const a = actingOf(c);
  const chemistry = findRelationship(world, c.id, p.castId)?.closeness ?? 30;
  const direction = findRelationship(world, c.id, p.directorId)?.closeness ?? 30;
  return withRng(world, 'career', (rng) => {
    const quality =
      Math.floor(
        (p.script * 35 + p.prep * 25 + chemistry * 15 + skillOf(c) * 15 + direction * 10) / 100,
      ) + rng.range(-12, 12);
    return {
      critics: clamp(quality + rng.range(-10, 10), 0, 100),
      audience: clamp(
        Math.floor(quality / 2) +
          (p.budget === 'studio' ? 25 : 5) +
          Math.floor(p.promo / 5) +
          Math.floor(a.recognition / 40) +
          (p.genre === trendingGenre(world) ? TREND_AUDIENCE : 0) +
          rng.range(-15, 15),
        0,
        100,
      ),
      awardRoll: rng.int(100),
    };
  });
}

/** Reception moves reputation, recognition and critical standing separately. */
function receive(
  world: World,
  c: Character,
  p: Production,
  critics: number,
  audience: number,
  awardRoll: number,
) {
  const a = actingOf(c);
  const weight = p.prominence === 'lead' ? 3 : p.prominence === 'supporting' ? 2 : 1;
  rep(c, PROMINENCE_REP[p.prominence] + (p.prep >= 60 ? 10 : -10));
  a.recognition = clamp(a.recognition + Math.floor((audience * weight) / 4), 0, 1000);
  if (p.prominence !== 'background')
    a.critics = clamp(a.critics + Math.floor(((critics - 50) * weight) / 2), 0, 1000);
  let award: 'nominated' | 'won' | null = null;
  if (p.prominence !== 'background' && critics >= 75 && awardRoll < critics - 50) {
    award = awardRoll < (critics - 70) * 2 ? 'won' : 'nominated';
    rep(c, award === 'won' ? 80 : 30);
    addBiography(world, c.id, 'work', award === 'won' ? 'bio.awardWon' : 'bio.awardNominated', {
      title: p.title,
    });
    addNotification(
      world,
      'work',
      award === 'won' ? 'ntf.awardWon' : 'ntf.awardNominated',
      { title: p.title },
      'career',
    );
  }
  const good = p.prep >= 50;
  addMemory(world, {
    ownerId: p.directorId,
    subjectIds: [c.id],
    key: good ? 'workedWellTogether' : 'underprepared',
    source: 'acting',
    valence: good ? 40 : -20,
    salience: 50,
    decay: 'slow',
  });
  adjustPair(world, c.id, p.directorId, { closeness: good ? 10 : -10 }, false);
  return award;
}

function credit(
  world: World,
  c: Character,
  p: Production,
  critics: number,
  audience: number,
  award: 'nominated' | 'won' | null,
) {
  const a = actingOf(c);
  a.filmography = [
    ...a.filmography,
    {
      title: p.title,
      format: p.format,
      genre: p.genre,
      studio: p.studio,
      director: p.director,
      character: p.character,
      prominence: p.prominence,
      script: p.script,
      budget: p.budget,
      startTick: p.startTick,
      endTick: world.tick,
      seasons: p.season,
      earnedMinor: p.earnedMinor,
      critics,
      audience,
      award,
      coStar: nameOf(world, p.castId),
    },
  ].slice(-80);
  // Older acting code counts credits for the role ladder.
  c.career.credits = (c.career.credits ?? 0) + 1;
}

function releaseOrEnd(world: World, c: Character, p: Production): void {
  if (p.format === 'tv') {
    endShow(world, c, p, 'left');
    actingOf(c).production = null;
    return;
  }
  const { critics, audience, awardRoll } = verdict(world, c, p);
  // The last milestone is what is left, so rounding never pays more or less than the fee.
  const paidSoFar =
    applyPercent(p.payMinor, FILM_MILESTONES.signing) +
    applyPercent(p.payMinor, FILM_MILESTONES.wrap);
  pay(world, c, p.payMinor - paidSoFar, 'tx.actingRelease');
  // Box-office bonus (this game's rule): a studio hit pays the cast 20% more.
  if (p.budget === 'studio' && audience >= 70)
    pay(world, c, applyPercent(p.payMinor, 20), 'tx.actingBonus');
  const award = receive(world, c, p, critics, audience, awardRoll);
  credit(world, c, p, critics, audience, award);
  addNotification(
    world,
    'work',
    'ntf.filmReleased',
    { title: p.title, critics, audience },
    'career',
  );
  actingOf(c).production = null;
}

function endShow(world: World, c: Character, p: Production, why: 'left' | 'cancelled') {
  const { critics, audience, awardRoll } = verdict(world, c, p);
  credit(world, c, p, critics, audience, receive(world, c, p, critics, audience, awardRoll));
  addNotification(
    world,
    'work',
    why === 'cancelled' ? 'ntf.showCancelled' : 'ntf.showEnded',
    { title: p.title },
    'career',
  );
}

/** Once a month for the player: the board refreshes and the production moves on a stage. */
export function processActing(world: World, c: Character): void {
  if (!c.career.acting && !isActor(world, c)) return;
  const a = actingOf(c);
  if (isActor(world, c) && ageYears(world, c) >= 16) refreshBoard(world, c);
  const p = a.production;
  if (!p) return;
  p.monthsLeft = Math.max(0, p.monthsLeft - 1);
  if (p.stage === 'filming' && p.format === 'tv') pay(world, c, p.payMinor, 'tx.actingEpisodes');
  if (p.monthsLeft > 0) return;
  switch (p.stage) {
    case 'rehearsal':
      p.stage = 'filming';
      p.monthsLeft = p.months;
      return;
    case 'filming':
      if (p.format === 'film') {
        pay(world, c, applyPercent(p.payMinor, FILM_MILESTONES.wrap), 'tx.actingWrap');
        p.stage = 'post';
        p.monthsLeft = POST_MONTHS;
        return;
      }
      {
        // Season over: the network renews on ratings, never guaranteed.
        const { audience } = verdict(world, c, p);
        const renewed = withRng(world, 'career', (rng) => audience + rng.range(-15, 15) >= 50);
        if (!renewed) {
          endShow(world, c, p, 'cancelled');
          a.production = null;
          return;
        }
        p.stage = 'renewal';
        p.monthsLeft = RENEWAL_MONTHS;
        addNotification(
          world,
          'work',
          'ntf.showRenewed',
          { title: p.title, season: p.season + 1 },
          'career',
        );
      }
      return;
    case 'post':
      releaseOrEnd(world, c, p);
      return;
    case 'renewal':
      // No answer in time: the network recasts and the show goes on without you.
      endShow(world, c, p, 'left');
      a.production = null;
  }
}

/** What the Acting section shows: blocked actions carry the reason. */
export function projectActing(world: World, c: Character) {
  if (!c.career.acting && !isActor(world, c)) return null;
  const a = c.career.acting ?? NEW_ACTING;
  const p = a.production;
  return {
    isActor: isActor(world, c),
    knownFor: knownFor(a),
    trending: trendingGenre(world),
    recognition: a.recognition,
    critics: a.critics,
    auditionsLeft: Math.max(0, AUDITIONS_PER_MONTH - count(world, 'audition')),
    agent: a.agent,
    agentReason: (() => {
      const b = a.agent ? null : agentBlock(world, c, true);
      return b ? ACTING_MESSAGES[b] : null;
    })(),
    board: a.board.map((l) => {
      return {
        ...l,
        auditionReason: (() => {
          if (l.status !== 'open') return null;
          const b = auditionBlock(world, c, l);
          return b ? ACTING_MESSAGES[b] : null;
        })(),
        acceptReason: (() => {
          const b = l.status === 'offered' ? respondBlock(c, l, 'accept') : null;
          return b ? ACTING_MESSAGES[b] : null;
        })(),
      };
    }),
    production: p
      ? {
          ...p,
          castName: nameOf(world, p.castId),
          chemistry: findRelationship(world, c.id, p.castId)?.closeness ?? 0,
          directorRapport: findRelationship(world, c.id, p.directorId)?.closeness ?? 0,
          actions: PRODUCTION_ACTIONS.map((id) => {
            const b = productionActionBlock(world, c, id);
            return { id, reason: b ? ACTING_MESSAGES[b] : null };
          }),
        }
      : null,
    filmography: [...a.filmography].reverse(),
    currency: getCountry(c.countryCode).currency,
  };
}
