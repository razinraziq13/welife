import { Dexie } from 'dexie';
import { diff, applyPatch, type PatchOp } from '@engine/core/diff';
import type { Command, CommandOutcome, SimState } from '@engine/core/commands';
import { checkInvariants } from '@engine/core/invariants';
import { WorldSchema, type World } from '@engine/state/schema';
import { CONTENT_VERSION, ENGINE_VERSION } from '@engine/version';
import { summarizeWorld } from '@engine/view';
import { decodeValue, encodeValue, hashValue, IntegrityError } from './codec';
import { migrateWorld } from './migrations';
import type { BranchInfo, SaveListItem, SnapshotInfo, TimelineData } from '@contracts/saves';
import type {
  BranchRow,
  CommandRow,
  DashboardLayoutRow,
  HeadRow,
  SaveRow,
  SnapshotRow,
  WeLifeDatabase,
} from './db';

/** A full snapshot is stored at least every this many months (PROPOSED TUNING). */
export const KEYFRAME_INTERVAL = 12;

export type PersistenceErrorCode = 'NOT_FOUND' | 'CORRUPTED' | 'CONFLICT' | 'INVALID';

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  constructor(code: PersistenceErrorCode, message: string) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
  }
}

const nowIso = (): string => new Date().toISOString();
const uuid = (): string => crypto.randomUUID();

/** Everything the worker keeps in memory for the open save. */
export interface Session {
  save: SaveRow;
  branch: BranchRow;
  state: SimState;
  headHash: string;
  headSnapshot: SnapshotRow;
  /** World at the head snapshot: the base for the next monthly delta. */
  headSnapshotWorld: World;
  nextSeq: number;
  replayGuaranteed: boolean;
}

export function validateHeadState(raw: unknown): SimState {
  if (typeof raw !== 'object' || raw === null || !('world' in raw)) {
    throw new PersistenceError('CORRUPTED', 'Saved state is missing its world.');
  }
  const { world, pending } = raw as { world: unknown; pending: unknown };
  const parse = (value: unknown, label: string): World => {
    const parsed = WorldSchema.safeParse(migrateWorld(value));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new PersistenceError(
        'CORRUPTED',
        `Saved ${label} is invalid at ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? ''}`,
      );
    }
    const violations = checkInvariants(parsed.data);
    if (violations.length > 0)
      throw new PersistenceError(
        'CORRUPTED',
        `Saved ${label} is inconsistent: ${violations[0] ?? ''}`,
      );
    return parsed.data;
  };
  return {
    world: parse(world, 'world'),
    pending: pending === null || pending === undefined ? null : parse(pending, 'pending month'),
  };
}

async function snapshotRow(
  saveId: string,
  branchId: string,
  world: World,
  parent: { row: SnapshotRow; world: World } | null,
): Promise<SnapshotRow> {
  // A new engine version always starts a fresh keyframe, so deltas never mix world formats.
  const full =
    parent === null ||
    parent.row.depth + 1 >= KEYFRAME_INTERVAL ||
    parent.row.engineVersion !== ENGINE_VERSION;
  const hash = await hashValue(world);
  const payload = full
    ? (await encodeValue(world)).bytes
    : (await encodeValue(diff(parent.world, world))).bytes;
  return {
    id: uuid(),
    saveId,
    branchId,
    parentId: parent?.row.id ?? null,
    tick: world.tick,
    clock: world.clock,
    kind: full ? 'full' : 'delta',
    depth: full ? 0 : parent.row.depth + 1,
    payload,
    hash,
    engineVersion: ENGINE_VERSION,
    contentVersion: CONTENT_VERSION,
    createdAt: nowIso(),
  };
}

