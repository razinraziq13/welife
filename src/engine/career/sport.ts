import { clamp } from '../core/data';
import { applyPercent } from '../core/money';
import { Rng } from '../core/rng';
import { addBiography, addNotification, ageYears, withRng } from '../core/world';
import { spendHours, timeBudget } from '../calendar/time';
import { changeSkill, changeStat } from '../characters/stats';
import { medianWage } from '../economy/economy';
import { receiveIncome } from '../economy/finance';
import { getCountry } from '../world/countries';
import type { Character, SportState, World } from '../state/schema';
import { SPORTS } from '../state/schema';
import { activeEmployment, endEmployment, makeTerms, startEmployment } from './jobs';
import { getOccupation } from './occupations';

/**
 * The athlete career (decision E98). Three sports that compete differently: football is an
 * eight-club league where draws count; basketball a league with no draws and a top-four
 * playoff; tennis has no club, only monthly tournaments, prize money and a ranking. Team
 * players earn a club contract through a trial (the contract is a job, paid by payroll);
 * selection depends on fitness and form, explained when you are left out. Each month you
 * choose training and how you play key moments; fixtures then resolve with seeded swings.
 * Clubs and tournaments are fictional. All numbers PROPOSED TUNING.
 */

type Sport = (typeof SPORTS)[number];
const SEASON_MONTHS = 8;
const CONTRACT_MONTHS = 24;
const MIN_AGE = 16;
const CLUBS: Record<'football' | 'basketball', readonly string[]> = {
  football: [
    'Westbridge FC',
    'Northport United',
    'Riverside Rovers',
    'Harbour Athletic',
    'Kingsfield Town',
    'Ashdown City',
    'Meadow Park',
    'Coalport Wanderers',
  ],
  basketball: [
    'Harbour Hawks',
    'Northgate Lynx',
    'Riverbend Comets',
    'Summit Stags',
    'Lantern Owls',
    'Copperleaf Kings',
    'Bluefin Breakers',
    'Ashdown Arrows',
  ],
};
const TENNIS_ROUNDS = ['first round', 'second round', 'quarter-final', 'semi-final', 'final'];
/** Ranking points and prize (% of the median wage) by how far you got (0 = lost first round). */
const ROUND_POINTS = [5, 15, 35, 70, 130, 220];
const ROUND_PRIZE = [3, 8, 15, 30, 60, 120];

export const SPORT_MESSAGES = {
  tooYoung: `Professional sport starts at ${String(MIN_AGE)}.`,
  noSport: 'Choose a sport first.',
  sameSport: 'You already play this sport.',
  hasClub: 'You already play for a club.',
  noClubs: 'Tennis has no clubs: enter tournaments as an individual.',
  trialSoon: 'Clubs hold trials every three months; try again later.',
  trained: 'You have already done this training this month.',
  noTime: 'You have no free time left this month.',
  tooTired: 'You are too tired; rest first.',
} as const;
export type SportBlock = keyof typeof SPORT_MESSAGES;

export class SportError extends Error {
  constructor(readonly code: SportBlock) {
    super(SPORT_MESSAGES[code]);
    this.name = 'SportError';
  }
}

const isTeam = (s: Sport): s is 'football' | 'basketball' => s !== 'tennis';
const count = (world: World, key: string) =>
  world.activity.tick === world.tick ? (world.activity.counts[`sport:${key}`] ?? 0) : 0;

function newLeague(world: World, sport: Sport): SportState['league'] {
  if (!isTeam(sport)) return [];
  const rng = Rng.fromSeed(`${world.seed}:league:${sport}`);
  return CLUBS[sport].map((name) => ({
    name,
    strength: rng.range(350, 750),
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
  }));
}

export function startBlock(world: World, c: Character, sport: Sport): SportBlock | null {
  if (ageYears(world, c) < MIN_AGE) return 'tooYoung';
  return c.career.sport?.sport === sport ? 'sameSport' : null;
}

/** Commit to a sport (or switch): team sports then need a trial, tennis turns pro at once. */
export function chooseSport(world: World, c: Character, sport: Sport): void {
  const block = startBlock(world, c, sport);
  if (block) throw new SportError(block);
  if (c.career.sport?.club) leaveClub(world, c);
  c.career.sport = {
    sport,
    club: null,
    contractEndTick: null,
    role: 'reserve',
    form: 50,
    readiness: 70,
    approach: 'balanced',
    autopilot: false,
    league: newLeague(world, sport),
    seasonMonth: 0,
    season: { apps: 0, scored: 0, wins: 0 },
    rankingPoints: 0,
    lastResult: null,
    trialTick: null,
    record: c.career.sport?.record ?? [],
  };
  if (sport === 'tennis') signContract(world, c, 'Independent (tennis tour)', 15);
}

