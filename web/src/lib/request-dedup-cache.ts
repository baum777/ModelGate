type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type RequestDedupCache = ReturnType<typeof createRequestDedupCache>;

export function createRequestDedupCache() {
  const cached = new Map<string, CacheEntry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  async function getOrFetch<T>(options: {
    key: string;
    ttlMs: number;
    signal?: AbortSignal;
    fetcher: (signal?: AbortSignal) => Promise<T>;
  }): Promise<T> {
    const now = Date.now();
    const hit = cached.get(options.key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }

    const active = inflight.get(options.key);
    if (active) {
      return active as Promise<T>;
    }

    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Request aborted", "AbortError");
    }

    const requestPromise = options.fetcher(options.signal)
      .then((value) => {
        cached.set(options.key, {
          expiresAt: Date.now() + Math.max(0, options.ttlMs),
          value,
        });
        return value;
      })
      .finally(() => {
        inflight.delete(options.key);
      });

    inflight.set(options.key, requestPromise);

    return requestPromise;
  }

  function clear() {
    cached.clear();
    inflight.clear();
  }

  return {
    getOrFetch,
    clear,
  };
}
