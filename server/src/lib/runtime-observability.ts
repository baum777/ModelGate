export type RuntimeCounters = {
  chatRequests: number;
  chatStreamStarted: number;
  chatStreamCompleted: number;
  chatStreamError: number;
  chatStreamAborted: number;
  upstreamError: number;
};

export type RuntimeObservabilitySnapshot = {
  startedAt: string;
  generatedAt: string;
  uptimeMs: number;
  counters: RuntimeCounters;
};

export type RuntimeObservability = {
  increment(counter: keyof RuntimeCounters): void;
  snapshot(): RuntimeObservabilitySnapshot;
};

type Clock = () => number;

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

export function createRuntimeObservability(now: Clock = () => Date.now()): RuntimeObservability {
  const startedAtMs = now();
  const counters: RuntimeCounters = {
    chatRequests: 0,
    chatStreamStarted: 0,
    chatStreamCompleted: 0,
    chatStreamError: 0,
    chatStreamAborted: 0,
    upstreamError: 0
  };

  return {
    increment(counter) {
      counters[counter] += 1;
    },
    snapshot() {
      const generatedAtMs = now();
      return {
        startedAt: toIso(startedAtMs),
        generatedAt: toIso(generatedAtMs),
        uptimeMs: Math.max(0, generatedAtMs - startedAtMs),
        counters: {
          chatRequests: counters.chatRequests,
          chatStreamStarted: counters.chatStreamStarted,
          chatStreamCompleted: counters.chatStreamCompleted,
          chatStreamError: counters.chatStreamError,
          chatStreamAborted: counters.chatStreamAborted,
          upstreamError: counters.upstreamError
        }
      };
    }
  };
}
