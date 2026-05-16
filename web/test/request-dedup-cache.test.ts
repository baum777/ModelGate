import assert from "node:assert/strict";
import test from "node:test";
import { createRequestDedupCache } from "../src/lib/request-dedup-cache.js";

test("request cache deduplicates concurrent requests for same key", async () => {
  const cache = createRequestDedupCache();
  let calls = 0;

  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true as const };
  };

  const [first, second] = await Promise.all([
    cache.getOrFetch({ key: "health", ttlMs: 1000, fetcher }),
    cache.getOrFetch({ key: "health", ttlMs: 1000, fetcher }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
});

test("request cache serves cached value within TTL", async () => {
  const cache = createRequestDedupCache();
  let calls = 0;

  const first = await cache.getOrFetch({
    key: "models",
    ttlMs: 500,
    fetcher: async () => {
      calls += 1;
      return { defaultModel: "default" };
    },
  });
  const second = await cache.getOrFetch({
    key: "models",
    ttlMs: 500,
    fetcher: async () => {
      calls += 1;
      return { defaultModel: "changed" };
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(first, { defaultModel: "default" });
  assert.deepEqual(second, { defaultModel: "default" });
});

test("request cache re-fetches after TTL expiry", async () => {
  const cache = createRequestDedupCache();
  let calls = 0;

  await cache.getOrFetch({
    key: "diagnostics",
    ttlMs: 10,
    fetcher: async () => {
      calls += 1;
      return calls;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  await cache.getOrFetch({
    key: "diagnostics",
    ttlMs: 10,
    fetcher: async () => {
      calls += 1;
      return calls;
    },
  });

  assert.equal(calls, 2);
});

test("request cache respects pre-aborted signal and skips fetcher", async () => {
  const cache = createRequestDedupCache();
  const controller = new AbortController();
  controller.abort();

  let called = false;

  await assert.rejects(
    cache.getOrFetch({
      key: "journal",
      ttlMs: 100,
      signal: controller.signal,
      fetcher: async () => {
        called = true;
        return { ok: true as const };
      },
    }),
  );

  assert.equal(called, false);
});
