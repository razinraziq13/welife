import { applyBp, divRound, maxBig, progressiveTax } from '../core/money';
import { getRules, majorToMinor, socialBands, taxBands } from '../world/rules';
import type { World } from '../state/schema';

/**
 * Income tax and social contributions (spec §4 Finance: country tax bands; baseline
 * figures from `world/rules.ts`). Bands and allowances are indexed to simulated prices,
 * as most countries index their thresholds.
 */

function priceIndex(world: World, code: string): number {
  return world.economy[code]?.priceIndexBp ?? 10_000;
}

function indexedBands(world: World, bands: { fromMinor: bigint; rateBp: number }[], code: string) {
  const index = priceIndex(world, code);
  return bands.map((b) => ({ fromMinor: applyBp(b.fromMinor, index), rateBp: b.rateBp }));
}

/** Annual income tax on an annual gross amount. */
export function annualIncomeTax(world: World, code: string, annualGross: bigint): bigint {
  const rules = getRules(code).tax;
  const index = priceIndex(world, code);
  if (annualGross <= applyBp(majorToMinor(code, rules.taxFreeBelow), index)) return 0n;
  const allowance = applyBp(majorToMinor(code, rules.allowance), index);
  const taxable = maxBig(0n, annualGross - allowance);
  return progressiveTax(taxable, indexedBands(world, taxBands(code), code));
}

/** Annual employee social contributions. */
export function annualSocial(world: World, code: string, annualGross: bigint): bigint {
  return progressiveTax(annualGross, indexedBands(world, socialBands(code), code));
}

export interface Payslip {
  gross: bigint;
  tax: bigint;
  social: bigint;
  /** Mandatory employee pension contribution (account-based systems). */
  pension: bigint;
  /** Voluntary contribution chosen by the player. */
  voluntary: bigint;
  /** Employer contribution into the employee's retirement account. */
  employerPension: bigint;
  net: bigint;
}

/**
 * Monthly payslip with withholding on the annualised salary (PAYE-style). The player's tax
 * is reconciled against actual earnings at the end of each tax year.
 */
export function payslip(
  world: World,
  code: string,
  monthlyGross: bigint,
  voluntaryBp: number,
  hasRetirementAccount: boolean,
): Payslip {
  const rules = getRules(code);
  const annual = monthlyGross * 12n;
  const tax = divRound(annualIncomeTax(world, code, annual), 12n);
  const social = divRound(annualSocial(world, code, annual), 12n);
  const pension =
    rules.pension.kind === 'account' ? applyBp(monthlyGross, rules.pension.employeeBp) : 0n;
  let voluntary = hasRetirementAccount ? applyBp(monthlyGross, voluntaryBp) : 0n;
  // Voluntary saving never takes pay below zero (mandatory deductions are always < 100%).
  voluntary = maxBig(
    0n,
    voluntary < monthlyGross - tax - social - pension
      ? voluntary
      : monthlyGross - tax - social - pension,
  );
  let employerPension = 0n;
  if (hasRetirementAccount) {
    if (rules.pension.kind === 'account')
      employerPension += applyBp(monthlyGross, rules.pension.employerBp);
    const match = Math.min(voluntaryBp, rules.pension.employerMatchBp);
    employerPension += applyBp(monthlyGross, match);
  }
  const net = monthlyGross - tax - social - pension - voluntary;
  return { gross: monthlyGross, tax, social, pension, voluntary, employerPension, net };
}
