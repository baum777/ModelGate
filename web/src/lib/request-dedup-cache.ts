type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type RequestDedupCache = ReturnType<typeof createRequestDedupCache>;

export function createRequestDedupCache() {
  const cached = new Map<string, CacheEntry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  function startFetch<T>(options: {
    key: string;
    ttlMs: number;
    signal?: AbortSignal;
    fetcher: (signal?: AbortSignal) => Promise<T>;
  }) {
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

  async function getOrFetch<T>(options: {
    key: string;
    ttlMs: number;
    staleWhileRevalidate?: boolean;
    signal?: AbortSignal;
    fetcher: (signal?: AbortSignal) => Promise<T>;
  }): Promise<T> {
    const now = Date.now();
    const hit = cached.get(options.key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }

    if (hit && options.staleWhileRevalidate) {
      if (!inflight.has(options.key)) {
        void startFetch(options).catch(() => {
          // Keep stale value on refresh failure.
        });
      }

      return hit.value as T;
    }

    const active = inflight.get(options.key);
    if (active) {
      return active as Promise<T>;
    }

    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Request aborted", "AbortError");
    }

    return startFetch(options);
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