/** Creates a save slot for a newly created world (month 0 snapshot + head). */
export async function createSave(
  db: WeLifeDatabase,
  world: World,
  displayName: string,
): Promise<string> {
  const saveId = uuid();
  const branchId = uuid();
  const snapshot = await snapshotRow(saveId, branchId, world, null);
  const state: SimState = { world, pending: null };
  const head = await encodeValue(state);
  const now = nowIso();
  const save: SaveRow = {
    id: saveId,
    displayName,
    worldId: world.id,
    createdAt: now,
    updatedAt: now,
    worldSchemaVersion: world.schemaVersion,
    engineVersion: ENGINE_VERSION,
    contentVersion: CONTENT_VERSION,
    currentBranchId: branchId,
    difficulty: world.rules.difficulty,
    easyMigration: world.rules.easyMigration,
    summary: summarizeWorld(world),
    layout: null,
    checksum: head.hash,
  };
  const branch: BranchRow = {
    id: branchId,
    saveId,
    name: 'Timeline 1',
    parentBranchId: null,
    forkSnapshotId: null,
    headSnapshotId: snapshot.id,
    createdAt: now,
  };
  await db.transaction('rw', [db.saves, db.branches, db.snapshots, db.heads], async () => {
    await db.saves.add(save);
    await db.branches.add(branch);
    await db.snapshots.add(snapshot);
    await db.heads.add({ branchId, saveId, state: head.bytes, hash: head.hash, updatedAt: now });
  });
  return saveId;
}

/** Rebuilds the full world at a snapshot from its keyframe and deltas, verifying the hash. */
export async function reconstructWorld(
  db: WeLifeDatabase,
  snapshotId: string,
): Promise<{ row: SnapshotRow; world: World }> {
  const chain: SnapshotRow[] = [];
  let cursor: string | null = snapshotId;
  while (cursor !== null) {
    const row: SnapshotRow | undefined = await db.snapshots.get(cursor);
    if (!row) throw new PersistenceError('CORRUPTED', `Snapshot ${cursor} is missing.`);
    chain.push(row);
    if (row.kind === 'full') break;
    cursor = row.parentId;
    if (chain.length > 10_000)
      throw new PersistenceError('CORRUPTED', 'Snapshot chain is too long.');
  }
  chain.reverse();
  const base = chain[0];
  if (base?.kind !== 'full')
    throw new PersistenceError('CORRUPTED', 'Snapshot chain has no keyframe.');
  // Deltas apply to the world exactly as it was stored; the hash is checked on that, and
  // only then is the result migrated to the current format.
  let stored = await decodeValue(base.payload);
  for (const row of chain.slice(1)) {
    stored = applyPatch(stored, (await decodeValue(row.payload)) as PatchOp[]);
  }
  const target = chain[chain.length - 1] as SnapshotRow;
  if ((await hashValue(stored)) !== target.hash) {
    throw new IntegrityError(
      `Snapshot for ${String(target.clock.year)}-${String(target.clock.month)} failed its integrity check.`,
    );
  }
  return { row: target, world: migrateWorld(stored) as World };
}

async function lineageVersionsMatch(db: WeLifeDatabase, snapshotId: string): Promise<boolean> {
  let cursor: string | null = snapshotId;
  while (cursor !== null) {
    const row: SnapshotRow | undefined = await db.snapshots.get(cursor);
    if (!row) return false;
    if (row.engineVersion !== ENGINE_VERSION || row.contentVersion !== CONTENT_VERSION)
      return false;
    cursor = row.parentId;
  }
  return true;
}

export async function loadSession(db: WeLifeDatabase, saveId: string): Promise<Session> {
  const save = await db.saves.get(saveId);
  if (!save) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
  const branch = await db.branches.get(save.currentBranchId);
  if (!branch) throw new PersistenceError('CORRUPTED', 'The current timeline is missing.');
  const head = await db.heads.get(branch.id);
  if (!head) throw new PersistenceError('CORRUPTED', 'The current timeline has no saved state.');
  const raw = await decodeValue(head.state);
  if ((await hashValue(raw)) !== head.hash) {
    throw new PersistenceError('CORRUPTED', 'The saved state failed its integrity check.');
  }
  const state = validateHeadState(raw);
  const { row: headSnapshot, world: headSnapshotWorld } = await reconstructWorld(
    db,
    branch.headSnapshotId,
  );
  const last = await db.commands
    .where('[branchId+seq]')
    .between([branch.id, Dexie.minKey], [branch.id, Dexie.maxKey])
    .last();
  return {
    save,
    branch,
    state,
    headHash: head.hash,
    headSnapshot,
    headSnapshotWorld,
    nextSeq: (last?.seq ?? 0) + 1,
    replayGuaranteed: await lineageVersionsMatch(db, headSnapshot.id),
  };
}

