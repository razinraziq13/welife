import { findEvent } from '@engine/content';
import { findCountry } from '@engine/world/countries';
import type { Age } from '@engine/core/clock';
import type { BiographyEntry, Notification, YearMonth } from '@engine/state/schema';
import { t } from './en';

const monthFormat = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortMonthFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatMonth(ym: YearMonth): string {
  return monthFormat.format(new Date(Date.UTC(ym.year, ym.month - 1, 1)));
}

export function formatShortMonth(ym: YearMonth): string {
  return shortMonthFormat.format(new Date(Date.UTC(ym.year, ym.month - 1, 1)));
}

export function formatAge(age: Age): string {
  if (age.years === 0) return age.months === 1 ? '1 month' : `${String(age.months)} months`;
  const years = age.years === 1 ? '1 year' : `${String(age.years)} years`;
  return age.months === 0 ? years : `${years}, ${String(age.months)} mo`;
}

/** Money is stored in minor units (integers); this only formats for display. */
export function formatMoney(minor: number, currency: { code: string; exponent: number }): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.code,
    maximumFractionDigits: 0,
  }).format(minor / 10 ** currency.exponent);
}

/** Fixed-point tenths (0..1000) to the 0..100 scale shown to players. */
export function displayValue(fixed: number): number {
  return Math.round(fixed / 10);
}

export function countryName(code: string | null): string {
  if (code === null) return '';
  return findCountry(code)?.name ?? code;
}

export function eventTitle(eventId: string): string {
  return findEvent(eventId)?.text.en.title ?? eventId;
}

/** Turns engine parameters into readable names before interpolation. */
function enrich(params: Record<string, string | number>): Record<string, string | number> {
  const out = { ...params };
  if (typeof params.stage === 'string') out.stageName = t(`stage.${params.stage}`);
  if (typeof params.activityId === 'string') out.activityName = t(`activity.${params.activityId}`);
  if (typeof params.cause === 'string') out.causeName = t(`cause.${params.cause}`);
  if (typeof params.relation === 'string')
    out.relationName = t(`relation.${params.relation}`).toLowerCase();
  if (typeof params.trade === 'string') out.trade = t(`trade.${params.trade}`);
  if (typeof params.eventId === 'string') out.eventTitle = eventTitle(params.eventId);
  if (typeof params.rule === 'string') out.ruleName = t(`rule.${params.rule}`);
  if (typeof params.value === 'string') {
    const value = params.value;
    out.valueName = value === 'true' ? 'on' : value === 'false' ? 'off' : t(`difficulty.${value}`);
  }
  return out;
}

export function biographyText(entry: BiographyEntry): string {
  if (entry.key === 'bio.event') {
    const def = findEvent(String(entry.params.eventId));
    if (!def) return String(entry.params.eventId);
    const choiceId = String(entry.params.choiceId ?? '');
    return def.text.en.outcomes[choiceId === '' ? 'default' : choiceId] ?? def.text.en.title;
  }
  return t(entry.key, enrich(entry.params));
}

const MONTHLY_CAUSES: Record<string, string> = {
  health: 'Monthly health',
  stress: 'Stress easing',
  mood: 'Mood settling',
  energy: 'Monthly energy',
  'growing-up': 'Growing up',
};

/** Readable cause for a stat change (spec §4: stat changes include explicit causes). */
export function causeText(cause: string): string {
  const [kind = '', id = '', extra] = cause.split(':');
  switch (kind) {
    case 'activity':
      return `${t(`activity.${id}`)}${extra === 'tired' ? ' (tired)' : ''}`;
    case 'event':
      return eventTitle(id);
    case 'monthly':
      return MONTHLY_CAUSES[id] ?? 'Monthly change';
    case 'needs':
      return id === 'unmet' ? 'Unmet needs' : 'Needs met';
    case 'loss':
      return 'Grief';
    default:
      return cause;
  }
}

export function notificationText(notification: Notification): string {
  return t(notification.messageKey, enrich(notification.params));
}
