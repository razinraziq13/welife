import { clamp, sortedKeys } from '../core/data';
import { applyBp, divRound } from '../core/money';
import { withRng } from '../core/world';
import { getCountry } from '../world/countries';
import { USD_MICRO_PER_MAJOR } from '../world/markets';
import { baseMedianWage, getRules } from '../world/rules';
import type { Economy, World } from '../state/schema';

/**
 * Aggregate background economy per country (spec §4: background population is aggregate;
 * "all later economic evolution is explicitly simulated"). A seeded business cycle drives
 * inflation, wages, unemployment, the policy rate and a retirement-fund market index.
 * All numbers PROPOSED TUNING.
 */

export function initialEconomy(code: string): Economy {
  const rates = getRules(code).rates;
  return {
    priceIndexBp: 10_000,
    wageIndexBp: 10_000,
    unemploymentBp: rates.unemploymentBp,
    policyRateBp: rates.policyBp,
    marketIndexBp: 10_000,
    cycle: 0,
    inflationBp: rates.inflationBp,
    priceIndexYearAgoBp: 10_000,
    fxIndexBp: 10_000,
    housePriceBp: 10_000,
    bondIndexBp: 10_000,
  };
}

export function ensureEconomy(world: World, code: string): Economy {
  let economy = world.economy[code];
  if (!economy) {
    economy = initialEconomy(code);
    world.economy[code] = economy;
  }
  return economy;
}

export interface MarketMove {
  /** Monthly stock (and retirement) fund return in basis points (can be negative). */
  returnBp: number;
  /** Monthly bond fund return, basis points. */
  bondReturnBp: number;
  /** Monthly change in house prices, basis points. */
  houseReturnBp: number;
}

/** World inflation the exchange rates drift against (PROPOSED TUNING). */
const WORLD_INFLATION_BP = 250;

function grow(value: number, bp: number, min: number, max: number): number {
  return clamp(value + Number(divRound(BigInt(value) * BigInt(bp), 10_000n)), min, max);
}

/** Step 5 (economy part): one month of every tracked country's economy. */
export function advanceEconomies(world: World): Map<string, MarketMove> {
  const moves = new Map<string, MarketMove>();
  for (const code of sortedKeys(world.economy)) {
    const e = world.economy[code];
    if (!e) continue;
    const base = getRules(code).rates;
    const noise = withRng(world, 'economy', (rng) => ({
      cycle: rng.range(-7, 7),
      inflation: rng.range(-6, 6),
      unemployment: rng.range(-6, 6),
      market: rng.range(-450, 450),
      bond: rng.range(-40, 40),
      house: rng.range(-30, 30),
      fx: rng.range(-60, 60),
    }));
    e.cycle = clamp(e.cycle + noise.cycle - Math.trunc(e.cycle / 10), -100, 100);
    const monthlyInflation =
      Math.trunc(base.inflationBp / 12) + Math.trunc(e.cycle / 25) + noise.inflation;
    e.priceIndexBp = clamp(
      e.priceIndexBp + Number(divRound(BigInt(e.priceIndexBp) * BigInt(monthlyInflation), 10_000n)),
      1000,
      10_000_000,
    );
    // Wages follow prices plus slow real growth (about 1% a year), faster in booms.
    const wageGrowth = monthlyInflation + 8 + Math.trunc(e.cycle / 20);
    e.wageIndexBp = clamp(
      e.wageIndexBp + Number(divRound(BigInt(e.wageIndexBp) * BigInt(wageGrowth), 10_000n)),
      1000,
      10_000_000,
    );
    e.unemploymentBp = clamp(
      e.unemploymentBp +
        Math.trunc((base.unemploymentBp - e.unemploymentBp) / 24) -
        Math.trunc(e.cycle / 8) +
        noise.unemployment,
      100,
      4000,
    );
    // The policy rate leans against inflation above the country's baseline.
    const target = clamp(
      base.policyBp + Math.trunc(((e.inflationBp - base.inflationBp) * 3) / 2),
      0,
      3000,
    );
    e.policyRateBp = clamp(e.policyRateBp + Math.trunc((target - e.policyRateBp) / 12), 0, 3000);
    const returnBp = 45 + e.cycle * 2 + noise.market;
    e.marketIndexBp = clamp(
      e.marketIndexBp + Number(divRound(BigInt(e.marketIndexBp) * BigInt(returnBp), 10_000n)),
      500,
      100_000_000,
    );
    if (world.clock.month === 1) {
      e.inflationBp = clamp(
        Number(
          divRound(
            BigInt(e.priceIndexBp - e.priceIndexYearAgoBp) * 10_000n,
            BigInt(e.priceIndexYearAgoBp),
          ),
        ),
        -2000,
        5000,
      );
      e.priceIndexYearAgoBp = e.priceIndexBp;
    }
    // Bonds earn roughly the policy rate; house prices follow inflation, the cycle and rates;
    // currencies drift against higher inflation (simulated exchange rates, decision R5).
    const bondReturnBp = Math.trunc(e.policyRateBp / 12) + noise.bond;
    e.bondIndexBp = grow(e.bondIndexBp, bondReturnBp, 500, 10_000_000);
    const houseReturnBp =
      Math.trunc(base.inflationBp / 12) +
      10 +
      Math.trunc(e.cycle / 10) -
      Math.trunc((e.policyRateBp - base.policyBp) / 60) +
      noise.house;
    e.housePriceBp = grow(e.housePriceBp, houseReturnBp, 500, 10_000_000);
    const fxChange = -Math.trunc((e.inflationBp - WORLD_INFLATION_BP) / 12) + noise.fx;
    e.fxIndexBp = grow(e.fxIndexBp, fxChange, 100, 1_000_000);
    moves.set(code, { returnBp, bondReturnBp, houseReturnBp });
  }
  return moves;
}

/** Median monthly wage now (start median indexed by simulated wage growth). */
export function medianWage(world: World, code: string): bigint {
  const index = world.economy[code]?.wageIndexBp ?? 10_000;
  return applyBp(baseMedianWage(code), index);
}

/** Scales a start-of-game price by simulated inflation. */
export function indexedPrice(world: World, code: string, amount: bigint): bigint {
  const index = world.economy[code]?.priceIndexBp ?? 10_000;
  return applyBp(amount, index);
}

/** Savings rate follows the policy rate. */
export function savingsRateBp(world: World, code: string): number {
  const rules = getRules(code).rates;
  const policy = world.economy[code]?.policyRateBp ?? rules.policyBp;
  return clamp(rules.savingsBp + (policy - rules.policyBp), 0, 3000);
}

/** US dollars (millionths) per major unit of a country's currency now. */
function usdMicro(world: World, code: string): bigint {
  const currency = getCountry(code).currency.code;
  const base = USD_MICRO_PER_MAJOR[currency];
  if (base === undefined) throw new Error(`No exchange rate for ${currency}`);
  return BigInt(base) * BigInt(world.economy[code]?.fxIndexBp ?? 10_000);
}

/**
 * Converts an amount between two countries' currencies at the simulated exchange rate
 * (integer maths, rounded half away from zero).
 */
export function convert(
  world: World,
  amount: bigint,
  fromCountry: string,
  toCountry: string,
): bigint {
  if (fromCountry === toCountry) return amount;
  const from = getCountry(fromCountry).currency;
  const to = getCountry(toCountry).currency;
  if (from.code === to.code) return amount;
  const numerator = amount * usdMicro(world, fromCountry) * 10n ** BigInt(to.exponent);
  const denominator = usdMicro(world, toCountry) * 10n ** BigInt(from.exponent);
  return divRound(numerator, denominator);
}
