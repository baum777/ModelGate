import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppEnv } from "./env.js";

export type JournalSource = "chat" | "github" | "matrix" | "auth" | "rate_limit" | "diagnostics" | "system";
export type JournalSeverity = "info" | "warning" | "error";
export type JournalOutcome = "accepted" | "rejected" | "executed" | "failed" | "blocked" | "verified" | "unverifiable" | "observed";
export type JournalStoreMode = "memory" | "file";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export type JournalRouteSummary = {
  selectedAlias?: string;
  workflowRole?: string;
  taskClass?: string;
  fallbackUsed?: boolean;
  degraded?: boolean;
  streaming?: boolean;
};

export type RuntimeJournalEntry = {
  id: string;
  timestamp: string;
  source: JournalSource;
  eventType: string;
  authorityDomain: string;
  severity: JournalSeverity;
  outcome: JournalOutcome;
  summary: string;
  correlationId: string | null;
  proposalId: string | null;
  planId: string | null;
  executionId: string | null;
  verificationId: string | null;
  modelRouteSummary: JournalRouteSummary | null;
  safeMetadata: JsonObject;
  redaction: {
    contentStored: false;
    secretsStored: false;
    filteredKeys: string[];
  };
};

export type RuntimeJournalAppend = {
  source: JournalSource;
  eventType: string;
  authorityDomain: string;
  severity: JournalSeverity;
  outcome: JournalOutcome;
  summary: string;
  correlationId?: string | null;
  proposalId?: string | null;
  planId?: string | null;
  executionId?: string | null;
  verificationId?: string | null;
  modelRouteSummary?: JournalRouteSummary | null;
  safeMetadata?: unknown;
};

export type RuntimeJournalListOptions = {
  limit?: number;
  source?: JournalSource;
};

export type RuntimeJournalPublicSnapshot = {
  enabled: boolean;
  mode: JournalStoreMode;
  maxEntries: number;
  exposeRecentLimit: number;
  recentCount: number;
};

export type RuntimeJournal = {
  append(entry: RuntimeJournalAppend): RuntimeJournalEntry | null;
  listRecent(options?: RuntimeJournalListOptions): RuntimeJournalEntry[];
  getPublicSnapshot(): RuntimeJournalPublicSnapshot;
};

export type RuntimeJournalSelection = {
  enabled: boolean;
  mode: JournalStoreMode;
  filePath: string;
  maxEntries: number;
  exposeRecentLimit: number;
};

type RuntimeJournalSnapshot = {
  version: 1;
  entries: RuntimeJournalEntry[];
};

type RuntimeJournalOptions = {
  enabled: boolean;
  mode: JournalStoreMode;
  filePath?: string;
  maxEntries: number;
  exposeRecentLimit: number;
  now?: () => number;
};

const FORBIDDEN_METADATA_KEY_PATTERN = /(token|secret|cookie|password|authorization|api[_-]?key|limiter[_-]?key|prompt|message|content|provider|target|diff|patch|session|ip)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJournalSource(value: unknown): value is JournalSource {
  return value === "chat"
    || value === "github"
    || value === "matrix"
    || value === "auth"
    || value === "rate_limit"
    || value === "diagnostics"
    || value === "system";
}

function isJournalSeverity(value: unknown): value is JournalSeverity {
  return value === "info" || value === "warning" || value === "error";
}

function isJournalOutcome(value: unknown): value is JournalOutcome {
  return value === "accepted"
    || value === "rejected"
    || value === "executed"
    || value === "failed"
    || value === "blocked"
    || value === "verified"
    || value === "unverifiable"
    || value === "observed";
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRouteSummary(value: unknown): value is JournalRouteSummary {
  if (value === null) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  const allowedKeys = ["selectedAlias", "workflowRole", "taskClass", "fallbackUsed", "degraded", "streaming"];

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return false;
    }
  }

  if ("selectedAlias" in value && typeof value.selectedAlias !== "string") {
    return false;
  }

  if ("workflowRole" in value && typeof value.workflowRole !== "string") {
    return false;
  }

  if ("taskClass" in value && typeof value.taskClass !== "string") {
    return false;
  }

  if ("fallbackUsed" in value && typeof value.fallbackUsed !== "boolean") {
    return false;
  }

  if ("degraded" in value && typeof value.degraded !== "boolean") {
    return false;
  }

  if ("streaming" in value && typeof value.streaming !== "boolean") {
    return false;
  }

  return true;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

function isRuntimeJournalEntry(value: unknown): value is RuntimeJournalEntry {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.timestamp === "string"
    && isJournalSource(value.source)
    && typeof value.eventType === "string"
    && typeof value.authorityDomain === "string"
    && isJournalSeverity(value.severity)
    && isJournalOutcome(value.outcome)
    && typeof value.summary === "string"
    && isStringOrNull(value.correlationId)
    && isStringOrNull(value.proposalId)
    && isStringOrNull(value.planId)
    && isStringOrNull(value.executionId)
    && isStringOrNull(value.verificationId)
    && isRouteSummary(value.modelRouteSummary)
    && isRecord(value.safeMetadata)
    && isJsonValue(value.safeMetadata)
    && isRecord(value.redaction)
    && value.redaction.contentStored === false
    && value.redaction.secretsStored === false
    && Array.isArray(value.redaction.filteredKeys)
    && value.redaction.filteredKeys.every((item) => typeof item === "string");
}

