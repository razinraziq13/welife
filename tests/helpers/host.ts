import type { RpcError, RpcMethod, RpcParams, RpcResult } from '@contracts/protocol';
import { createEngineHost, type EngineHost } from '@worker/host';
import type { WeLifeDatabase } from '@persistence/db';

let counter = 0;

export class HostError extends Error {
  readonly error: RpcError;
  constructor(error: RpcError) {
    super(`${error.code}: ${error.message}`);
    this.error = error;
  }
}

/** Typed request helper for an in-process engine host. */
export function client(host: EngineHost) {
  return async function call<M extends RpcMethod>(
    method: M,
    ...args: RpcParams<M> extends undefined ? [] : [RpcParams<M>]
  ): Promise<RpcResult<M>> {
    counter += 1;
    const message =
      args.length > 0
        ? { id: `t${String(counter)}`, method, params: args[0] }
        : { id: `t${String(counter)}`, method };
    const response = await host.handle(structuredClone(message));
    if (!response.ok) throw new HostError(response.error);
    return structuredClone(response.result) as RpcResult<M>;
  };
}

export function hostFor(db: WeLifeDatabase) {
  const host = createEngineHost(db);
  return { host, call: client(host) };
}
