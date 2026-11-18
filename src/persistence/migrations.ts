import { WORLD_SCHEMA_VERSION } from '@engine/state/schema';
import { upgradeWorldV1, upgradeWorldV2 } from '@engine/state/upgrade';

/**
 * Forward migrations for stored worlds and export bundles (spec §5 "migrate older versions").
 * Each entry upgrades from version N to N+1:
 * - 1 -> 2 (Milestones 3-4): people, education, work, money and calendar systems are added
 *   deterministically (`@engine/state/upgrade`); existing history and status are kept.
 * - 2 -> 3 (Milestone 5): companies, competitors, properties and new market indices start
 *   empty or at their start level.
 */

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

const WORLD_MIGRATIONS: Record<number, Migration> = {
  1: upgradeWorldV1,
  2: upgradeWorldV2,
};

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function migrateWorld(
  raw: unknown,
  migrations: Record<number, Migration> = WORLD_MIGRATIONS,
): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  let current = raw as Record<string, unknown>;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : NaN;
  if (!Number.isInteger(version)) throw new MigrationError('Saved world has no schema version.');
  if (version > WORLD_SCHEMA_VERSION) {
    throw new MigrationError(
      'This save was made by a newer version of WeLife. Update the app to open it.',
    );
  }
  while (version < WORLD_SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new MigrationError(`No migration from world schema ${String(version)}.`);
    current = step(current);
    version += 1;
    current.schemaVersion = version;
  }
  return current;
}
