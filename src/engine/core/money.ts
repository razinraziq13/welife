/**
 * Integer money maths (spec §4 Finance): amounts are bigint minor units, rates are integer
 * basis points (1 bp = 0.01%). Nothing here uses floating point, so results are identical
 * on every platform.
 */

export const BP = 10_000n;

/** Rounds `numerator / denominator` half away from zero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('divRound: division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/** amount x bp / 10000, rounded half away from zero. */
export function applyBp(amount: bigint, bp: number): bigint {
  return divRound(amount * BigInt(bp), BP);
}

/** amount x percent / 100, rounded. */
export function applyPercent(amount: bigint, percent: number): bigint {
  return divRound(amount * BigInt(percent), 100n);
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Converts a safe integer (e.g. country data) to minor units. */
export function toMinor(value: number): bigint {
  if (!Number.isSafeInteger(value)) throw new RangeError('toMinor: not a safe integer');
  return BigInt(value);
}

/**
 * Fixed monthly payment for an amortised loan:
 *   P x r / (1 - (1 + r)^-n), with r = annual rate / 12.
 * Computed with bigint fixed-point (1e12 scale) and rounded up to the minor unit, so the
 * final payment never leaves a residue larger than one regular payment.
 */
export function amortisedPayment(principal: bigint, annualRateBp: number, months: number): bigint {
  if (months <= 0) throw new RangeError('amortisedPayment: months must be positive');
  if (principal <= 0n) return 0n;
  if (annualRateBp === 0) return divCeil(principal, BigInt(months));
  const SCALE = 1_000_000_000_000n;
  // Monthly rate scaled: r = bp / 10000 / 12.
  const r = divRound(BigInt(annualRateBp) * SCALE, BP * 12n);
  // (1 + r)^n, scaled.
  let growth = SCALE;
  for (let i = 0; i < months; i++) growth = divRound(growth * (SCALE + r), SCALE);
  // payment = P * r * growth / (growth - 1)
  const numerator = principal * r * growth;
  const denominator = (growth - SCALE) * SCALE;
  let payment = divCeil(numerator, denominator);
  // Interest is rounded to the minor unit every month; nudge the payment up until the
  // rounded schedule is repaid within the term (a few units at most).
  while (!repaidWithin(principal, annualRateBp, months, payment)) {
    payment += 1n + payment / 100_000n;
  }
  return payment;
}

/** True if a loan is repaid within `months` payments using the game's monthly interest. */
function repaidWithin(
  principal: bigint,
  annualRateBp: number,
  months: number,
  payment: bigint,
): boolean {
  let balance = principal;
  for (let i = 0; i < months && balance > 0n; i++) {
    balance += monthlyInterest(balance, annualRateBp);
    balance -= payment < balance ? payment : balance;
  }
  return balance === 0n;
}

export function divCeil(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('divCeil: denominator must be positive');
  if (numerator <= 0n) return -(-numerator / denominator);
  return (numerator + denominator - 1n) / denominator;
}

/** Monthly interest on a balance at an annual rate, rounded half away from zero. */
export function monthlyInterest(balance: bigint, annualRateBp: number): bigint {
  return divRound(balance * BigInt(annualRateBp), BP * 12n);
}

/** Progressive tax on an annual amount with ascending band thresholds (spec §4 taxes). */
export function progressiveTax(
  annual: bigint,
  bands: readonly { fromMinor: bigint; rateBp: number }[],
): bigint {
  if (annual <= 0n) return 0n;
  let tax = 0n;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    if (!band) continue;
    if (annual <= band.fromMinor) break;
    const next = bands[i + 1];
    const upper = next ? minBig(annual, next.fromMinor) : annual;
    tax += applyBp(upper - band.fromMinor, band.rateBp);
  }
  return tax;
}
