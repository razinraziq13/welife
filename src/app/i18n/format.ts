import { findEvent } from '@engine/content';
import { findClub, findProgram } from '@engine/education/catalog';
import { stageName } from '@engine/education/school';
import { findCountry } from '@engine/world/countries';
import type { Age } from '@engine/core/clock';
import type { BiographyEntry, EducationStage, Notification, YearMonth } from '@engine/state/schema';
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

export interface CurrencyLike {
  code: string;
  exponent: number;
}

/** Money is stored in minor units (integers); this only formats for display. */
export function formatMoney(minor: number | bigint, currency: CurrencyLike): string {
  const value = typeof minor === 'bigint' ? Number(minor) : minor;
  const major = value / 10 ** currency.exponent;
  const small = Math.abs(major) < 100 && currency.exponent > 0;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: small ? 2 : 0,
    maximumFractionDigits: small ? 2 : 0,
  }).format(major);
}

/** With an explicit sign, for cash-flow lines. */
export function formatSignedMoney(minor: bigint, currency: CurrencyLike): string {
  const text = formatMoney(minor < 0n ? -minor : minor, currency);
  return minor < 0n ? `−${text}` : `+${text}`;
}

/** Basis points as a percentage, e.g. 375 -> "3.75%". */
export function formatBp(bp: number): string {
  const whole = bp % 100 === 0;
  return `${(bp / 100).toFixed(whole ? 0 : bp % 10 === 0 ? 1 : 2)}%`;
}

/** Major units typed by the player -> minor-unit string for commands (null if invalid). */
export function toMinorString(input: string, currency: CurrencyLike): string | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > currency.exponent) return null;
  const minor =
    BigInt(whole) * 10n ** BigInt(currency.exponent) +
    BigInt((fraction + '0'.repeat(currency.exponent)).slice(0, currency.exponent) || '0');
  if (minor <= 0n || minor > 999_999_999_999_999_999n) return null;
  return minor.toString();
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

export function programName(id: string): string {
  return findProgram(id)?.name ?? id;
}

export function clubName(id: string): string {
  return findClub(id)?.name ?? id;
}

/** Replaces {placeholders} in event text with the event's parameters. */
export function fillText(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const value = params[name];
    return value === undefined || value === ''
      ? name === 'subject'
        ? 'someone'
        : `{${name}}`
      : String(value);
  });
}

/** Qualification code ("bachelor:computing") as words. */
export function qualificationName(code: string, countryCode: string): string {
  const [kind = '', field] = code.split(':');
  if (field) return `${t(`level.${kind}`)} in ${programName(field)}`;
  if (
    kind === 'preschool' ||
    kind === 'primary' ||
    kind === 'lowerSecondary' ||
    kind === 'upperSecondary'
  ) {
    return stageName(countryCode, kind);
  }
  return code;
}

let activeCurrency: CurrencyLike | null = null;
/** The open life's currency, so engine messages with amounts can be formatted. */
export function setActiveCurrency(currency: CurrencyLike | null): void {
  activeCurrency = currency;
}

/** Turns engine parameters into readable names before interpolation. */
function enrich(params: Record<string, string | number>): Record<string, string | number> {
  const out = { ...params };
  if (typeof params.stage === 'string') {
    out.stageName =
      typeof params.country === 'string' && params.country.length === 2
        ? stageName(params.country, params.stage as EducationStage)
        : t(`stage.${params.stage}`);
  }
  if (typeof params.activityId === 'string') out.activityName = t(`activity.${params.activityId}`);
  if (typeof params.cause === 'string') out.causeName = t(`cause.${params.cause}`);
  if (typeof params.relation === 'string')
    out.relationName = t(`relation.${params.relation}`).toLowerCase();
  if (typeof params.trade === 'string') out.trade = t(`trade.${params.trade}`);
  if (typeof params.eventId === 'string') out.eventTitle = eventTitle(params.eventId);
  if (typeof params.rule === 'string') out.ruleName = t(`rule.${params.rule}`);
  if (typeof params.clubId === 'string') {
    out.clubName = clubName(params.clubId);
    out.competitionName = findClub(params.clubId)?.competition?.name ?? '';
  }
  if (typeof params.programId === 'string') out.programName = programName(params.programId);
  if (typeof params.level === 'string') out.levelName = t(`level.${params.level}`);
  if (typeof params.place === 'number') out.placeName = t(`place.${String(params.place)}`);
  if (typeof params.option === 'string') out.optionName = t(`vacation.${params.option}`);
  if (typeof params.type === 'string') out.typeName = t(`policy.${params.type}`).toLowerCase();
  if (typeof params.product === 'string')
    out.productName = t(`loan.${params.product}`).toLowerCase();
  if (typeof params.size === 'string') out.sizeName = t(`homeSize.${params.size}`).toLowerCase();
  if (typeof params.bp === 'number') {
    out.percent = params.bp / 100;
    out.percentText = formatBp(params.bp);
  }
  if (typeof params.scholarship === 'number') {
    out.scholarshipText =
      params.scholarship > 0 ? ` with a ${String(params.scholarship)}% scholarship` : '';
  }
  if (typeof params.exam === 'string') {
    out.examText =
      params.exam !== '' && params.score !== ''
        ? ` (${params.exam}: ${String(params.score)}/100)`
        : '';
  }
  if (typeof params.amount === 'string' && /^-?\d+$/.test(params.amount)) {
    out.amountText = activeCurrency
      ? formatMoney(BigInt(params.amount), activeCurrency)
      : params.amount;
  }
  if (typeof params.value === 'string') {
    const value = params.value;
    const named: Record<string, string> = {
      true: 'on',
      false: 'off',
    };
    out.valueName =
      named[value] ??
      (['casual', 'realistic', 'challenging'].includes(value)
        ? t(`difficulty.${value}`)
        : ['relaxed', 'steady', 'focused'].includes(value)
          ? t(`effort.${value}`)
          : ['coast', 'hard'].includes(value)
            ? t(`workEffort.${value}`)
            : t(`lifestyle.${value}`));
  }
  return out;
}

export function biographyText(entry: BiographyEntry): string {
  if (entry.key === 'bio.event') {
    const def = findEvent(String(entry.params.eventId));
    if (!def) return String(entry.params.eventId);
    const choiceId = String(entry.params.choiceId ?? '');
    const template =
      def.text.en.outcomes[choiceId === '' ? 'default' : choiceId] ?? def.text.en.title;
    return fillText(template, entry.params);
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
    case 'school':
      return 'School';
    case 'club':
      return extra === 'award' ? `${clubName(id)} award` : clubName(id);
    case 'work':
      return id === 'promotion' ? 'Promotion' : id === 'laidOff' ? 'Losing a job' : 'Work';
    case 'social':
      return 'Time with people';
    case 'family':
      return 'Family';
    case 'calendar':
      return id === 'vacation' ? 'Holiday' : id === 'wedding' ? 'Wedding' : 'Health check-up';
    case 'money':
      return 'Money worries';
    default:
      return cause;
  }
}

export function notificationText(notification: Notification): string {
  if (notification.messageKey === 'ntf.event') {
    const title = eventTitle(String(notification.params.eventId));
    return fillText(title, notification.params);
  }
  return t(notification.messageKey, enrich(notification.params));
}

/** A command outcome's message (`out.*`, `int.*` keys). */
export function outcomeText(key: string, params: Record<string, string | number>): string {
  return t(key, enrich(params));
}

/** A ledger transaction's description. */
export function transactionText(kind: string, params: Record<string, string | number>): string {
  return t(kind, enrich(params));
}
