import type {
  MatrixAgentPlan,
  MatrixActionExecutionResult,
  MatrixActionPlan,
  MatrixActionVerificationResult
} from "./matrix-action-contract.js";

export type MatrixActionStorePlan = MatrixActionPlan | MatrixAgentPlan;

export type MatrixActionStoreEntry<T extends MatrixActionStorePlan = MatrixActionStorePlan> = T & {
  createdAtMs: number;
  expiresAtMs: number;
  execution?: MatrixActionExecutionResult;
  verification?: MatrixActionVerificationResult;
};

export type MatrixActionStoreLookup =
  | { state: "missing" }
  | { state: "expired"; plan: MatrixActionStoreEntry }
  | { state: "active"; plan: MatrixActionStoreEntry };

export type MatrixActionStore = {
  ttlMs: number;
  createPlan<T extends MatrixActionStorePlan>(plan: T): MatrixActionStoreEntry<T>;
  readPlan(planId: string): MatrixActionStoreLookup;
  updatePlan(planId: string, updater: (plan: MatrixActionStoreEntry) => MatrixActionStoreEntry): MatrixActionStoreLookup;
};

export function createMatrixActionStore(ttlMs = 12 * 60 * 1000, now: () => number = () => Date.now()): MatrixActionStore {
  const plans = new Map<string, MatrixActionStoreEntry>();

  function readPlan(planId: string): MatrixActionStoreLookup {
    const plan = plans.get(planId);

    if (!plan) {
      return { state: "missing" };
    }

    if (plan.expiresAtMs <= now()) {
      plans.delete(planId);
      return { state: "expired", plan };
    }

    return { state: "active", plan };
  }

  return {
    ttlMs,
    createPlan<T extends MatrixActionStorePlan>(plan: T) {
      const createdAtMs = now();
      const entry: MatrixActionStoreEntry<T> = {
        ...plan,
        createdAtMs,
        expiresAtMs: createdAtMs + ttlMs
      } as MatrixActionStoreEntry<T>;

      plans.set(entry.planId, entry);
      return entry;
    },
    readPlan,
    updatePlan(planId, updater) {
      const lookup = readPlan(planId);

      if (lookup.state !== "active") {
        return lookup;
      }

      const next = updater(lookup.plan);
      plans.set(planId, next);
      return {
        state: "active",
        plan: next
      };
    }
  };
}
