import { z } from 'zod';
import { canonicalJson } from '@engine/core/data';
import { CommandSchema } from '@engine/core/commands';
import { WORLD_SCHEMA_VERSION, YearMonthSchema } from '@engine/state/schema';
import { CONTENT_VERSION, ENGINE_VERSION } from '@engine/version';
import { decodeValue, fromBase64, hashValue, sha256Hex, toBase64 } from './codec';
import {
  DB_SCHEMA_VERSION,
  type BranchRow,
  type CommandRow,
  type HeadRow,
  type SaveRow,
  type SnapshotRow,
  type WeLifeDatabase,
} from './db';
import { MigrationError } from './migrations';
import { PersistenceError, reconstructWorld, validateHeadState } from './saves';
import { summarizeWorld } from '@engine/view';

/**
 * Save export/import (spec §5): a single JSON file containing schema and content versions,
 * every timeline branch and snapshot, branch heads and the command log, protected by a
 * SHA-256 checksum. Imports are validated completely before anything is written, and ids are
 * remapped so the same file can be imported more than once.
 */

export const BUNDLE_FORMAT = 'welife-save';
export const BUNDLE_VERSION = 1;
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

const Iso = z.string().min(10).max(40);
const Base64 = z.string().max(MAX_IMPORT_BYTES);

