import { Dexie, type EntityTable, type Table } from 'dexie';
import type { AppSettings } from '@contracts/appSettings';
import type { Command, CommandOutcome } from '@engine/core/commands';
import type { SaveSummary } from '@engine/view';
import type { Difficulty, YearMonth } from '@engine/state/schema';

export const DEFAULT_DATABASE_NAME = 'welife';

/**
 * Current IndexedDB schema version. Every bump must add a `this.version(n)` block
 * below (never edit an old one) so existing installs migrate forward.
 */
export const DB_SCHEMA_VERSION = 3;

/** One achievement unlocked on one timeline (cross-save gallery, decision D10). */
export interface AchievementRow {
  saveId: string;
  branchId: string;
  achievementId: string;
  saveName: string;
  branchName: string;
  characterName: string;
  generation: number;
  /** In-game month of the unlock. */
  year: number;
  month: number;
  unlockedAt: string;
}

/** A content pack in the device library (spec §7). */
export interface PackRow {
  id: string;
  name: string;
  packVersion: string;
  mode: 'player' | 'developer';
  author: string;
  /** The validated pack file. */
  json: string;
  updatedAt: string;
  /** Earlier versions (newest first, at most 10). */
  history: { packVersion: string; json: string; savedAt: string }[];
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface AppSettingsRow {
  key: 'app';
  value: AppSettings;
}

export interface DashboardLayoutRow {
  order: string[];
  hidden: string[];
}

/** One save slot (spec §6 SaveSlot). */
export interface SaveRow {
  id: string;
  displayName: string;
  worldId: string;
  createdAt: string;
  updatedAt: string;
  worldSchemaVersion: number;
  engineVersion: string;
  contentVersion: string;
  currentBranchId: string;
  difficulty: Difficulty;
  easyMigration: boolean;
  summary: SaveSummary;
  layout: DashboardLayoutRow | null;
  /** SHA-256 of the current branch head state. */
  checksum: string;
}

/** A timeline branch. Branches are never rewritten; rewinding creates a new one (spec §5). */
export interface BranchRow {
  id: string;
  saveId: string;
  name: string;
  parentBranchId: string | null;
  /** Snapshot this branch was rewound from (null for the original timeline). */
  forkSnapshotId: string | null;
  headSnapshotId: string;
  createdAt: string;
}

/** Monthly snapshot (spec §6 TimelineSnapshot): full keyframe or delta from its parent. */
export interface SnapshotRow {
  id: string;
  saveId: string;
  branchId: string;
  parentId: string | null;
  tick: number;
  clock: YearMonth;
  kind: 'full' | 'delta';
  /** Deltas since the last full snapshot along this lineage. */
  depth: number;
  /** gzip(canonical JSON) of the world (full) or of the patch (delta). */
  payload: Uint8Array;
  /** SHA-256 of the canonical JSON of the full world at this month. */
  hash: string;
  engineVersion: string;
  contentVersion: string;
  createdAt: string;
}

/** Latest state of a branch: committed world plus any pending decision and in-month actions. */
export interface HeadRow {
  branchId: string;
  saveId: string;
  /** gzip(canonical JSON) of { world, pending }. */
  state: Uint8Array;
  hash: string;
  updatedAt: string;
}

/**
 * Applied command log, per timeline branch: idempotency (a retried command returns its stored
 * outcome) and replay. The same command may legitimately be replayed on a rewound branch.
 */
export interface CommandRow {
  saveId: string;
  commandId: string;
  branchId: string;
  seq: number;
  tick: number;
  command: Command;
  outcome: CommandOutcome;
}

export class WeLifeDatabase extends Dexie {
  declare meta: EntityTable<MetaRow, 'key'>;
  declare settings: EntityTable<AppSettingsRow, 'key'>;
  declare saves: EntityTable<SaveRow, 'id'>;
  declare branches: EntityTable<BranchRow, 'id'>;
  declare snapshots: EntityTable<SnapshotRow, 'id'>;
  declare heads: EntityTable<HeadRow, 'branchId'>;
  declare commands: Table<CommandRow, [string, string]>;
  declare achievements: Table<AchievementRow, [string, string, string]>;
  declare packs: EntityTable<PackRow, 'id'>;

  constructor(name: string = DEFAULT_DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      meta: 'key',
      settings: 'key',
    });
    // Milestone 1: saves, timeline branches, monthly snapshots, branch heads, command log.
    this.version(2).stores({
      saves: 'id, updatedAt',
      branches: 'id, saveId',
      snapshots: 'id, saveId, branchId, [branchId+tick]',
      heads: 'branchId, saveId',
      commands: '[branchId+commandId], saveId, branchId, [branchId+seq]',
    });
    // Milestones 7-8: the cross-save achievement gallery and the content-pack library.
    this.version(3).stores({
      achievements: '[saveId+branchId+achievementId], saveId, branchId, achievementId',
      packs: 'id, updatedAt',
    });
  }
}
