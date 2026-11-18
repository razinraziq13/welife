import { z } from 'zod';
import { CommandSchema, type Command } from '@engine/core/commands';
import { NewLifeInputSchema, type NewLifeInput } from '@engine/characters/create';
import type { FamilyTreeView, PersonDetailView } from '@engine/view';
import type { BiographyView } from '@engine/viewLegacy';
import type { PreviewResult } from '@engine/content/preview';
import type { GalleryEntry, PackCheckResult, PackSaveResult, PackSummary } from './packs';
import { AppSettingsPatchSchema, type AppSettings, type AppSettingsPatch } from './appSettings';
import {
  DashboardLayoutSchema,
  type CommandResult,
  type DashboardLayout,
  type GameSessionView,
  type SaveListItem,
  type TimelineData,
} from './saves';

/**
 * Message protocol between the UI thread and the engine worker.
 *
 * The UI never mutates game or storage state directly: every write is a validated
 * request handled by the worker, which owns the world state and IndexedDB (spec §2).
 */

export const PROTOCOL_VERSION = 4;

export interface SystemStatus {
  engineVersion: string;
  contentVersion: string;
  protocolVersion: number;
  dbSchemaVersion: number;
  databaseName: string;
}

interface SaveRef {
  saveId: string;
}

/** Method name -> params and result types. */
export interface RpcMethods {
  'system.status': { params: undefined; result: SystemStatus };
  'settings.get': { params: undefined; result: AppSettings };
  'settings.update': { params: AppSettingsPatch; result: AppSettings };
  'saves.list': { params: undefined; result: SaveListItem[] };
  'saves.create': {
    params: { input: NewLifeInput; displayName: string | null };
    result: { saveId: string };
  };
  'saves.rename': { params: SaveRef & { displayName: string }; result: null };
  'saves.duplicate': { params: SaveRef; result: { saveId: string } };
  'saves.delete': { params: SaveRef; result: null };
  'saves.export': { params: SaveRef; result: { fileName: string; json: string } };
  'saves.import': { params: { json: string }; result: { saveId: string } };
  'saves.repair': { params: SaveRef; result: null };
  'game.open': { params: SaveRef; result: GameSessionView };
  'game.command': { params: SaveRef & { command: Command }; result: CommandResult };
  'game.setLayout': { params: SaveRef & { layout: DashboardLayout }; result: DashboardLayout };
  'game.person': { params: SaveRef & { personId: string }; result: PersonDetailView | null };
  'game.family': { params: SaveRef; result: FamilyTreeView };
  'timeline.get': { params: SaveRef; result: TimelineData };
  'timeline.rewind': { params: SaveRef & { snapshotId: string }; result: GameSessionView };
  'timeline.checkout': { params: SaveRef & { branchId: string }; result: GameSessionView };
  'timeline.deleteBranch': { params: SaveRef & { branchId: string }; result: TimelineData };
  'game.biography': { params: SaveRef & { personId: string }; result: BiographyView | null };
  'achievements.gallery': { params: undefined; result: GalleryEntry[] };
  'packs.list': { params: undefined; result: PackSummary[] };
  'packs.get': { params: { id: string }; result: { json: string } | null };
  'packs.save': { params: { json: string }; result: PackSaveResult };
  'packs.validate': { params: { json: string }; result: PackCheckResult };
  'packs.delete': { params: { id: string }; result: null };
  'packs.preview': {
    params: { json: string; eventId: string; countryCode: string; ageYears: number; seed: string };
    result: PreviewResult;
  };
}