function normalizePositiveInt(value: number, fallback: number) {
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function sanitizeJsonValue(value: unknown, filteredKeys: Set<string>): JsonValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => sanitizeJsonValue(entry, filteredKeys))
      .filter((entry) => entry !== undefined) as JsonValue[];

    return normalized;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const normalized: JsonObject = {};

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) {
      filteredKeys.add(key);
      continue;
    }

    const sanitizedChild = sanitizeJsonValue(child, filteredKeys);

    if (sanitizedChild !== undefined) {
      normalized[key] = sanitizedChild;
    }
  }

  return normalized;
}

function sanitizeMetadata(input: unknown): { metadata: JsonObject; filteredKeys: string[] } {
  const filteredKeys = new Set<string>();
  const sanitized = sanitizeJsonValue(input, filteredKeys);
  const metadata = isRecord(sanitized) ? (sanitized as JsonObject) : {};

  return {
    metadata,
    filteredKeys: [...filteredKeys.values()]
  };
}

function toIso(nowMs: number) {
  return new Date(nowMs).toISOString();
}

function limitEntries(entries: RuntimeJournalEntry[], maxEntries: number) {
  if (entries.length <= maxEntries) {
    return entries;
  }

  return entries.slice(entries.length - maxEntries);
}

function readSnapshotFile(filePath: string): RuntimeJournalSnapshot | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return null;
    }

    const entries: RuntimeJournalEntry[] = [];

    for (const entry of parsed.entries) {
      if (!isRuntimeJournalEntry(entry)) {
        return null;
      }

      entries.push(entry);
    }

    return {
      version: 1,
      entries
    };
  } catch {
    return null;
  }
}

function writeSnapshotFile(filePath: string, entries: RuntimeJournalEntry[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const snapshot: RuntimeJournalSnapshot = {
    version: 1,
    entries
  };
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeEntry(
  entry: RuntimeJournalAppend,
  nowMs: number
): RuntimeJournalEntry {
  const metadata = sanitizeMetadata(entry.safeMetadata ?? {});

  return {
    id: randomUUID(),
    timestamp: toIso(nowMs),
    source: entry.source,
    eventType: entry.eventType.trim(),
    authorityDomain: entry.authorityDomain.trim(),
    severity: entry.severity,
    outcome: entry.outcome,
    summary: entry.summary.trim(),
    correlationId: entry.correlationId ?? null,
    proposalId: entry.proposalId ?? null,
    planId: entry.planId ?? null,
    executionId: entry.executionId ?? null,
    verificationId: entry.verificationId ?? null,
    modelRouteSummary: entry.modelRouteSummary ?? null,
    safeMetadata: metadata.metadata,
    redaction: {
      contentStored: false,
      secretsStored: false,
      filteredKeys: metadata.filteredKeys
    }
  };
}

function createNoopRuntimeJournal(snapshot: RuntimeJournalPublicSnapshot): RuntimeJournal {
  return {
    append() {
      return null;
    },
    listRecent() {
      return [];
    },
    getPublicSnapshot() {
      return snapshot;
    }
  };
}

function createActiveRuntimeJournal(options: RuntimeJournalOptions): RuntimeJournal {
  const now = options.now ?? (() => Date.now());
  const maxEntries = normalizePositiveInt(options.maxEntries, 500);
  const exposeRecentLimit = normalizePositiveInt(options.exposeRecentLimit, 50);
  const mode = options.mode;
  const filePath = mode === "file" ? path.resolve(options.filePath ?? ".local-ai/state/runtime-journal.json") : null;
  let entries: RuntimeJournalEntry[] = [];

  if (mode === "file" && filePath) {
    const snapshot = readSnapshotFile(filePath);
    entries = snapshot?.entries ?? [];
  }

  const persist = () => {
    if (mode === "file" && filePath) {
      writeSnapshotFile(filePath, entries);
    }
  };

  return {
    append(entry) {
      const normalized = normalizeEntry(entry, now());
      entries = limitEntries([...entries, normalized], maxEntries);
      persist();
      return normalized;
    },
    listRecent(listOptions) {
      const limit = normalizePositiveInt(listOptions?.limit ?? exposeRecentLimit, exposeRecentLimit);
      const source = listOptions?.source;
      const filtered = source ? entries.filter((entry) => entry.source === source) : entries;

      return filtered.slice(Math.max(0, filtered.length - limit)).reverse();
    },
    getPublicSnapshot() {
      return {
        enabled: true,
        mode,
        maxEntries,
        exposeRecentLimit,
        recentCount: entries.length
      };
    }
  };
}

export function createRuntimeJournalSelection(env: AppEnv): RuntimeJournalSelection {
  const enabled = env.JOURNAL_ENABLED;
  const mode = env.JOURNAL_STORE_MODE.trim().toLowerCase() === "file" ? "file" : "memory";
  const filePath = env.JOURNAL_FILE_PATH.trim() || ".local-ai/state/runtime-journal.json";

  return {
    enabled,
    mode,
    filePath,
    maxEntries: env.JOURNAL_MAX_ENTRIES,
    exposeRecentLimit: env.JOURNAL_EXPOSE_RECENT_LIMIT
  };
}

export function createRuntimeJournal(options: RuntimeJournalOptions): RuntimeJournal {
  const maxEntries = normalizePositiveInt(options.maxEntries, 500);
  const exposeRecentLimit = normalizePositiveInt(options.exposeRecentLimit, 50);

  if (!options.enabled) {
    return createNoopRuntimeJournal({
      enabled: false,
      mode: options.mode,
      maxEntries,
      exposeRecentLimit,
      recentCount: 0
    });
  }

  return createActiveRuntimeJournal({
    ...options,
    maxEntries,
    exposeRecentLimit
  });
}
