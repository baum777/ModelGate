export type SystemLayer = "ui" | "routing" | "governance" | "execution" | "evidence";

export type SystemNodeKind =
  | "github"
  | "matrix"
  | "openrouter"
  | "journal"
  | "diagnostics"
  | "generic";

export type SystemNodeStatus =
  | "disconnected"
  | "connected"
  | "pending"
  | "executing"
  | "blocked"
  | "error";

export type FlowIndicatorState =
  | "idle"
  | "connected"
  | "pending"
  | "executing"
  | "blocked"
  | "success"
  | "error";

export type FlowIndicatorDirection = "vertical" | "horizontal";

export const systemLayerClassMap: Record<SystemLayer, string> = {
  ui: "system-layer-frame-ui",
  routing: "system-layer-frame-routing",
  governance: "system-layer-frame-governance",
  execution: "system-layer-frame-execution",
  evidence: "system-layer-frame-evidence",
};

export const systemNodeKindClassMap: Record<SystemNodeKind, string> = {
  github: "system-node-github",
  matrix: "system-node-matrix",
  openrouter: "system-node-openrouter",
  journal: "system-node-journal",
  diagnostics: "system-node-diagnostics",
  generic: "system-node-generic",
};

export const systemNodeStatusClassMap: Record<SystemNodeStatus, string> = {
  disconnected: "system-node-status-disconnected",
  connected: "system-node-status-connected",
  pending: "system-node-status-pending",
  executing: "system-node-status-executing",
  blocked: "system-node-status-blocked",
  error: "system-node-status-error",
};

export const flowStatusClassMap: Record<FlowIndicatorState, string> = {
  idle: "flow-indicator-idle",
  connected: "flow-indicator-connected",
  pending: "flow-indicator-pending",
  executing: "flow-indicator-executing",
  blocked: "flow-indicator-blocked",
  success: "flow-indicator-success",
  error: "flow-indicator-error",
};

export const flowDirectionClassMap: Record<FlowIndicatorDirection, string> = {
  vertical: "flow-indicator-vertical",
  horizontal: "flow-indicator-horizontal",
};

export function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
