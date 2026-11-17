/**
 * Engine worker entry point. Owns the IndexedDB connection and (from Milestone 1)
 * the authoritative world state; the UI thread only sends validated requests.
 */
import { WeLifeDatabase } from '@persistence/db';
import { createEngineHost } from './host';

declare const self: DedicatedWorkerGlobalScope;

const host = createEngineHost(new WeLifeDatabase());

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  void host.handle(event.data).then((response) => {
    self.postMessage(response);
  });
});
