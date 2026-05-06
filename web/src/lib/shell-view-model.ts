import type { ReviewItem } from "../components/ReviewWorkspace.js";

export type ShellHealthState = {
  label: string;
  tone: "ready" | "partial" | "error";
  detail: string;
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
