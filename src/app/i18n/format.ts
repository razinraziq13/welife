import { findEvent } from '@engine/content';
import { findClub, findProgram } from '@engine/education/catalog';
import { stageName } from '@engine/education/school';
import { findCountry } from '@engine/world/countries';
import type { Age } from '@engine/core/clock';
import type { BiographyEntry, EducationStage, Notification, YearMonth } from '@engine/state/schema';
import { t, en } from './en';

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

/** Texts of content-pack events in the open life (set from the game view). */
let customTexts: Record<string, { title: string; outcomes: Record<string, string> }> = {};
export function setCustomEventTexts(texts: typeof customTexts): void {
  customTexts = texts;
}

export function eventTitle(eventId: string): string {
  const custom = customTexts[eventId];
  if (custom) return custom.title;
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
  if (typeof params.kind === 'string') {
    out.kindName = t(`kindName.${params.kind}`);
  }
  // Milestone 6 names.
  const country2 = (v: unknown) =>
    typeof v === 'string' && v.length === 2 ? countryName(v) : null;
  if (country2(params.country)) out.countryName = country2(params.country) ?? '';
  if (country2(params.from)) out.fromName = country2(params.from) ?? '';
  if (country2(params.to)) out.toName = country2(params.to) ?? '';
  if (typeof params.route === 'string') out.routeName = t(`route.${params.route}`).toLowerCase();
  if (typeof params.lost === 'string')
    out.lostNames = params.lost
      .split(', ')
      .filter((x) => x !== '')
      .map((x) => countryName(x))
      .join(', ');
  if (typeof params.outcome === 'string') out.outcomeName = t(`outcome.${params.outcome}`);
  if (typeof params.branch === 'string')
    out.branchName = t(`branch.${params.branch}`).toLowerCase();
  if (typeof params.from === 'string' && en[`religion.${params.from}`])
    out.fromReligion = t(`religion.${params.from}`).toLowerCase();
  if (typeof params.to === 'string' && en[`religion.${params.to}`])
    out.toReligion = t(`religion.${params.to}`).toLowerCase();
  if (typeof params.followers === 'number')
    out.followers = params.followers.toLocaleString('en-GB');
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
    const custom = customTexts[String(entry.params.eventId)];
    if (custom) {
      const choiceId = String(entry.params.choiceId ?? '');
      return fillText(
        custom.outcomes[choiceId === '' ? 'default' : choiceId] ?? custom.title,
        entry.params,
      );
    }
    const def = findEvent(String(entry.params.eventId));
    if (!def) return String(entry.params.eventId);
    const choiceId = String(entry.params.choiceId ?? '');
    const template =
      def.text.en.outcomes[choiceId === '' ? 'default' : choiceId] ?? def.text.en.title;
    return fillText(template, entry.params);
  }
  return t(entry.key, enrich(entry.params));
}

/** Past-tense verbs that open biography lines; "Moved to Penang." becomes "You moved to Penang." */
const STORY_VERBS = new Set([
  'Became',
  'Moved',
  'Left',
  'Started',
  'Sold',
  'Joined',
  'Lost',
  'Changed',
  'Won',
  'Went',
  'Welcomed',
  'Turned',
  'Took',
  'Signed',
  'Saw',
  'Retired',
  'Reached',
  'Married',
  'Made',
  'Learned',
  'Inherited',
  'Graduated',
  'Got',
  'Founded',
  'Finished',
  'Entered',
  'Completed',
  'Closed',
  'Broke',
  'Bought',
  'Began',
  'Died',
]);
/** Passive openings: "Was diagnosed…" becomes "You were diagnosed…". */
const STORY_PASSIVE: Record<string, string> = {
  Was: 'You were',
  Born: 'You were born',
  Promoted: 'You were promoted',
};

/**
 * A biography line as part of the player's story (Life tab feed). Event outcomes are already
 * written to the player ("You took your first steps."); biography lines have no subject, so they
 * get one. Lines that are not about the player's own action stay as they are.
 */
export function storyText(entry: BiographyEntry): string {
  const text = biographyText(entry);
  if (entry.key === 'bio.event') return text;
  const space = text.indexOf(' ');
  const first = space < 0 ? text.replace(/[.!]$/, '') : text.slice(0, space);
  const rest = space < 0 ? text.slice(first.length) : text.slice(space);
  const passive = STORY_PASSIVE[first];
  if (passive) return `${passive}${rest}`;
  if (STORY_VERBS.has(first)) return `You ${first.toLowerCase()}${rest}`;
  return text;
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
