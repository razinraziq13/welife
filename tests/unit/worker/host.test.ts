import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@contracts/appSettings';
import { PROTOCOL_VERSION } from '@contracts/protocol';
import { ENGINE_VERSION } from '@engine/version';
import { DB_SCHEMA_VERSION, type WeLifeDatabase } from '@persistence/db';
import { createEngineHost } from '@worker/host';
import { createTestDatabase } from '../../helpers/db';

let db: WeLifeDatabase | null = null;
afterEach(async () => {
  await db?.delete();
  db = null;
});

function setup() {
  db = createTestDatabase();
  return createEngineHost(db);
}

describe('engine host', () => {
  it('reports engine, protocol and storage versions', async () => {
    const host = setup();
    expect(await host.handle({ id: 'a', method: 'system.status' })).toEqual({
      id: 'a',
      ok: true,
      result: {
        engineVersion: ENGINE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        dbSchemaVersion: DB_SCHEMA_VERSION,
        databaseName: db?.name,
      },
    });
  });

  it('reads and updates settings', async () => {
    const host = setup();
    expect(await host.handle({ id: 'a', method: 'settings.get' })).toEqual({
      id: 'a',
      ok: true,
      result: DEFAULT_APP_SETTINGS,
    });
    const updated = await host.handle({
      id: 'b',
      method: 'settings.update',
      params: { theme: 'dark' },
    });
    expect(updated).toEqual({
      id: 'b',
      ok: true,
      result: { ...DEFAULT_APP_SETTINGS, theme: 'dark' },
    });
  });

  it('answers malformed requests with INVALID_REQUEST and keeps the id when possible', async () => {
    const host = setup();
    const response = await host.handle({ id: 'x', method: 'world.destroy' });
    expect(response).toMatchObject({ id: 'x', ok: false, error: { code: 'INVALID_REQUEST' } });
  });

  it('answers non-object messages without throwing', async () => {
    const host = setup();
    for (const raw of [null, 42, 'hello', [], { id: 7 }]) {
      const response = await host.handle(raw);
      expect(response).toMatchObject({ id: null, ok: false, error: { code: 'INVALID_REQUEST' } });
    }
  });

  it('rejects invalid settings with field paths and does not store them', async () => {
    const host = setup();
    const response = await host.handle({
      id: 'c',
      method: 'settings.update',
      params: { textScale: 42 },
    });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.issues?.map((i) => i.path)).toContain('params.textScale');
    expect(await host.handle({ id: 'd', method: 'settings.get' })).toMatchObject({
      result: DEFAULT_APP_SETTINGS,
    });
  });

  it('converts storage failures into INTERNAL errors instead of crashing', async () => {
    const host = setup();
    db?.close({ disableAutoOpen: true });
    const response = await host.handle({ id: 'e', method: 'settings.get' });
    expect(response).toMatchObject({ id: 'e', ok: false, error: { code: 'INTERNAL' } });
  });
});
