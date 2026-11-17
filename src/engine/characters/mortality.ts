import type { Difficulty } from '../state/schema';

/**
 * Non-graphic, age/health/circumstance-dependent mortality (spec §1, §4 Difficulty).
 * Integer-only arithmetic so results are identical in every JS engine.
 *
 * Base annual probabilities (per 100,000) are a rounded, stylised mortality curve for a
 * country with a life expectancy of about 80 years. PROPOSED TUNING VALUES.
 */
const ANNUAL_PER_100K: readonly [maxAge: number, rate: number][] = [
  [0, 400],
  [4, 25],
  [14, 12],
  [24, 60],
  [34, 90],
  [44, 170],
  [54, 380],
  [64, 900],
  [74, 2_000],
  [84, 5_500],
  [94, 15_000],
  [Number.POSITIVE_INFINITY, 33_000],
];

export function annualRatePer100k(ageYears: number): number {
  for (const [maxAge, rate] of ANNUAL_PER_100K) if (ageYears <= maxAge) return rate;
  return 33_000;
}

/** Monthly probability of death in parts per million. */
export function monthlyMortalityPpm(input: {
  ageYears: number;
  health: number; // fixed-point tenths
  lifeExpectancy: number;
  difficulty: Difficulty;
}): number {
  let rate = annualRatePer100k(input.ageYears) * 10; // per million per year
  // Country circumstances: each year of life expectancy below 80 raises risk by 4%.
  const countryPercent = Math.max(70, 100 + (80 - input.lifeExpectancy) * 4);
  rate = Math.floor((rate * countryPercent) / 100);
  // Personal health.
  const healthPercent =
    input.health < 200
      ? 400
      : input.health < 350
        ? 220
        : input.health < 500
          ? 140
          : input.health > 800
            ? 80
            : 100;
  rate = Math.floor((rate * healthPercent) / 100);
  // Difficulty: Casual is more forgiving; Challenging is not more lethal (no arbitrary penalties).
  if (input.difficulty === 'casual') rate = Math.floor((rate * 70) / 100);
  return Math.min(500_000, Math.floor(rate / 12));
}
