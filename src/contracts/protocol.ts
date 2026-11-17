import { z } from 'zod';
import { AppSettingsPatchSchema, type AppSettings, type AppSettingsPatch } from './appSettings';

/**
 * Message protocol between the UI thread and the engine worker.
 *
 * The UI never mutates game or storage state directly: every write is a validated
 * request handled by the worker, which owns the world state and IndexedDB (spec §2).
 */

export const PROTOCOL_VERSION = 1;

export interface SystemStatus {
  engineVersion: string;
  protocolVersion: number;
  dbSchemaVersion: number;
  databaseName: string;
}

/** Method name -> params and result types. */
export interface RpcMethods {
  'system.status': { params: undefined; result: SystemStatus };
  'settings.get': { params: undefined; result: AppSettings };
  'settings.update': { params: AppSettingsPatch; result: AppSettings };
}

export type RpcMethod = keyof RpcMethods;
export type RpcParams<M extends RpcMethod> = RpcMethods[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcMethods[M]['result'];

const RequestIdSchema = z.string().min(1).max(64);

export const RpcRequestSchema = z.discriminatedUnion('method', [
  z.object({ id: RequestIdSchema, method: z.literal('system.status') }).strict(),
  z.object({ id: RequestIdSchema, method: z.literal('settings.get') }).strict(),
  z
    .object({
      id: RequestIdSchema,
      method: z.literal('settings.update'),
      params: AppSettingsPatchSchema,
    })
    .strict(),
]);

export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RPC_ERROR_CODES = ['INVALID_REQUEST', 'INTERNAL', 'UNAVAILABLE'] as const;
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
