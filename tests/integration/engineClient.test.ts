import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@contracts/appSettings';
import { PROTOCOL_VERSION } from '@contracts/protocol';
import { EngineClient, EngineError } from '@app/bridge/engineClient';
import type { WeLifeDatabase } from '@persistence/db';
import { createEngineHost } from '@worker/host';
import { createTestDatabase } from '../helpers/db';
import { InProcessWorker } from '../helpers/inProcessWorker';

let db: WeLifeDatabase | null = null;
afterEach(async () => {
  await db?.delete();
  db = null;
});

function setup() {
  db = createTestDatabase();
  const worker = new InProcessWorker(createEngineHost(db));
  return { worker, client: new EngineClient(worker) };
}

describe('UI ↔ engine worker round trip', () => {
  it('connects and reads status and settings', async () => {
    const { client } = setup();
    const [status, settings] = await Promise.all([
      client.call('system.status'),
      client.call('settings.get'),
    ]);
    expect(status.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(settings).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('matches concurrent responses to the right callers', async () => {
    const { client } = setup();
    const results = await Promise.all([
      client.call('settings.update', { theme: 'dark' }),
      client.call('system.status'),
      client.call('settings.get'),
    ]);
    expect(results[0].theme).toBe('dark');
    expect(results[1]).toHaveProperty('engineVersion');
    expect(results[2]).toHaveProperty('textScale');
  });

  it('gives every request a unique id', async () => {
    const { client, worker } = setup();
    await Promise.all(Array.from({ length: 20 }, () => client.call('system.status')));
    const ids = worker.sent.map((message) => (message as { id: string }).id);
    expect(new Set(ids).size).toBe(20);
  });

  it('rejects with a typed EngineError carrying field paths on invalid input', async () => {
    const { client } = setup();
    const call = client.call('settings.update', {
      textScale: 3,
    } as unknown as { textScale: 100 });
    await expect(call).rejects.toBeInstanceOf(EngineError);
    await call.catch((error: unknown) => {
      expect(error).toMatchObject({ code: 'INVALID_REQUEST' });
      expect((error as EngineError).issues?.[0]?.path).toBe('params.textScale');
    });
  });

  it('rejects pending and future calls after the worker crashes', async () => {
    const { client, worker } = setup();
    worker.terminated = true; // swallow the in-flight reply, as a crashed worker would
    const pending = client.call('system.status');
    worker.emit('error', new Event('error'));
    await expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(client.call('settings.get')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(client.failure?.code).toBe('UNAVAILABLE');
  });

  it('rejects pending calls when terminated', async () => {
    const { client, worker } = setup();
    worker.terminated = true;
    const pending = client.call('system.status');
    client.terminate();
    await expect(pending).rejects.toMatchObject({ code: 'TERMINATED' });
  });

  it('ignores stray messages that are not protocol responses', async () => {
    const { client, worker } = setup();
    worker.emit('message', new MessageEvent('message', { data: { hello: 'world' } }));
    worker.emit(
      'message',
      new MessageEvent('message', { data: { id: 'r999', ok: true, result: 1 } }),
    );
    expect(await client.call('settings.get')).toEqual(DEFAULT_APP_SETTINGS);
  });
});
