import { BUSINESS_MESSAGES } from '@engine/business/business';
import { CALENDAR_MESSAGES } from '@engine/calendar/calendar';
import { JOB_MESSAGES } from '@engine/career/jobs';
import { HEALTH_MESSAGES } from '@engine/civics/health';
import { LAW_MESSAGES } from '@engine/civics/law';
import { MIGRATION_MESSAGES } from '@engine/civics/migration';
import { MILITARY_MESSAGES } from '@engine/civics/military';
import { POLITICS_MESSAGES } from '@engine/civics/politics';
import { RELIGION_MESSAGES } from '@engine/civics/religion';
import { ROYAL_MESSAGES } from '@engine/civics/royal';
import { FINANCE_MESSAGES } from '@engine/economy/finance';
import { INVESTMENT_MESSAGES } from '@engine/economy/investments';
import { WILL_MESSAGES } from '@engine/legacy/inheritance';
import { LEGACY_MESSAGES } from '@engine/legacy/legacy';
import { MEDIA_MESSAGES } from '@engine/media/media';
import { PROPERTY_MESSAGES } from '@engine/property/property';
import { INTERACTION_BLOCK_MESSAGES } from '@engine/social/interactions';
import { WORK_ACTION_MESSAGES } from '@engine/career/workActions';
import { LIFESTYLE_MESSAGES } from '@engine/activities/lifestyle';

/**
 * English text for refused commands, keyed `err.<ErrorName>.<code>` (spec P-10). The engine's
 * message tables are the English source; a translation supplies the same keys.
 */
const TABLES: [string, Record<string, string>][] = [
  ['BusinessError', BUSINESS_MESSAGES],
  ['CalendarError', CALENDAR_MESSAGES],
  ['JobError', JOB_MESSAGES],
  ['HealthError', HEALTH_MESSAGES],
  ['LawError', LAW_MESSAGES],
  ['MigrationError', MIGRATION_MESSAGES],
  ['MilitaryError', MILITARY_MESSAGES],
  ['PoliticsError', POLITICS_MESSAGES],
  ['ReligionError', RELIGION_MESSAGES],
  ['RoyalError', ROYAL_MESSAGES],
  ['FinanceError', FINANCE_MESSAGES],
  ['InvestmentError', INVESTMENT_MESSAGES],
  ['WillError', WILL_MESSAGES],
  ['LegacyError', LEGACY_MESSAGES],
  ['MediaError', MEDIA_MESSAGES],
  ['PropertyError', PROPERTY_MESSAGES],
  ['InteractionError', INTERACTION_BLOCK_MESSAGES],
  ['WorkActionError', WORK_ACTION_MESSAGES],
  ['LifestyleError', LIFESTYLE_MESSAGES],
];

export const enErrors: Record<string, string> = Object.fromEntries(
  TABLES.flatMap(([name, table]) =>
    Object.entries(table).map(([code, text]) => [`err.${name}.${code}`, text]),
  ),
);
