import { clamp, sortedKeys } from '../core/data';
import { applyBp, divRound } from '../core/money';
import { withRng } from '../core/world';
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
  /** Monthly fund return in basis points (can be negative). */
  returnBp: number;
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
    moves.set(code, { returnBp });
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