/** The contract is a job: the club is the employer, payroll pays the salary. */
function signContract(world: World, c: Character, club: string, payPercent: number): void {
  if (c.employmentId) endEmployment(world, c, 'quit');
  const occupation = getOccupation('professional-athlete');
  const terms = makeTerms(world, occupation, 0, 'fixedTerm', c.locationId, club);
  const salary = applyPercent(medianWage(world, c.countryCode), payPercent);
  startEmployment(
    world,
    c,
    { ...terms, salaryMinMinor: salary, salaryMaxMinor: salary * 3n },
    salary,
  );
}

function leaveClub(world: World, c: Character): void {
  const job = activeEmployment(world, c);
  if (job?.terms.occupationId === 'professional-athlete') endEmployment(world, c, 'quit');
  if (c.career.sport) {
    c.career.sport.club = null;
    c.career.sport.contractEndTick = null;
  }
}

export function trialBlock(world: World, c: Character): SportBlock | null {
  const s = c.career.sport;
  if (!s) return 'noSport';
  if (!isTeam(s.sport)) return 'noClubs';
  if (s.club) return 'hasClub';
  if (s.trialTick !== null && world.tick - s.trialTick < 3) return 'trialSoon';
  return null;
}

/** A club trial: fitness and form against the squad's needs; rejection says why. */
export function trial(world: World, c: Character): boolean {
  const block = trialBlock(world, c);
  const s = c.career.sport;
  if (block || !s || !isTeam(s.sport)) throw new SportError(block ?? 'noSport');
  s.trialTick = world.tick;
  const { roll, club } = withRng(world, 'career', (rng) => ({
    roll: rng.int(100),
    club: rng.pick(s.league),
  }));
  const chance = clamp(Math.floor(c.skills.fitness / 10) - 15 + Math.floor(s.form / 5), 5, 85);
  if (roll >= chance) {
    s.lastResult =
      c.skills.fitness < 450
        ? 'Trial: the coach needs a fitter player. Train and try again in three months.'
        : roll < chance + 15
          ? 'Trial: close, but the squad is full at your position this time.'
          : 'Trial: other triallists were in better form on the day.';
    return false;
  }
  // Stronger clubs pay more; fitter players earn more.
  signContract(
    world,
    c,
    club.name,
    40 + Math.floor(club.strength / 10) + Math.floor(c.skills.fitness / 20),
  );
  s.club = club.name;
  s.contractEndTick = world.tick + CONTRACT_MONTHS;
  s.lastResult = `Trial: ${club.name} offered you a two-year contract.`;
  addBiography(world, c.id, 'work', 'bio.signedClub', { club: club.name });
  return true;
}

export function trainBlock(
  world: World,
  c: Character,
  kind: 'technical' | 'tactical' | 'recovery',
): SportBlock | null {
  if (!c.career.sport) return 'noSport';
  if (count(world, kind) > 0) return 'trained';
  const t = timeBudget(world);
  if (t.used + 4 > t.total) return 'noTime';
  return kind !== 'recovery' && c.stats.energy < 40 ? 'tooTired' : null;
}

/** Training, each kind once a month; gains shrink as fitness nears its peak. */
export function train(
  world: World,
  c: Character,
  kind: 'technical' | 'tactical' | 'recovery',
  auto = false,
): void {
  const s = c.career.sport;
  const block = auto ? null : trainBlock(world, c, kind);
  if (block || !s) throw new SportError(block ?? 'noSport');
  if (!auto) spendHours(world, 4);
  if (world.activity.tick !== world.tick)
    world.activity = { tick: world.tick, counts: {}, hoursUsed: 0 };
  world.activity.counts[`sport:${kind}`] = 1;
  if (kind === 'technical') {
    changeSkill(
      world,
      c,
      'fitness',
      Math.max(3, 20 - Math.floor(c.skills.fitness / 60)),
      'sport:train',
    );
    changeStat(world, c, 'energy', -40, 'sport:train');
    s.form = clamp(s.form + 5, 0, 100);
  } else if (kind === 'tactical') {
    changeSkill(world, c, 'logic', 4, 'sport:tactics');
    s.form = clamp(s.form + 8, 0, 100);
    s.readiness = clamp(s.readiness - 5, 0, 100);
  } else {
    // Rest is part of the job: readiness recovers, nothing is gained by skipping it.
    s.readiness = clamp(s.readiness + 30, 0, 100);
    changeStat(world, c, 'stress', -20, 'sport:recovery');
  }
}

