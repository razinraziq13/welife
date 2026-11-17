import type { WorkerLike } from '@app/bridge/engineClient';
import type { EngineHost } from '@worker/host';

type Listener = (event: Event) => void;

/**
 * Runs the real engine host in-process but keeps worker semantics:
 * messages are structured-cloned and delivered asynchronously.
 */
export class InProcessWorker implements WorkerLike {
  readonly #host: EngineHost;
  readonly #listeners = new Map<string, Set<Listener>>();
  terminated = false;
  readonly sent: unknown[] = [];

  constructor(host: EngineHost) {
    this.#host = host;
  }

  postMessage(message: unknown): void {
    if (this.terminated) return;
    const cloned = structuredClone(message);
    this.sent.push(cloned);
    void this.#host.handle(cloned).then((response) => {
      if (this.terminated) return;
      this.emit('message', new MessageEvent('message', { data: structuredClone(response) }));
    });
  }

  addEventListener(type: 'message' | 'error' | 'messageerror', listener: Listener): void {
    const set = this.#listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.#listeners.set(type, set);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulates the worker emitting an event (e.g. a crash). */
  emit(type: string, event: Event): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}
