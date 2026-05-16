import type { WorkspaceKind } from "./workspace-state.js";

export type WorkspaceMode = "chat" | "workbench" | "matrix" | "settings";
export type AppSurface = "console" | "readme" | "preview";

export const WORKSPACE_MODES: WorkspaceMode[] = ["chat", "workbench", "matrix", "settings"];
export const MOBILE_NAV_MODES: WorkspaceMode[] = ["chat", "workbench", "matrix", "settings"];

export function isWorkspaceMode(value: string | null): value is WorkspaceMode {
  return value === "chat"
    || value === "workbench"
    || value === "matrix"
    || value === "settings";
}

export function normalizeWorkspaceMode(value: string | null | undefined): WorkspaceMode | null {
  if (!value) {
    return null;
  }

  if (isWorkspaceMode(value)) {
    return value;
  }

  if (value === "github" || value === "review" || value === "context") {
    return "workbench";
  }

  return null;
}

export function toWorkspaceKind(mode: "chat" | "workbench" | "matrix"): WorkspaceKind {
  if (mode === "workbench") {
    return "github";
  }

  return mode;
}

export function toWorkspaceMode(workspace: WorkspaceKind): "chat" | "workbench" | "matrix" {
  if (workspace === "github") {
    return "workbench";
  }

  return workspace;
}

export function isSessionWorkspace(mode: WorkspaceMode): mode is "chat" | "workbench" | "matrix" {
  return mode === "chat" || mode === "workbench" || mode === "matrix";
}

export function shouldConfirmGitHubReviewNavigation(options: {
  currentMode: WorkspaceMode;
  nextMode: WorkspaceMode;
  githubReviewDirty: boolean;
}) {
  return options.currentMode === "workbench"
    && options.nextMode !== "workbench"
    && options.githubReviewDirty;
}

export function resolveAppSurface(href?: string): AppSurface {
  if (typeof window === "undefined" && !href) {
    return "console";
  }

  const url = new URL(href ?? window.location.href);

  if (url.pathname === "/console" || url.searchParams.get("console") === "1") {
    return "console";
  }

  if (url.pathname === "/readme" || url.pathname === "/handbook") {
    return "readme";
  }

  return "preview";
}
