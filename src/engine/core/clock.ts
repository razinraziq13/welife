import type { YearMonth } from '../state/schema';

/** Absolute month index: year * 12 + (month - 1). */
export function monthIndex(ym: YearMonth): number {
  return ym.year * 12 + ym.month - 1;
}

export function fromMonthIndex(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

export function addMonths(ym: YearMonth, months: number): YearMonth {
  return fromMonthIndex(monthIndex(ym) + months);
}

/** Whole months between birth and now (0 in the month of birth). */
export function ageInMonths(birth: YearMonth, now: YearMonth): number {
  return monthIndex(now) - monthIndex(birth);
}

export interface Age {
  years: number;
  months: number;
  totalMonths: number;
}

export function ageOf(birth: YearMonth, now: YearMonth): Age {
  const totalMonths = Math.max(0, ageInMonths(birth, now));
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalMonths };
}

/** Months until the next birthday (0 when the birthday is this month). */
export function monthsUntilBirthday(birth: YearMonth, now: YearMonth): number {
  return (((birth.month - now.month) % 12) + 12) % 12;
}
