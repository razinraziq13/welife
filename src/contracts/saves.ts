import { z } from 'zod';
import type { CommandOutcome } from '@engine/core/commands';
import type { Difficulty, YearMonth } from '@engine/state/schema';
import type { GameView, SaveSummary } from '@engine/view';

/** Save-slot, timeline and game-session shapes exchanged between the UI and the worker. */

export const DASHBOARD_WIDGETS = [
  'profile',
  'vitals',
  'time',
  'activities',
  'feed',
  'needs',
  'family',
  'country',
  'money',
  'studies',
  'calendar',
  'people',
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export const DashboardLayoutSchema = z
  .object({
    order: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
    hidden: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
  })
  .strict()
  .refine((layout) => new Set(layout.order).size === layout.order.length, {
    message: 'Duplicate widget.',
  });
export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;

export interface SaveListItem {
  id: string;
  displayName: string;
  summary: SaveSummary;
  difficulty: Difficulty;
  easyMigration: boolean;
  createdAt: string;
  updatedAt: string;
  branchCount: number;
  currentBranchName: string;
  bytes: number;
}

export interface BranchInfo {
  id: string;
  name: string;
  parentBranchId: string | null;
  forkClock: YearMonth | null;
  headTick: number;
  headClock: YearMonth;
  snapshotCount: number;
  isCurrent: boolean;
  isLeaf: boolean;
  createdAt: string;
}

export interface SnapshotInfo {
  id: string;
  branchId: string;
  tick: number;
  clock: YearMonth;
  kind: 'full' | 'delta';
  bytes: number;
}

export interface TimelineData {
  saveId: string;
  currentBranchId: string;
  branches: BranchInfo[];
  /** Months of the current timeline, oldest first (including inherited months before a fork). */
  lineage: SnapshotInfo[];
  totalBytes: number;
  snapshotCount: number;
}

export interface GameSessionView {
  saveId: string;
  displayName: string;
  branch: { id: string; name: string };
  /** False when months on this timeline were made by another engine/content version (spec §5). */
  replayGuaranteed: boolean;
  layout: DashboardLayout | null;
  view: GameView;
}

export interface CommandResult {
  outcome: CommandOutcome;
  session: GameSessionView;
}