export async function findCommand(
  db: WeLifeDatabase,
  branchId: string,
  commandId: string,
): Promise<CommandRow | undefined> {
  return db.commands.get([branchId, commandId]);
}

/**
 * Atomically persists one applied command: the new branch head, the command log entry and,
 * when a month was committed, the monthly snapshot (spec §4 step 12). Returns the updated
 * session. Fails with CONFLICT if another tab changed this timeline meanwhile.
 */
export async function commitCommand(
  db: WeLifeDatabase,
  session: Session,
  command: Command,
  next: SimState,
  outcome: CommandOutcome,
  newMonth: boolean,
): Promise<Session> {
  const saveId = session.save.id;
  const branchId = session.branch.id;
  const head = await encodeValue(next);
  const snapshot = newMonth
    ? await snapshotRow(saveId, branchId, next.world, {
        row: session.headSnapshot,
        world: session.headSnapshotWorld,
      })
    : null;
  const now = nowIso();
  const save: SaveRow = {
    ...session.save,
    updatedAt: now,
    engineVersion: ENGINE_VERSION,
    contentVersion: CONTENT_VERSION,
    worldSchemaVersion: next.world.schemaVersion,
    difficulty: next.world.rules.difficulty,
    easyMigration: next.world.rules.easyMigration,
    summary: summarizeWorld(next.world),
    checksum: head.hash,
  };
  const branch: BranchRow = snapshot
    ? { ...session.branch, headSnapshotId: snapshot.id }
    : session.branch;
  const headRow: HeadRow = { branchId, saveId, state: head.bytes, hash: head.hash, updatedAt: now };
  const commandRow: CommandRow = {
    saveId,
    commandId: command.id,
    branchId,
    seq: session.nextSeq,
    tick: session.state.world.tick,
    command,
    outcome,
  };

  await db.transaction(
    'rw',
    [db.saves, db.branches, db.snapshots, db.heads, db.commands],
    async () => {
      const current = await db.heads.get(branchId);
      if (current?.hash !== session.headHash) {
        throw new PersistenceError(
          'CONFLICT',
          'This life was changed in another window. Reopen it to continue.',
        );
      }
      if (await db.commands.get([branchId, command.id])) {
        throw new PersistenceError('CONFLICT', 'This command was already saved.');
      }
      if (snapshot) {
        await db.snapshots.add(snapshot);
        await db.branches.put(branch);
      }
      await db.heads.put(headRow);
      await db.commands.add(commandRow);
      await db.saves.put(save);
    },
  );

  return {
    ...session,
    save,
    branch,
    state: next,
    headHash: head.hash,
    headSnapshot: snapshot ?? session.headSnapshot,
    headSnapshotWorld: snapshot ? next.world : session.headSnapshotWorld,
    nextSeq: session.nextSeq + 1,
    replayGuaranteed: session.replayGuaranteed,
  };
}

export async function listSaves(db: WeLifeDatabase): Promise<SaveListItem[]> {
  const saves = await db.saves.orderBy('updatedAt').reverse().toArray();
  const items: SaveListItem[] = [];
  for (const save of saves) {
    const branches = await db.branches.where('saveId').equals(save.id).toArray();
    let bytes = 0;
    await db.snapshots
      .where('saveId')
      .equals(save.id)
      .each((s) => {
        bytes += s.payload.byteLength;
      });
    await db.heads
      .where('saveId')
      .equals(save.id)
      .each((h) => {
        bytes += h.state.byteLength;
      });
    items.push({
      id: save.id,
      displayName: save.displayName,
      summary: save.summary,
      difficulty: save.difficulty,
      easyMigration: save.easyMigration,
      createdAt: save.createdAt,
      updatedAt: save.updatedAt,
      branchCount: branches.length,
      currentBranchName: branches.find((b) => b.id === save.currentBranchId)?.name ?? '',
      bytes,
    });
  }
  return items;
}

