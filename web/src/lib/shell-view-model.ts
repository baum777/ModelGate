import type { ReviewItem } from "../components/ReviewWorkspace.js";

export type MobileWorkspaceMode = "chat" | "github" | "matrix" | "review" | "settings";
export type MobileStatusTone = "ready" | "partial" | "error" | "muted";

export type ShellHealthState = {
  label: string;
  tone: "ready" | "partial" | "error";
  detail: string;
};

export type MobileStatusStrip = {
  tone: MobileStatusTone;
  text: string;
  badge: string | null;
};

export type MobileApprovalBar = {
  tone: "partial" | "error";
  title: string;
  detail: string;
  actionLabel: string;
};

export function deriveShellHealthState(backendHealthy: boolean | null): ShellHealthState {
  if (backendHealthy === true) {
    return {
      label: "Bereit",
      tone: "ready",
      detail: "Backend erreichbar. Ausführung bleibt backend-owned.",
    };
  }

  if (backendHealthy === false) {
    return {
      label: "Nicht verfügbar",
      tone: "error",
      detail: "Backend nicht erreichbar. Oberfläche bleibt fail-closed.",
    };
  }

  return {
    label: "Wird geprüft",
    tone: "partial",
    detail: "Backend-Health wird geladen.",
  };
}

export function summarizePendingApprovals(items: ReviewItem[]) {
  const pending = items.filter((item) => item.status === "pending_review").length;
  const stale = items.filter((item) => item.status === "stale").length;

  return {
    pending,
    stale,
    hasApprovals: pending > 0 || stale > 0,
  };
}

function isSafePublicAlias(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  if (/^sk[-_]/i.test(normalized)) {
    return false;
  }

  if (normalized.includes("/") || normalized.includes(":")) {
    return false;
  }

  return /^[a-z0-9._-]+$/i.test(normalized);
}

function formatMobileAlias(alias: string | null | undefined, fallback: string) {
  return alias && isSafePublicAlias(alias) ? alias.trim() : fallback;
}

export function deriveMobileStatusStrip(options: {
  mode: MobileWorkspaceMode;
  tone: MobileStatusTone;
  backendLabel: string;
  workspaceLabel: string;
  activeModelAlias?: string | null;
  approvalCount: number;
  staleCount: number;
  labels: {
    backendPrefix: string;
    backendOwned: string;
    approvalNeeded: string;
    blocked: string;
    publicAliasFallback: string;
  };
}): MobileStatusStrip {
  const approvalTotal = options.approvalCount + options.staleCount;
  const tone: MobileStatusTone = options.staleCount > 0
    ? "error"
    : options.approvalCount > 0
      ? "partial"
      : options.tone;
  const badge = options.staleCount > 0
    ? options.labels.blocked
    : options.approvalCount > 0
      ? options.labels.approvalNeeded
      : null;

  if (options.mode === "chat") {
    return {
      tone,
      text: `${options.labels.backendPrefix} ${options.backendLabel} · ${formatMobileAlias(options.activeModelAlias, options.labels.publicAliasFallback)}`,
      badge,
    };
  }

  if (options.mode === "github" || options.mode === "matrix") {
    return {
      tone,
      text: `${options.workspaceLabel} · ${options.labels.backendOwned}`,
      badge,
    };
  }

  if (options.mode === "review" && approvalTotal > 0) {
    return {
      tone,
      text: `${options.workspaceLabel} · ${approvalTotal} ${options.labels.approvalNeeded}`,
      badge,
    };
  }

  return {
    tone,
    text: `${options.workspaceLabel} · ${options.backendLabel}`,
    badge,
  };
}

export function deriveMobileApprovalBar(options: {
  pending: number;
  stale: number;
  labels: {
    title: string;
    actionLabel: string;
    pendingSummary: (pending: number, stale: number) => string;
    staleSummary: (pending: number, stale: number) => string;
  };
}): MobileApprovalBar | null {
  if (options.pending === 0 && options.stale === 0) {
    return null;
  }

  return {
    tone: options.stale > 0 ? "error" : "partial",
    title: options.labels.title,
    detail: options.stale > 0
      ? options.labels.staleSummary(options.pending, options.stale)
      : options.labels.pendingSummary(options.pending, options.stale),
    actionLabel: options.labels.actionLabel,
  };
}
