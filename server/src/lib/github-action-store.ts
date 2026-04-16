import type {
  GitHubChangePlan,
  GitHubChangeProposalRequest,
  GitHubContextBundle
} from "./github-contract.js";

export type GitHubActionStoreEntry = GitHubChangePlan & {
  createdAtMs: number;
  expiresAtMs: number;
  request: GitHubChangeProposalRequest;
  context: GitHubContextBundle;
};

export type GitHubActionStoreLookup =
  | { state: "missing" }
  | { state: "expired"; plan: GitHubActionStoreEntry }
  | { state: "active"; plan: GitHubActionStoreEntry };

export type GitHubActionStore = {
  ttlMs: number;
  createPlan(plan: Omit<GitHubActionStoreEntry, "createdAtMs" | "expiresAtMs">): GitHubActionStoreEntry;
  readPlan(planId: string): GitHubActionStoreLookup;
  updatePlan(planId: string, updater: (plan: GitHubActionStoreEntry) => GitHubActionStoreEntry): GitHubActionStoreLookup;
};

export function createGitHubActionStore(ttlMs = 12 * 60 * 1000, now: () => number = () => Date.now()): GitHubActionStore {
  const plans = new Map<string, GitHubActionStoreEntry>();

  function readPlan(planId: string): GitHubActionStoreLookup {
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
      const entry: GitHubActionStoreEntry = {
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