const BundleBodySchema = z
  .object({
    format: z.literal(BUNDLE_FORMAT),
    bundleVersion: z.number().int().min(1),
    exportedAt: Iso,
    app: z
      .object({
        engineVersion: z.string().max(40),
        contentVersion: z.string().max(40),
        worldSchemaVersion: z.number().int(),
        dbSchemaVersion: z.number().int(),
      })
      .strict(),
    save: z
      .object({
        id: z.string().max(80),
        displayName: z.string().min(1).max(80),
        worldId: z.string().max(80),
        createdAt: Iso,
        updatedAt: Iso,
        currentBranchId: z.string().max(80),
        layout: z
          .object({
            order: z.array(z.string().max(40)).max(40),
            hidden: z.array(z.string().max(40)).max(40),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    branches: z
      .array(
        z
          .object({
            id: z.string().max(80),
            name: z.string().min(1).max(80),
            parentBranchId: z.string().max(80).nullable(),
            forkSnapshotId: z.string().max(80).nullable(),
            headSnapshotId: z.string().max(80),
            createdAt: Iso,
          })
          .strict(),
      )
      .min(1)
      .max(1000),
    snapshots: z
      .array(
        z
          .object({
            id: z.string().max(80),
            branchId: z.string().max(80),
            parentId: z.string().max(80).nullable(),
            tick: z.number().int().min(0),
            clock: YearMonthSchema,
            kind: z.enum(['full', 'delta']),
            depth: z.number().int().min(0),
            payload: Base64,
            hash: z.string().length(64),
            engineVersion: z.string().max(40),
            contentVersion: z.string().max(40),
            createdAt: Iso,
          })
          .strict(),
      )
      .min(1)
      .max(200_000),
    heads: z
      .array(
        z
          .object({
            branchId: z.string().max(80),
            state: Base64,
            hash: z.string().length(64),
            updatedAt: Iso,
          })
          .strict(),
      )
      .min(1),
    commands: z
      .array(
        z
          .object({
            commandId: z.string().max(80),
            branchId: z.string().max(80),
            seq: z.number().int().min(1),
            tick: z.number().int().min(0),
            command: CommandSchema,
            outcome: z.unknown(),
          })
          .strict(),
      )
      .max(2_000_000),
  })
  .strict();
type BundleBody = z.infer<typeof BundleBodySchema>;

export async function exportSave(
  db: WeLifeDatabase,
  saveId: string,
): Promise<{ fileName: string; json: string }> {
  const save = await db.saves.get(saveId);
  if (!save) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
  const [branches, snapshots, heads, commands] = await Promise.all([
    db.branches.where('saveId').equals(saveId).toArray(),
    db.snapshots.where('saveId').equals(saveId).toArray(),
    db.heads.where('saveId').equals(saveId).toArray(),
    db.commands.where('saveId').equals(saveId).toArray(),
  ]);
  const body: BundleBody = {
    format: BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    app: {
      engineVersion: ENGINE_VERSION,
      contentVersion: CONTENT_VERSION,
      worldSchemaVersion: WORLD_SCHEMA_VERSION,
      dbSchemaVersion: DB_SCHEMA_VERSION,
    },
    save: {
      id: save.id,
      displayName: save.displayName,
      worldId: save.worldId,
      createdAt: save.createdAt,
      updatedAt: save.updatedAt,
      currentBranchId: save.currentBranchId,
      layout: save.layout,
    },
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      parentBranchId: b.parentBranchId,
      forkSnapshotId: b.forkSnapshotId,
      headSnapshotId: b.headSnapshotId,
      createdAt: b.createdAt,
    })),
    snapshots: snapshots
      .sort((a, b) => a.tick - b.tick || (a.id < b.id ? -1 : 1))
      .map((s) => ({
        id: s.id,
        branchId: s.branchId,
        parentId: s.parentId,
        tick: s.tick,
        clock: s.clock,
        kind: s.kind,
        depth: s.depth,
        payload: toBase64(s.payload),
        hash: s.hash,
        engineVersion: s.engineVersion,
        contentVersion: s.contentVersion,
        createdAt: s.createdAt,
      })),
    heads: heads.map((h) => ({
      branchId: h.branchId,
      state: toBase64(h.state),
      hash: h.hash,
      updatedAt: h.updatedAt,
    })),
    commands: commands
      .sort((a, b) => (a.branchId < b.branchId ? -1 : a.branchId > b.branchId ? 1 : a.seq - b.seq))
      .map((c) => ({
        commandId: c.commandId,
        branchId: c.branchId,
        seq: c.seq,
        tick: c.tick,
        command: c.command,
        outcome: c.outcome,
      })),
  };
  const checksum = await sha256Hex(canonicalJson(body));
  const json = JSON.stringify({ ...body, checksum });
  const safeName =
    save.displayName
      .replace(/[^a-zA-Z0-9 _-]+/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'welife-save';
  return { fileName: `${safeName}.welife.json`, json };
}

/** Upgrades older bundle versions to the current one. */
function migrateBundle(raw: Record<string, unknown>): Record<string, unknown> {
  const version = raw.bundleVersion;
  if (typeof version !== 'number') throw new MigrationError('The file has no format version.');
  if (version > BUNDLE_VERSION)
    throw new MigrationError('This file was exported by a newer version of WeLife.');
  // No older bundle versions exist yet.
  return raw;
}

export class ImportError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(message: string, issues: { path: string; message: string }[] = []) {
    super(message);
    this.name = 'ImportError';
    this.issues = issues;
  }
}

/**
 * Validates and imports a save file as a NEW save slot. Nothing is written unless the whole
 * file passes: format, checksum, structure, references, and every snapshot's integrity hash.
 */
export async function importSave(db: WeLifeDatabase, json: string): Promise<string> {
  if (json.length > MAX_IMPORT_BYTES)
    throw new ImportError('The file is too large to be a WeLife save.');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { format?: unknown }).format !== BUNDLE_FORMAT
  ) {
    throw new ImportError('This is not a WeLife save file.');
  }
  const { checksum, ...rest } = raw as Record<string, unknown>;
  let migrated: Record<string, unknown>;
  try {
    migrated = migrateBundle(rest);
  } catch (error) {
    throw new ImportError(error instanceof Error ? error.message : 'Unsupported file version.');
  }
  const parsed = BundleBodySchema.safeParse(migrated);
  if (!parsed.success) {
    throw new ImportError(
      'The save file is damaged or incomplete.',
      parsed.error.issues
        .slice(0, 10)
        .map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
    );
  }
  const body = parsed.data;
  if (typeof checksum !== 'string' || (await sha256Hex(canonicalJson(rest))) !== checksum) {
    throw new ImportError('The save file failed its checksum. It may have been edited or damaged.');
  }

  // Reference checks.
  const snapshotIds = new Set(body.snapshots.map((s) => s.id));
  const branchIds = new Set(body.branches.map((b) => b.id));
  const problems: { path: string; message: string }[] = [];
  if (!branchIds.has(body.save.currentBranchId))
    problems.push({ path: 'save.currentBranchId', message: 'Unknown branch.' });
  for (const b of body.branches) {
    if (!snapshotIds.has(b.headSnapshotId))
      problems.push({ path: `branches.${b.id}`, message: 'Missing head snapshot.' });
    if (b.parentBranchId !== null && !branchIds.has(b.parentBranchId))
      problems.push({ path: `branches.${b.id}`, message: 'Unknown parent branch.' });
    if (!body.heads.some((h) => h.branchId === b.id))
      problems.push({ path: `branches.${b.id}`, message: 'Missing branch state.' });
  }
  for (const s of body.snapshots) {
    if (!branchIds.has(s.branchId))
      problems.push({ path: `snapshots.${s.id}`, message: 'Unknown branch.' });
    if (s.parentId !== null && !snapshotIds.has(s.parentId))
      problems.push({ path: `snapshots.${s.id}`, message: 'Missing parent snapshot.' });
    if (s.kind === 'delta' && s.parentId === null)
      problems.push({ path: `snapshots.${s.id}`, message: 'Delta without a parent.' });
  }
  if (problems.length > 0)
    throw new ImportError('The save file has broken references.', problems.slice(0, 10));

  // Remap ids so importing never collides with existing saves.
  const saveId = crypto.randomUUID();
  const branchMap = new Map(body.branches.map((b) => [b.id, crypto.randomUUID()]));
  const snapshotMap = new Map(body.snapshots.map((s) => [s.id, crypto.randomUUID()]));
  const mapBranch = (id: string): string => branchMap.get(id) ?? id;
  const mapSnapshot = (id: string): string => snapshotMap.get(id) ?? id;

  const snapshots: SnapshotRow[] = body.snapshots.map((s) => ({
    ...s,
    id: mapSnapshot(s.id),
    saveId,
    branchId: mapBranch(s.branchId),
    parentId: s.parentId === null ? null : mapSnapshot(s.parentId),
    payload: fromBase64(s.payload),
  }));
  const heads: HeadRow[] = body.heads.map((h) => ({
    branchId: mapBranch(h.branchId),
    saveId,
    state: fromBase64(h.state),
    hash: h.hash,
    updatedAt: h.updatedAt,
  }));
  const branches: BranchRow[] = body.branches.map((b) => ({
    ...b,
    id: mapBranch(b.id),
    saveId,
    parentBranchId: b.parentBranchId === null ? null : mapBranch(b.parentBranchId),
    forkSnapshotId: b.forkSnapshotId === null ? null : mapSnapshot(b.forkSnapshotId),
    headSnapshotId: mapSnapshot(b.headSnapshotId),
  }));
  const commands: CommandRow[] = body.commands.map((c) => ({
    saveId,
    commandId: c.commandId,
    branchId: mapBranch(c.branchId),
    seq: c.seq,
    tick: c.tick,
    command: c.command,
    outcome: c.outcome as CommandRow['outcome'],
  }));

  // Verify every snapshot and head in an isolated in-memory pass before writing anything.
  const staging = new Map(snapshots.map((s) => [s.id, s]));
  const fakeDb = {
    snapshots: { get: (id: string) => Promise.resolve(staging.get(id)) },
  } as unknown as WeLifeDatabase;
  for (const s of snapshots) {
    try {
      await reconstructWorld(fakeDb, s.id);
    } catch (error) {
      throw new ImportError(
        `Month ${String(s.clock.year)}-${String(s.clock.month)} failed its integrity check.`,
        [
          {
            path: `snapshots.${s.id}`,
            message: error instanceof Error ? error.message : 'invalid',
          },
        ],
      );
    }
  }
  for (const h of heads) {
    const value = await decodeValue(h.state);
    if ((await hashValue(value)) !== h.hash)
      throw new ImportError('A timeline state failed its integrity check.');
  }

  const currentHead = heads.find((h) => h.branchId === mapBranch(body.save.currentBranchId));
  const state = validateHeadState(await decodeValue(currentHead?.state ?? new Uint8Array()));
  const save: SaveRow = {
    id: saveId,
    displayName: body.save.displayName,
    worldId: body.save.worldId,
    createdAt: body.save.createdAt,
    updatedAt: new Date().toISOString(),
    worldSchemaVersion: state.world.schemaVersion,
    engineVersion: body.app.engineVersion,
    contentVersion: body.app.contentVersion,
    currentBranchId: mapBranch(body.save.currentBranchId),
    difficulty: state.world.rules.difficulty,
    easyMigration: state.world.rules.easyMigration,
    summary: summarizeWorld(state.world),
    layout: body.save.layout,
    checksum: currentHead?.hash ?? '',
  };

  await db.transaction(
    'rw',
    [db.saves, db.branches, db.snapshots, db.heads, db.commands],
    async () => {
      await db.saves.add(save);
      await db.branches.bulkAdd(branches);
      await db.snapshots.bulkAdd(snapshots);
      await db.heads.bulkAdd(heads);
      await db.commands.bulkAdd(commands);
    },
  );
  return saveId;
}

/** Duplicates a save slot (all timelines) under a new name. */
export async function duplicateSave(
  db: WeLifeDatabase,
  saveId: string,
  displayName: string,
): Promise<string> {
  const { json } = await exportSave(db, saveId);
  const body = JSON.parse(json) as { save: { displayName: string }; checksum?: string } & Record<
    string,
    unknown
  >;
  delete body.checksum;
  body.save.displayName = displayName;
  const checksum = await sha256Hex(canonicalJson(body));
  return importSave(db, JSON.stringify({ ...body, checksum }));
}