function roleFor(c: Character, s: SportState): SportState['role'] {
  const level = c.skills.fitness + s.form * 3 + s.readiness;
  return level >= 900 ? 'starter' : level >= 700 ? 'rotation' : 'reserve';
}

const APPROACH = { safe: [0, 6], balanced: [2, 12], bold: [4, 22] } as const;

/** One month of a team season: four rounds, every club plays; yours is lifted by you. */
function teamMonth(world: World, c: Character, s: SportState): void {
  const rng = new Rng(world.rng.career);
  s.role = s.club ? roleFor(c, s) : 'reserve';
  const mine = s.league.find((t) => t.name === s.club);
  const contribution =
    mine && s.role !== 'reserve'
      ? Math.floor(c.skills.fitness / 25 + s.form / 5) * (s.role === 'starter' ? 2 : 1)
      : 0;
  let playedHere = 0;
  for (let round = 0; round < 4; round++) {
    const order = [...s.league].sort((a, b) => rng.int(3) - 1 || (a.name < b.name ? -1 : 1));
    for (let i = 0; i + 1 < order.length; i += 2) {
      const home = order[i];
      const away = order[i + 1];
      if (!home || !away) continue;
      const strength = (t: typeof home) => t.strength + (t === mine ? contribution : 0);
      const diff = strength(home) - strength(away) + 30 + rng.range(-180, 180);
      const draw = s.sport === 'football' && Math.abs(diff) < 50;
      for (const t of [home, away]) t.played += 1;
      if (draw) {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      } else {
        const [w, l] = diff > 0 ? [home, away] : [away, home];
        w.won += 1;
        l.lost += 1;
        w.points += s.sport === 'football' ? 3 : 2;
      }
      if (mine && (home === mine || away === mine) && s.role !== 'reserve') {
        playedHere += 1;
        s.season.apps += 1;
        const [base, swing] = APPROACH[s.approach];
        const won = !draw && diff > 0 === (home === mine);
        if (won) s.season.wins += 1;
        s.season.scored +=
          s.sport === 'football'
            ? Math.max(0, Math.floor((base + rng.range(-8, swing) + s.form / 10) / 10))
            : Math.max(0, 6 + base + rng.range(-4, swing) + Math.floor(s.form / 10));
        s.form = clamp(s.form + (won ? 4 : draw ? 0 : -4), 0, 100);
      }
    }
  }
  world.rng.career = rng.state();
  s.readiness = clamp(s.readiness - playedHere * 4, 0, 100);
  s.lastResult =
    s.club === null
      ? null
      : s.role === 'reserve'
        ? `Left out this month: the coach picks fitter, in-form players (fitness ${String(Math.round(c.skills.fitness / 10))}, form ${String(s.form)}, readiness ${String(s.readiness)}).`
        : `Played ${String(playedHere)} match${playedHere === 1 ? '' : 'es'} as a ${s.role === 'starter' ? 'starter' : 'squad rotation player'}.`;
}

function standings(s: SportState) {
  return [...s.league].sort(
    (a, b) => b.points - a.points || b.won - a.won || (a.name < b.name ? -1 : 1),
  );
}

/** Season end: the table (basketball adds a top-four playoff), the record, the contract. */
function endSeason(world: World, c: Character, s: SportState): void {
  const table = standings(s);
  let champion = table[0]?.name ?? '';
  if (s.sport === 'basketball') {
    const [a, b, c2, d] = table;
    const rng = Rng.fromSeed(`${world.seed}:playoff:${String(world.tick)}`);
    const beat = (x?: (typeof table)[number], y?: (typeof table)[number]) =>
      x && y ? (x.strength + rng.range(-150, 150) >= y.strength ? x : y) : (x ?? y);
    champion = beat(beat(a, d), beat(b, c2))?.name ?? champion;
  }
  const place = table.findIndex((t) => t.name === s.club) + 1;
  const trophy = s.club !== null && champion === s.club;
  if (s.club) {
    s.record = [
      ...s.record,
      {
        year: world.clock.year,
        sport: s.sport,
        club: s.club,
        finish:
          s.sport === 'basketball' && trophy
            ? 'Playoff champions'
            : `${String(place)}${['st', 'nd', 'rd'][place - 1] ?? 'th'} of ${String(table.length)}`,
        apps: s.season.apps,
        scored: s.season.scored,
        trophy,
      },
    ].slice(-60);
    if (trophy) {
      addBiography(world, c.id, 'work', 'bio.sportTitle', { club: s.club });
      addNotification(world, 'work', 'ntf.sportTitle', { club: s.club }, 'career');
    }
  }
  for (const t of s.league)
    Object.assign(t, {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      points: 0,
      strength: clamp(t.strength + withRng(world, 'career', (rng) => rng.range(-40, 40)), 300, 850),
    });
  s.seasonMonth = 0;
  s.season = { apps: 0, scored: 0, wins: 0 };
}

