import type { PackIssue } from '@engine/content/packs';

/** Shapes shared by the UI and the worker for content packs and the achievement gallery. */

export interface PackSummary {
  id: string;
  name: string;
  packVersion: string;
  mode: 'player' | 'developer';
  author: string;
  description: string;
  events: number;
  scenarios: { id: string; name: string; description: string }[];
  updatedAt: string;
  versions: string[];
}

export interface PackSaveResult {
  ok: boolean;
  issues: PackIssue[];
  summary: PackSummary | null;
}

export interface PackCheckResult {
  ok: boolean;
  issues: PackIssue[];
}

export interface GalleryEntry {
  saveId: string;
  branchId: string;
  achievementId: string;
  saveName: string;
  branchName: string;
  characterName: string;
  generation: number;
  year: number;
  month: number;
}
