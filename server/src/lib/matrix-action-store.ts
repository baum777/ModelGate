import type {
  MatrixActionExecutionResult,
  MatrixActionPlan,
  MatrixActionVerificationResult
} from "./matrix-action-contract.js";

export type MatrixActionStoreEntry = MatrixActionPlan & {
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
  createPlan(plan: Omit<MatrixActionStoreEntry, "createdAtMs" | "expiresAtMs">): MatrixActionStoreEntry;
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
    createPlan(plan) {
      const createdAtMs = now();
      const entry: MatrixActionStoreEntry = {
        ...plan,
        createdAtMs,
        expiresAtMs: createdAtMs + ttlMs
      };

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

