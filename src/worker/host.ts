import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  RpcRequestSchema,
  formatIssues,
  type RpcError,
  type RpcRequest,
  type RpcResponse,
  type SystemStatus,
} from '@contracts/protocol';
import type { DashboardLayout, GameSessionView } from '@contracts/saves';
import { createWorld, CreationError } from '@engine/characters/create';
import { committedNewMonth, execute } from '@engine/core/commands';
import { InvariantError } from '@engine/core/invariants';
import { CONTENT_VERSION, ENGINE_VERSION } from '@engine/version';
import { projectGame, summarizeWorld } from '@engine/view';
import { duplicateSave, exportSave, importSave, ImportError } from '@persistence/bundle';
import { IntegrityError } from '@persistence/codec';
import { DB_SCHEMA_VERSION, type WeLifeDatabase } from '@persistence/db';
import { MigrationError } from '@persistence/migrations';
import {
  checkoutBranch,
  commitCommand,
  createSave,
  deleteBranch,
  deleteSave,
  findCommand,
  getTimeline,
  listSaves,
  loadSession,
  PersistenceError,
  renameSave,
  repairCurrentBranch,
  rewindToSnapshot,
  setLayout,
  type Session,
} from '@persistence/saves';
import { loadAppSettings, updateAppSettings } from '@persistence/settingsRepository';

export interface EngineHost {
  /** Handles one raw message from the UI thread. Never throws; errors become error responses. */
  handle(raw: unknown): Promise<RpcResponse>;
}

/** Best-effort extraction of a request id so even malformed requests get a correlated reply. */
function extractId(raw: unknown): string | null {
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const { id } = raw;
    if (typeof id === 'string' && id.length > 0 && id.length <= 64) return id;
  }
  return null;
}

function toRpcError(error: unknown): RpcError {
  if (error instanceof z.ZodError) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request failed validation.',
      issues: formatIssues(error),
    };
  }
  if (error instanceof PersistenceError) {
    const code = error.code === 'INVALID' ? 'INVALID_REQUEST' : error.code;
    return { code, message: error.message };
  }
  if (error instanceof IntegrityError || error instanceof MigrationError) {
    return { code: 'CORRUPTED', message: error.message };
  }
  if (error instanceof CreationError) return { code: 'CREATION_FAILED', message: error.message };
  if (error instanceof ImportError)
    return { code: 'IMPORT_FAILED', message: error.message, issues: error.issues };
  if (error instanceof InvariantError) {
    return {
      code: 'INTERNAL',
      message: `The simulation refused an inconsistent change: ${error.violations[0] ?? ''}`,
    };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'Unknown engine error.',
  };
}

export function createEngineHost(db: WeLifeDatabase): EngineHost {
  /** The open save, kept in memory between requests. */
  let session: Session | null = null;
  /** Requests are processed strictly one at a time, in arrival order. */
  let queue: Promise<unknown> = Promise.resolve();

  const toView = (s: Session): GameSessionView => ({
    saveId: s.save.id,
    displayName: s.save.displayName,
    branch: { id: s.branch.id, name: s.branch.name },
    replayGuaranteed: s.replayGuaranteed,
    layout: s.save.layout as DashboardLayout | null,
    view: projectGame(s.state),
  });

  async function open(saveId: string): Promise<Session> {
    session = null;
    session = await loadSession(db, saveId);
    return session;
  }

  async function ensure(saveId: string): Promise<Session> {
    if (session?.save.id === saveId) return session;
    return open(saveId);
  }

  async function dispatch(request: RpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'system.status': {
        const status: SystemStatus = {
          engineVersion: ENGINE_VERSION,
          contentVersion: CONTENT_VERSION,
          protocolVersion: PROTOCOL_VERSION,
          dbSchemaVersion: DB_SCHEMA_VERSION,
          databaseName: db.name,
        };
        return status;
      }
      case 'settings.get':
        return (await loadAppSettings(db)).settings;
      case 'settings.update':
        return updateAppSettings(db, request.params);

      case 'saves.list':
        return listSaves(db);
      case 'saves.create': {
        const world = createWorld(crypto.randomUUID(), request.params.input);
        const name = request.params.displayName ?? summarizeWorld(world).characterName;
        return { saveId: await createSave(db, world, name) };
      }
      case 'saves.rename':
        await renameSave(db, request.params.saveId, request.params.displayName);
        if (session?.save.id === request.params.saveId) {
          session = {
            ...session,
            save: { ...session.save, displayName: request.params.displayName },
          };
        }
        return null;
      case 'saves.duplicate': {
        const source = (await listSaves(db)).find((s) => s.id === request.params.saveId);
        if (!source) throw new PersistenceError('NOT_FOUND', 'That save no longer exists.');
        const name = `${source.displayName} (copy)`.slice(0, 80);
        return { saveId: await duplicateSave(db, request.params.saveId, name) };
      }
      case 'saves.delete':
        if (session?.save.id === request.params.saveId) session = null;
        await deleteSave(db, request.params.saveId);
        return null;
      case 'saves.export':
        return exportSave(db, request.params.saveId);
      case 'saves.import':
        return { saveId: await importSave(db, request.params.json) };
      case 'saves.repair':
        session = null;
        await repairCurrentBranch(db, request.params.saveId);
        return null;

      case 'game.open':
        return toView(await open(request.params.saveId));
      case 'game.command': {
        const current = await ensure(request.params.saveId);
        const command = request.params.command;
        // A retried command (after a crash or lost reply) returns its stored outcome.
        const previous = await findCommand(db, current.branch.id, command.id);
        if (previous) return { outcome: previous.outcome, session: toView(current) };
        const { state, outcome } = execute(current.state, command);
        if (outcome.status === 'rejected') return { outcome, session: toView(current) };
        try {
          session = await commitCommand(
            db,
            current,
            command,
            state,
            outcome,
            committedNewMonth(outcome),
          );
        } catch (error) {
          session = null; // reload from storage on the next request
          throw error;
        }
        return { outcome, session: toView(session) };
      }
      case 'game.setLayout': {
        const current = await ensure(request.params.saveId);
        await setLayout(db, current.save.id, request.params.layout);
        session = { ...current, save: { ...current.save, layout: request.params.layout } };
        return request.params.layout;
      }

      case 'timeline.get':
        return getTimeline(db, request.params.saveId);
      case 'timeline.rewind':
        await rewindToSnapshot(db, request.params.saveId, request.params.snapshotId);
        return toView(await open(request.params.saveId));
      case 'timeline.checkout':
        await checkoutBranch(db, request.params.saveId, request.params.branchId);
        return toView(await open(request.params.saveId));
      case 'timeline.deleteBranch':
        await deleteBranch(db, request.params.saveId, request.params.branchId);
        return getTimeline(db, request.params.saveId);
    }
  }

  async function process(raw: unknown): Promise<RpcResponse> {
    const parsed = RpcRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        id: extractId(raw),
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request failed validation.',
          issues: formatIssues(parsed.error),
        },
      };
    }
    try {
      return { id: parsed.data.id, ok: true, result: await dispatch(parsed.data) };
    } catch (error) {
      return { id: parsed.data.id, ok: false, error: toRpcError(error) };
    }
  }

  return {
    handle(raw) {
      const run = queue.then(() => process(raw));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
