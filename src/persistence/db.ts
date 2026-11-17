import { Dexie, type EntityTable } from 'dexie';
import type { AppSettings } from '@contracts/appSettings';

export const DEFAULT_DATABASE_NAME = 'welife';

/**
 * Current IndexedDB schema version. Every bump must add a `this.version(n)` block
 * below (never edit an old one) so existing installs migrate forward.
 */
export const DB_SCHEMA_VERSION = 1;

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface AppSettingsRow {
  key: 'app';
  value: AppSettings;
}

export class WeLifeDatabase extends Dexie {
  declare meta: EntityTable<MetaRow, 'key'>;
  declare settings: EntityTable<AppSettingsRow, 'key'>;

  constructor(name: string = DEFAULT_DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      meta: 'key',
      settings: 'key',
    });
  }
}