export async function renameSave(
  db: WeLifeDatabase,
  saveId: string,
  displayName: string,
): Promise<void> {
  const updated = await db.saves.update(saveId, { displayName });
  if (updated === 0) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
}

export async function setLayout(
  db: WeLifeDatabase,
  saveId: string,
  layout: DashboardLayoutRow,
): Promise<void> {
  const updated = await db.saves.update(saveId, { layout });
  if (updated === 0) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
}

/** Deletes a save and all of its timelines. Only ever called on an explicit player request. */
export async function deleteSave(db: WeLifeDatabase, saveId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.saves, db.branches, db.snapshots, db.heads, db.commands],
    async () => {
      await db.snapshots.where('saveId').equals(saveId).delete();
      await db.heads.where('saveId').equals(saveId).delete();
      await db.commands.where('saveId').equals(saveId).delete();
      await db.branches.where('saveId').equals(saveId).delete();
      await db.saves.delete(saveId);
    },
  );
}

export async function getTimeline(db: WeLifeDatabase, saveId: string): Promise<TimelineData> {
  const save = await db.saves.get(saveId);
  if (!save) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
  const branches = await db.branches.where('saveId').equals(saveId).sortBy('createdAt');
  const snapshots = await db.snapshots.where('saveId').equals(saveId).toArray();
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  const countByBranch = new Map<string, number>();
  let totalBytes = 0;
  for (const s of snapshots) {
    countByBranch.set(s.branchId, (countByBranch.get(s.branchId) ?? 0) + 1);
    totalBytes += s.payload.byteLength;
  }
  const info: BranchInfo[] = branches.map((b) => {
    const head = byId.get(b.headSnapshotId);
    const fork = b.forkSnapshotId ? byId.get(b.forkSnapshotId) : undefined;
    return {
      id: b.id,
      name: b.name,
      parentBranchId: b.parentBranchId,
      forkClock: fork?.clock ?? null,
      headTick: head?.tick ?? 0,
      headClock: head?.clock ?? { year: 0, month: 1 },
      snapshotCount: countByBranch.get(b.id) ?? 0,
      isCurrent: b.id === save.currentBranchId,
      isLeaf: !branches.some((other) => other.parentBranchId === b.id),
      createdAt: b.createdAt,
    };
  });
  const current = branches.find((b) => b.id === save.currentBranchId);
  const lineage: SnapshotInfo[] = [];
  let cursor = current ? byId.get(current.headSnapshotId) : undefined;
  while (cursor) {
    lineage.push({
      id: cursor.id,
      branchId: cursor.branchId,
      tick: cursor.tick,
      clock: cursor.clock,
      kind: cursor.kind,
      bytes: cursor.payload.byteLength,
    });
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  lineage.reverse();
  return {
    saveId,
    currentBranchId: save.currentBranchId,
    branches: info,
    lineage,
    totalBytes,
    snapshotCount: snapshots.length,
  };
}

/**
 * Rewinds to a monthly snapshot by creating a NEW branch from it (spec §5). The previous
 * timeline is kept untouched and can be switched back to at any time.
 */
export async function rewindToSnapshot(
  db: WeLifeDatabase,
  saveId: string,
  snapshotId: string,
): Promise<void> {
  const save = await db.saves.get(saveId);
  if (!save) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
  const snapshot = await db.snapshots.get(snapshotId);
  if (snapshot?.saveId !== saveId)
    throw new PersistenceError('NOT_FOUND', 'That month is not in this save.');
  const { world } = await reconstructWorld(db, snapshotId);
  const state: SimState = { world, pending: null };
  const head = await encodeValue(state);
  const branchCount = await db.branches.where('saveId').equals(saveId).count();
  const now = nowIso();
  const branch: BranchRow = {
    id: uuid(),
    saveId,
    name: `Timeline ${String(branchCount + 1)}`,
    parentBranchId: snapshot.branchId,
    forkSnapshotId: snapshot.id,
    headSnapshotId: snapshot.id,
    createdAt: now,
  };
  await db.transaction('rw', [db.saves, db.branches, db.heads], async () => {
    await db.branches.add(branch);
    await db.heads.add({
      branchId: branch.id,
      saveId,
      state: head.bytes,
      hash: head.hash,
      updatedAt: now,
    });
    await db.saves.update(saveId, {
      currentBranchId: branch.id,
      updatedAt: now,
      summary: summarizeWorld(world),
      checksum: head.hash,
      difficulty: world.rules.difficulty,
      easyMigration: world.rules.easyMigration,
    });
  });
}

/** Switches the save to another existing timeline branch. */
export async function checkoutBranch(
  db: WeLifeDatabase,
  saveId: string,
  branchId: string,
): Promise<void> {
  const branch = await db.branches.get(branchId);
  if (branch?.saveId !== saveId)
    throw new PersistenceError('NOT_FOUND', 'That timeline does not exist.');
  const head = await db.heads.get(branchId);
  if (!head) throw new PersistenceError('CORRUPTED', 'That timeline has no saved state.');
  const state = validateHeadState(await decodeValue(head.state));
  await db.saves.update(saveId, {
    currentBranchId: branchId,
    updatedAt: nowIso(),
    summary: summarizeWorld(state.world),
    checksum: head.hash,
    difficulty: state.world.rules.difficulty,
    easyMigration: state.world.rules.easyMigration,
  });
}

/**
 * Deletes a timeline branch on explicit request. Only branches that no other branch was
 * rewound from, and not the current one, can be deleted, so no remaining history breaks.
 */
export async function deleteBranch(
  db: WeLifeDatabase,
  saveId: string,
  branchId: string,
): Promise<void> {
  const save = await db.saves.get(saveId);
  if (!save) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
  if (save.currentBranchId === branchId)
    throw new PersistenceError('INVALID', 'You cannot delete the timeline you are playing.');
  const branches = await db.branches.where('saveId').equals(saveId).toArray();
  if (!branches.some((b) => b.id === branchId))
    throw new PersistenceError('NOT_FOUND', 'That timeline does not exist.');
  if (branches.some((b) => b.parentBranchId === branchId)) {
    throw new PersistenceError(
      'INVALID',
      'Other timelines were rewound from this one, so it cannot be deleted.',
    );
  }
  await db.transaction('rw', [db.branches, db.snapshots, db.heads, db.commands], async () => {
    await db.snapshots.where('branchId').equals(branchId).delete();
    await db.heads.delete(branchId);
    await db.commands.where('branchId').equals(branchId).delete();
    await db.branches.delete(branchId);
  });
}

/** Rebuilds a damaged branch head from its latest valid monthly snapshot. */
export async function repairCurrentBranch(db: WeLifeDatabase, saveId: string): Promise<void> {
  const save = await db.saves.get(saveId);
  if (!save) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
  const branch = await db.branches.get(save.currentBranchId);
  if (!branch) throw new PersistenceError('CORRUPTED', 'The current timeline is missing.');
  const { world } = await reconstructWorld(db, branch.headSnapshotId);
  const head = await encodeValue({ world, pending: null } satisfies SimState);
  await db.heads.put({
    branchId: branch.id,
    saveId,
    state: head.bytes,
    hash: head.hash,
    updatedAt: nowIso(),
  });
  await db.saves.update(saveId, { checksum: head.hash, summary: summarizeWorld(world) });
}

export { IntegrityError };
