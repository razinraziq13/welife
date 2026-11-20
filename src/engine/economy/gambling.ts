import { applyBp } from '../core/money';
import { ageYears, withRng } from '../core/world';
import { changeStat } from '../characters/stats';
import { getCountry } from '../world/countries';
import { medianWage } from './economy';
import { categoryAccount, post } from './ledger';
import type { Character, World } from '../state/schema';

/**
 * Lottery tickets and casino bets, paid from the current account. Both lose money on average
 * (PROPOSED TUNING): the lottery pays back about half of what it takes, roulette about 97%.
 */

const GAMBLING_MESSAGES = {
  tooYoung: 'Gambling is for adults (18 and over).',
  noAccount: 'You need a current account to gamble.',
  insufficientFunds: 'You do not have enough cash in your current account.',
} as const;
type GamblingRejection = keyof typeof GAMBLING_MESSAGES;

export class GamblingError extends Error {
  constructor(readonly code: GamblingRejection) {
    super(GAMBLING_MESSAGES[code]);
    this.name = 'GamblingError';
  }
}

/** A ticket costs 0.1% of the median monthly wage (about RM2.60 in Malaysia at the start). */
export function ticketPrice(world: World, c: Character): bigint {
  return applyBp(medianWage(world, c.countryCode), 10);
}

/** Prizes per ticket, rarest first: [one in N, prize in tickets]. Expected return ≈ 50%. */
const LOTTERY_PRIZES = [
  [10_000_000, 2_000_000],
  [50_000, 5_000],
  [20, 4],
] as const;

/** Roulette, betting on red: 18 of 37 pockets double the stake. */
const RED_POCKETS = 18;
const POCKETS = 37;

function checking(world: World, c: Character) {
  const account = world.ledger.accounts[c.finance?.checkingId ?? ''];
  return account?.ownerId === c.id && account.closedTick === null ? account : undefined;
}

function gamblingBlock(world: World, c: Character, stake: bigint): GamblingRejection | null {
  if (ageYears(world, c) < 18) return 'tooYoung';
  const account = checking(world, c);
  if (!account) return 'noAccount';
  return account.balance < stake ? 'insufficientFunds' : null;
}

export function projectGambling(world: World, c: Character) {
  const price = ticketPrice(world, c);
  const block = gamblingBlock(world, c, price);
  return {
    ticketMinor: price,
    jackpotMinor: price * BigInt(LOTTERY_PRIZES[0][1]),
    maxBetMinor: checking(world, c)?.balance ?? 0n,
    currency: getCountry(c.countryCode).currency,
    reason: block ? GAMBLING_MESSAGES[block] : null,
  };
}

/** Pays the stake, then any prize, and returns the prize (0n for a loss). */
function play(
  world: World,
  c: Character,
  game: 'lottery' | 'casino',
  stake: bigint,
  prize: bigint,
) {
  const block = gamblingBlock(world, c, stake);
  if (block) throw new GamblingError(block);
  const account = checking(world, c);
  if (!account) throw new GamblingError('noAccount');
  const cur = account.currency;
  post(world, `tx.${game}Stake`, [
    { accountId: categoryAccount(world, c.id, 'expense', 'gambling', cur), debit: stake },
    { accountId: account.id, credit: stake },
  ]);
  if (prize > 0n)
    post(world, `tx.${game}Prize`, [
      { accountId: account.id, debit: prize },
      { accountId: categoryAccount(world, c.id, 'income', 'gambling', cur), credit: prize },
    ]);
  changeStat(world, c, 'happiness', prize > stake ? 30 : -5, `gambling:${game}`);
  return prize;
}

export function buyLotteryTicket(world: World, c: Character): bigint {
  const price = ticketPrice(world, c);
  const prize = withRng(world, 'economy', (rng) => {
    for (const [odds, tickets] of LOTTERY_PRIZES)
      if (rng.int(odds) === 0) return price * BigInt(tickets);
    return 0n;
  });
  return play(world, c, 'lottery', price, prize);
}

export function placeBet(world: World, c: Character, stake: bigint): bigint {
  const win = withRng(world, 'economy', (rng) => rng.int(POCKETS) < RED_POCKETS);
  return play(world, c, 'casino', stake, win ? stake * 2n : 0n);
}
