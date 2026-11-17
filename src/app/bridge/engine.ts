import { EngineClient } from './engineClient';

let client: EngineClient | null = null;

function spawn(): EngineClient {
  const worker = new Worker(new URL('../../worker/engine.worker.ts', import.meta.url), {
    type: 'module',
    name: 'welife-engine',
  });
  return new EngineClient(worker);
}

/** The shared engine client, started on first use. */
export function getEngine(): EngineClient {
  client ??= spawn();
  return client;
}

/** Shuts down a failed engine worker and starts a fresh one. */
export function restartEngine(): EngineClient {
  client?.terminate();
  client = spawn();
  return client;
}