/** Tennis: one tournament a month; each round's odds depend on fitness, form and approach. */
function tournamentMonth(world: World, c: Character, s: SportState): void {
  const [base, swing] = APPROACH[s.approach];
  let round = 0;
  withRng(world, 'career', (rng) => {
    while (round < TENNIS_ROUNDS.length) {
      const chance = clamp(
        55 +
          Math.floor((c.skills.fitness - 500) / 8) +
          Math.floor(s.form / 5) -
          round * 9 +
          base +
          rng.range(-swing, swing),
        5,
        92,
      );
      if (rng.int(100) >= chance) break;
      round += 1;
    }
  });
  s.rankingPoints = Math.floor((s.rankingPoints * 9) / 10) + (ROUND_POINTS[round] ?? 0);
  s.form = clamp(s.form + (round >= 3 ? 6 : round === 0 ? -5 : 1), 0, 100);
  s.readiness = clamp(s.readiness - 10 - round * 3, 0, 100);
  s.season.apps += round + 1;
  s.season.wins += round;
  const prize = applyPercent(medianWage(world, c.countryCode), ROUND_PRIZE[round] ?? 0);
  const into = c.finance?.checkingId ?? c.finance?.savingsId;
  if (into && prize > 0n) receiveIncome(world, c.id, into, 'sport', prize, 'tx.prizeMoney');
  const won = round === TENNIS_ROUNDS.length;
  if (won) {
    s.record = [
      ...s.record,
      {
        year: world.clock.year,
        sport: 'tennis' as const,
        club: 'Tennis tour',
        finish: `Title (month ${String(world.clock.month)})`,
        apps: TENNIS_ROUNDS.length,
        scored: 0,
        trophy: true,
      },
    ].slice(-60);
    addNotification(world, 'work', 'ntf.tennisTitle', {}, 'career');
  }
  s.lastResult = won
    ? 'You won the tournament!'
    : `Tournament: out in the ${TENNIS_ROUNDS[round] ?? 'final'}.`;
}

export function tennisRank(points: number): number {
  return clamp(100 - Math.floor(points / 8), 1, 100);
}

/** Once a month for the player. */
export function processSport(world: World, c: Character): void {
  const s = c.career.sport;
  if (!s) return;
  if (s.autopilot) train(world, c, s.readiness < 50 ? 'recovery' : 'technical', true);
  if (s.sport === 'tennis') tournamentMonth(world, c, s);
  else if (s.club) {
    teamMonth(world, c, s);
    s.seasonMonth += 1;
    if (s.seasonMonth >= SEASON_MONTHS) endSeason(world, c, s);
    if (s.contractEndTick !== null && world.tick >= s.contractEndTick) {
      // Renewal follows what you showed; otherwise you are released and can trial again.
      const job = activeEmployment(world, c);
      if (s.role !== 'reserve' && job) {
        job.salaryMinor += applyPercent(job.salaryMinor, 15);
        s.contractEndTick = world.tick + CONTRACT_MONTHS;
        addNotification(world, 'work', 'ntf.contractRenewed', { club: s.club }, 'career');
      } else {
        addNotification(world, 'work', 'ntf.released', { club: s.club }, 'career');
        leaveClub(world, c);
      }
    }
  }
  s.readiness = clamp(s.readiness + 10, 0, 100);
}

export function projectSport(world: World, c: Character) {
  const s = c.career.sport;
  const msg = (b: SportBlock | null) => (b ? SPORT_MESSAGES[b] : null);
  return {
    choose: SPORTS.map((sport) => ({ sport, reason: msg(startBlock(world, c, sport)) })),
    state: s
      ? {
          ...s,
          table: standings(s),
          rank: tennisRank(s.rankingPoints),
          contractMonthsLeft:
            s.contractEndTick === null ? null : Math.max(0, s.contractEndTick - world.tick),
          trialReason: msg(trialBlock(world, c)),
          training: (['technical', 'tactical', 'recovery'] as const).map((kind) => ({
            kind,
            reason: msg(trainBlock(world, c, kind)),
          })),
          salaryMinor:
            activeEmployment(world, c)?.terms.occupationId === 'professional-athlete'
              ? (activeEmployment(world, c)?.salaryMinor ?? 0n)
              : 0n,
        }
      : null,
    currency: getCountry(c.countryCode).currency,
  };
}
