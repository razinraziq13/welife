import { useCallback, useEffect, useState } from 'react';

export interface StorageInfo {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export type PersistOutcome = 'granted' | 'denied' | 'unsupported';

const UNSUPPORTED: StorageInfo = { supported: false, usage: null, quota: null, persisted: null };

async function readStorageInfo(): Promise<StorageInfo> {
  if (!('storage' in navigator) || typeof navigator.storage.estimate !== 'function') {
    return UNSUPPORTED;
  }
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate(),
    typeof navigator.storage.persisted === 'function'
      ? navigator.storage.persisted()
      : Promise.resolve(null),
  ]);
  return {
    supported: true,
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
    persisted,
  };
}

/** Browser storage usage and persistence status (spec §5: monitor storage estimates). */
export function useStorageInfo() {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  const refresh = useCallback(async () => {
    setInfo(await readStorageInfo().catch(() => UNSUPPORTED));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readStorageInfo()
      .catch(() => UNSUPPORTED)
      .then((next) => {
        if (!cancelled) setInfo(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Asks the browser to exempt WeLife's data from automatic eviction. */
  const requestPersistence = useCallback(async (): Promise<PersistOutcome> => {
    if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
      return 'unsupported';
    }
    const granted = await navigator.storage.persist();
    await refresh();
    return granted ? 'granted' : 'denied';
  }, [refresh]);

  return { info, refresh, requestPersistence };
}
