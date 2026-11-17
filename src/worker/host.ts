import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  RpcRequestSchema,
  formatIssues,
  type RpcRequest,
  type RpcResponse,
  type SystemStatus,
} from '@contracts/protocol';
import { ENGINE_VERSION } from '@engine/version';
import { DB_SCHEMA_VERSION, type WeLifeDatabase } from '@persistence/db';
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

export function createEngineHost(db: WeLifeDatabase): EngineHost {
  async function dispatch(request: RpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'system.status': {
        const status: SystemStatus = {
          engineVersion: ENGINE_VERSION,
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
    }
  }

  return {
    async handle(raw) {
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
      const request = parsed.data;
      try {
        const result = await dispatch(request);
        return { id: request.id, ok: true, result };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            id: request.id,
            ok: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Request failed validation.',
              issues: formatIssues(error),
            },
          };
        }
        return {
          id: request.id,
          ok: false,
          error: {
            code: 'INTERNAL',
            message: error instanceof Error ? error.message : 'Unknown engine error.',
          },
        };
      }
    },
  };
}
