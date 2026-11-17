import {
  RpcResponseSchema,
  type RpcError,
  type RpcErrorCode,
  type RpcMethod,
  type RpcParams,
  type RpcResult,
} from '@contracts/protocol';

/** The subset of the DOM `Worker` API the client needs (lets tests use an in-process fake). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: (event: Event) => void,
  ): void;
  terminate(): void;
}

export type EngineErrorCode = RpcErrorCode | 'TERMINATED' | 'PROTOCOL';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly issues: RpcError['issues'];

  constructor(code: EngineErrorCode, message: string, issues?: RpcError['issues']) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.issues = issues;
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: EngineError) => void;
}

type CallArgs<M extends RpcMethod> = RpcParams<M> extends undefined ? [] : [params: RpcParams<M>];

/**
 * Typed request/response client for the engine worker. Each call gets a unique id;
 * responses are matched by id, so concurrent calls never cross.
 */
export class EngineClient {
  readonly #worker: WorkerLike;
  readonly #pending = new Map<string, Pending>();
  #nextId = 1;
  #failure: EngineError | null = null;

  constructor(worker: WorkerLike) {
    this.#worker = worker;
    worker.addEventListener('message', (event) => {
      this.#onMessage((event as MessageEvent<unknown>).data);
    });
    worker.addEventListener('error', (event) => {
      const message = (event as Partial<ErrorEvent>).message;
      const detail = typeof message === 'string' && message.length > 0 ? `: ${message}` : '';
      this.#failAll(
        new EngineError('UNAVAILABLE', `The game engine stopped unexpectedly${detail}`),
      );
    });
    worker.addEventListener('messageerror', () => {
      this.#failAll(new EngineError('PROTOCOL', 'The game engine sent an unreadable message.'));
    });
  }

  /** Non-null once the worker has crashed or been terminated; further calls reject. */
  get failure(): EngineError | null {
    return this.#failure;
  }

  call<M extends RpcMethod>(method: M, ...args: CallArgs<M>): Promise<RpcResult<M>> {
    if (this.#failure) return Promise.reject(this.#failure);
    const id = `r${String(this.#nextId++)}`;
    const message = args.length > 0 ? { id, method, params: args[0] } : { id, method };
    return new Promise<RpcResult<M>>((resolve, reject) => {
      // Result shapes are defined by the protocol contract and produced by the worker host.
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.#worker.postMessage(message);
    });
  }

  terminate(): void {
    this.#worker.terminate();
    this.#failAll(new EngineError('TERMINATED', 'The game engine was shut down.'));
  }

  #onMessage(data: unknown): void {
    const parsed = RpcResponseSchema.safeParse(data);
    if (!parsed.success) return; // Not a protocol response; ignore.
    const response = parsed.data;
    if (response.id === null) return; // Uncorrelatable error for a malformed request.
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(
        new EngineError(response.error.code, response.error.message, response.error.issues),
      );
    }
  }

  #failAll(error: EngineError): void {
    this.#failure ??= error;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