export type RpcMethod = keyof RpcMethods;
export type RpcParams<M extends RpcMethod> = RpcMethods[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcMethods[M]['result'];

const RequestIdSchema = z.string().min(1).max(64);
const SaveId = z.string().min(1).max(80);
const DisplayName = z.string().trim().min(1).max(80);
const MAX_IMPORT_CHARS = 64 * 1024 * 1024;
const PackId = z.string().regex(/^[a-z][a-z0-9-]{2,39}$/);
/** Pack files are capped at 2 MB (content/packs.ts); a little headroom for formatting. */
const PackJson = z
  .string()
  .min(2)
  .max(3 * 1024 * 1024);

const bare = <M extends string>(method: M) =>
  z.object({ id: RequestIdSchema, method: z.literal(method) }).strict();
const request = <M extends string, P extends z.ZodType>(method: M, params: P) =>
  z.object({ id: RequestIdSchema, method: z.literal(method), params }).strict();

export const RpcRequestSchema = z.discriminatedUnion('method', [
  bare('system.status'),
  bare('settings.get'),
  request('settings.update', AppSettingsPatchSchema),
  bare('saves.list'),
  request(
    'saves.create',
    z.object({ input: NewLifeInputSchema, displayName: DisplayName.nullable() }).strict(),
  ),
  request('saves.rename', z.object({ saveId: SaveId, displayName: DisplayName }).strict()),
  request('saves.duplicate', z.object({ saveId: SaveId }).strict()),
  request('saves.delete', z.object({ saveId: SaveId }).strict()),
  request('saves.export', z.object({ saveId: SaveId }).strict()),
  request('saves.import', z.object({ json: z.string().min(2).max(MAX_IMPORT_CHARS) }).strict()),
  request('saves.repair', z.object({ saveId: SaveId }).strict()),
  request('game.open', z.object({ saveId: SaveId }).strict()),
  request('game.command', z.object({ saveId: SaveId, command: CommandSchema }).strict()),
  request('game.setLayout', z.object({ saveId: SaveId, layout: DashboardLayoutSchema }).strict()),
  request(
    'game.person',
    z.object({ saveId: SaveId, personId: z.string().min(1).max(80) }).strict(),
  ),
  request('game.family', z.object({ saveId: SaveId }).strict()),
  request('timeline.get', z.object({ saveId: SaveId }).strict()),
  request(
    'timeline.rewind',
    z.object({ saveId: SaveId, snapshotId: z.string().min(1).max(80) }).strict(),
  ),
  request(
    'timeline.checkout',
    z.object({ saveId: SaveId, branchId: z.string().min(1).max(80) }).strict(),
  ),
  request(
    'timeline.deleteBranch',
    z.object({ saveId: SaveId, branchId: z.string().min(1).max(80) }).strict(),
  ),
  request(
    'game.biography',
    z.object({ saveId: SaveId, personId: z.string().min(1).max(80) }).strict(),
  ),
  bare('achievements.gallery'),
  bare('packs.list'),
  request('packs.get', z.object({ id: PackId }).strict()),
  request('packs.save', z.object({ json: PackJson }).strict()),
  request('packs.validate', z.object({ json: PackJson }).strict()),
  request('packs.delete', z.object({ id: PackId }).strict()),
  request(
    'packs.preview',
    z
      .object({
        json: PackJson,
        eventId: z.string().min(1).max(60),
        countryCode: z.string().length(2),
        ageYears: z.number().int().min(0).max(110),
        seed: z.string().min(1).max(64),
      })
      .strict(),
  ),
]);

export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RPC_ERROR_CODES = [
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAVAILABLE',
  'NOT_FOUND',
  'CORRUPTED',
  'CONFLICT',
  'CREATION_FAILED',
  'IMPORT_FAILED',
] as const;
export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

export interface RpcError {
  code: RpcErrorCode;
  message: string;
  /** Validation issues with field paths, when the request failed validation. */
  issues?: { path: string; message: string }[];
}

export type RpcResponse =
  { id: string; ok: true; result: unknown } | { id: string | null; ok: false; error: RpcError };

export const RpcResponseSchema = z.union([
  z.object({ id: z.string(), ok: z.literal(true), result: z.unknown() }),
  z.object({
    id: z.string().nullable(),
    ok: z.literal(false),
    error: z.object({
      code: z.enum(RPC_ERROR_CODES),
      message: z.string(),
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  }),
]);

/** Formats zod issues as `{ path, message }` pairs, e.g. `params.textScale`. */
export function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}
