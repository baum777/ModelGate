import fs from "node:fs";
import path from "node:path";
import type { AppEnv } from "./env.js";
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

export type GitHubActionStoreMode = "memory" | "file";

export type GitHubActionStoreSelection = {
  mode: GitHubActionStoreMode;
  filePath: string;
};

type GitHubActionStoreOptions = {
  ttlMs?: number;
  now?: () => number;
};

type GitHubFileActionStoreOptions = GitHubActionStoreOptions & {
  filePath: string;
};

type GitHubActionStoreSnapshot = {
  version: 1;
  plans: GitHubActionStoreEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isGitHubRoutingMetadata(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return isString(value.workflowRole)
    && isString(value.selectedModel)
    && Array.isArray(value.candidateModels)
    && value.candidateModels.every((entry) => isString(entry))
    && isBoolean(value.fallbackUsed)
    && isString(value.selectionSource)
    && isString(value.routingMode)
    && isBoolean(value.allowFallback)
    && isBoolean(value.failClosed)
    && isBoolean(value.structuredOutputRequired)
    && isBoolean(value.approvalRequired)
    && isBoolean(value.mayExecuteExternalTools)
    && isBoolean(value.mayWriteExternalState)
    && ("policySectionKey" in value)
    && (value.policySectionKey === null || isString(value.policySectionKey))
    && isString(value.recordedAt);
}

function isGitHubActionStoreEntry(value: unknown): value is GitHubActionStoreEntry {
  if (!isRecord(value)) {
    return false;
  }

  if (!isString(value.planId)
    || !isRecord(value.repo)
    || !isString(value.baseRef)
    || !isString(value.baseSha)
    || !isString(value.branchName)
    || !isString(value.targetBranch)
    || !isString(value.status)
    || typeof value.stale !== "boolean"
    || typeof value.requiresApproval !== "boolean"
    || !isString(value.summary)
    || !isString(value.rationale)
    || !isString(value.riskLevel)
    || !Array.isArray(value.citations)
    || !Array.isArray(value.diff)
    || !isString(value.generatedAt)
    || !isString(value.expiresAt)
    || !isNumber(value.createdAtMs)
    || !isNumber(value.expiresAtMs)
    || !isRecord(value.request)
    || !isRecord(value.context)) {
    return false;
  }

  if ("routingMetadata" in value && value.routingMetadata !== undefined && !isGitHubRoutingMetadata(value.routingMetadata)) {
    return false;
  }

  const repo = value.repo;

  if (!isString(repo.owner)
    || !isString(repo.repo)
    || !isString(repo.fullName)
    || !isString(repo.defaultBranch)
    || !("defaultBranchSha" in repo)
    || !("description" in repo)
    || !("isPrivate" in repo)
    || !("status" in repo)
    || !("permissions" in repo)
    || !("checkedAt" in repo)) {
    return false;
  }

  return true;
}

function createStoreSnapshot(plans: Map<string, GitHubActionStoreEntry>): GitHubActionStoreSnapshot {
  return {
    version: 1,
    plans: [...plans.values()]
  };
}

function readSnapshotFile(filePath: string): GitHubActionStoreSnapshot | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.version !== 1 || !Array.isArray(parsed.plans)) {
      return null;
    }

    const plans: GitHubActionStoreEntry[] = [];

    for (const plan of parsed.plans) {
      if (!isGitHubActionStoreEntry(plan)) {
        return null;
      }

      plans.push(plan);
    }

    return {
      version: 1,
      plans
    };
  } catch {
    return null;
  }
}

function writeSnapshotFile(filePath: string, snapshot: GitHubActionStoreSnapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function createPlanLookupReader(
  plans: Map<string, GitHubActionStoreEntry>,
  now: () => number,
  persistOnDelete?: () => void
) {
  return function readPlan(planId: string): GitHubActionStoreLookup {
    const plan = plans.get(planId);

    if (!plan) {
      return { state: "missing" };
    }

    if (plan.expiresAtMs <= now()) {
      plans.delete(planId);

      if (persistOnDelete) {
        persistOnDelete();
      }

      return { state: "expired", plan };
    }

    return { state: "active", plan };
  };
}

export function createInMemoryGitHubActionStore(
  ttlMs = 12 * 60 * 1000,
  now: () => number = () => Date.now()
): GitHubActionStore {
  const plans = new Map<string, GitHubActionStoreEntry>();
  const readPlan = createPlanLookupReader(plans, now);

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

export function createFileGitHubActionStore(options: GitHubFileActionStoreOptions): GitHubActionStore {
  const ttlMs = options.ttlMs ?? 12 * 60 * 1000;
  const now = options.now ?? (() => Date.now());
  const filePath = path.resolve(options.filePath);
  const loadedSnapshot = readSnapshotFile(filePath);
  const plans = new Map<string, GitHubActionStoreEntry>();

  for (const plan of loadedSnapshot?.plans ?? []) {
    plans.set(plan.planId, plan);
  }

  const persist = () => {
    writeSnapshotFile(filePath, createStoreSnapshot(plans));
  };
  const readPlan = createPlanLookupReader(plans, now, persist);

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
      persist();
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
      persist();
      return {
        state: "active",
        plan: next
      };
    }
  };
}

export function createGitHubActionStoreSelection(env: AppEnv): GitHubActionStoreSelection {
  const mode = env.GITHUB_ACTION_STORE_MODE.trim().toLowerCase() === "file" ? "file" : "memory";
  const filePath = env.GITHUB_ACTION_STORE_FILE_PATH.trim() || ".local-ai/state/github-action-store.json";

  return {
    mode,
    filePath
  };
}

export function createConfigurableGitHubActionStore(options: GitHubActionStoreOptions & GitHubActionStoreSelection): GitHubActionStore {
  if (options.mode === "file") {
    return createFileGitHubActionStore({
      ttlMs: options.ttlMs,
      now: options.now,
      filePath: options.filePath
    });
  }

  return createInMemoryGitHubActionStore(options.ttlMs, options.now);
}

export function createGitHubActionStore(ttlMs = 12 * 60 * 1000, now: () => number = () => Date.now()): GitHubActionStore {
  return createInMemoryGitHubActionStore(ttlMs, now);
}
