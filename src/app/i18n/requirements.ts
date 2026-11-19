import type { Predicate } from '@engine/events/schema';
import { t } from './en';

/**
 * Plain-English reason for a choice that is not open to the player, from the condition the
 * engine reports as unmet. Common conditions get a specific sentence; anything else gets a
 * general one, so a closed choice always says something.
 */

const STAT_FACT = /^(stats|needs|skills)\.([a-zA-Z]+)$/;

function statName(group: string, key: string): string {
  const prefix = group === 'skills' ? 'skill' : group === 'needs' ? 'need' : 'stat';
  return t(`${prefix}.${key}`);
}

function compare(op: string, value: number, unit = ''): string {
  switch (op) {
    case 'gte':
      return `at least ${String(value)}${unit}`;
    case 'gt':
      return `more than ${String(value)}${unit}`;
    case 'lte':
      return `at most ${String(value)}${unit}`;
    case 'lt':
      return `less than ${String(value)}${unit}`;
    case 'ne':
      return `anything but ${String(value)}${unit}`;
    default:
      return `exactly ${String(value)}${unit}`;
  }
}

const YES_NO: Record<string, [string, string]> = {
  'job.employed': ['You need a job.', 'Not while you have a job.'],
  'social.partnered': ['You need a partner.', 'Not while you have a partner.'],
  'social.married': ['You need to be married.', 'Not while you are married.'],
  'home.own': ['You need to own your home.', 'Not while you own your home.'],
  'money.inDebt': ['Only while you are in debt.', 'Not while you are in debt.'],
  'school.private': ['Only at a private school.', 'Not at a private school.'],
  'legacy.hasWill': ['You need a will.', 'Not while you have a will.'],
  'civic.citizen': ['You need to be a citizen here.', 'Not as a citizen here.'],
};

export function requirementText(p: Predicate | null): string {
  if (p === null) return '';
  if (p.kind === 'cmp') {
    if (typeof p.value === 'boolean') {
      const pair = YES_NO[p.fact];
      const wanted = p.op === 'ne' ? !p.value : p.value;
      if (pair) return wanted ? pair[0] : pair[1];
    }
    if (typeof p.value === 'number') {
      if (p.fact === 'age.years') return `You need to be ${compare(p.op, p.value)} years old.`;
      const stat = STAT_FACT.exec(p.fact);
      // Stats are stored in tenths (0-1000) and shown as 0-100.
      if (stat?.[1] && stat[2])
        return `Needs ${statName(stat[1], stat[2])} of ${compare(p.op, Math.round(p.value / 10))}.`;
      if (p.fact === 'money.savingsMonths')
        return `You need savings worth ${compare(p.op, p.value)} months of income.`;
      if (p.fact === 'social.children') return `You need ${compare(p.op, p.value)} children.`;
      if (p.fact === 'social.friends') return `You need ${compare(p.op, p.value)} friends.`;
      if (p.fact === 'school.grade')
        return `Needs a school grade of ${compare(p.op, Math.round(p.value / 10))}.`;
    }
  }
  if (p.kind === 'in' && p.fact === 'stage') return 'Not at your stage of life.';
  if (p.kind === 'in' && p.fact === 'country') return 'Not available in the country you live in.';
  return 'Your situation right now doesn’t allow this.';
}
