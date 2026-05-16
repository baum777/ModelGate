import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  type WorkspaceKind,
  type WorkspaceState,
} from "../lib/workspace-state.js";
import type { PinnedChatContext } from "../lib/pinned-chat-context.js";
import {
  applyOpenWorkbenchWithDraftCommand,
  applyQueueMatrixDraftCommand,
  type CrossTabCommand,
} from "../lib/cross-tab-commands.js";

export type WorkspaceMode = "chat" | "workbench" | "matrix" | "settings";

type RecordTelemetry = (kind: "info" | "warning" | "error", label: string, detail?: string) => void;

function isSessionWorkspace(mode: WorkspaceMode): mode is "chat" | "workbench" | "matrix" {
  return mode === "chat" || mode === "workbench" || mode === "matrix";
}

function toWorkspaceKind(mode: "chat" | "workbench" | "matrix"): WorkspaceKind {
  if (mode === "workbench") {
    return "github";
  }

  return mode;
}

function shouldConfirmGitHubReviewNavigation(options: {
  currentMode: WorkspaceMode;
  nextMode: WorkspaceMode;
  githubReviewDirty: boolean;
}) {
  return options.currentMode === "workbench"
    && options.nextMode !== "workbench"
    && options.githubReviewDirty;
}

export function createCrossTabCommandHandler(options: {
  locale: "de" | "en";
  setMode: (mode: WorkspaceMode) => void;
  setWorkspaceState: Dispatch<SetStateAction<WorkspaceState>>;
  selectActiveWorkspaceSession: (workspace: WorkspaceKind) => void;
  setPinnedChatContext: Dispatch<SetStateAction<PinnedChatContext | null>>;
  recordTelemetry: RecordTelemetry;
}) {
  return (command: CrossTabCommand) => {
    if (command.type === "PinChatContext") {
      options.setPinnedChatContext(command.payload);
      options.setMode("chat");
      options.selectActiveWorkspaceSession("chat");
      return;
    }

    if (command.type === "QueueMatrixDraft") {
      options.setMode("matrix");
      options.setWorkspaceState((current) => applyQueueMatrixDraftCommand({
        state: current,
        payload: command.payload,
        locale: options.locale,
      }));
      options.recordTelemetry(
        "info",
        options.locale === "de" ? "Matrix-Entwurf vorbereitet" : "Matrix draft prepared",
        `${command.payload.sourceMessageId} -> ${command.payload.roomId}`,
      );
      return;
    }

    options.setWorkspaceState((current) => applyOpenWorkbenchWithDraftCommand({
      state: current,
      payload: command.payload,
    }));
    options.setMode("workbench");
    options.selectActiveWorkspaceSession("github");
    options.recordTelemetry(
      "info",
      options.locale === "de" ? "GitHub-Dispatch geöffnet" : "GitHub dispatch opened",
      `${command.payload.sourceMessageId ?? "chat"} (${command.payload.content.length} chars)`,
    );
  };
}

export function useCrossTabCommands(options: {
  locale: "de" | "en";
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  githubReviewDirty: boolean;
  githubReviewConfirmNavigation: string;
  setWorkspaceState: Dispatch<SetStateAction<WorkspaceState>>;
  selectActiveWorkspaceSession: (workspace: WorkspaceKind) => void;
  recordTelemetry: RecordTelemetry;
}) {
  const {
    locale,
    mode,
    setMode,
    githubReviewDirty,
    githubReviewConfirmNavigation,
    setWorkspaceState,
    selectActiveWorkspaceSession,
    recordTelemetry,
  } = options;
  const [pinnedChatContext, setPinnedChatContext] = useState<PinnedChatContext | null>(null);
  const handleCrossTabCommand = useCallback(createCrossTabCommandHandler({
    locale,
    setMode,
    setWorkspaceState,
    selectActiveWorkspaceSession,
    setPinnedChatContext,
    recordTelemetry,
  }), [locale, recordTelemetry, selectActiveWorkspaceSession, setMode, setWorkspaceState]);

  const handleWorkspaceTabSelect = useCallback((nextMode: WorkspaceMode) => {
    if (shouldConfirmGitHubReviewNavigation({
      currentMode: mode,
      nextMode,
      githubReviewDirty,
    })) {
      const allowLeave = typeof window === "undefined"
        ? true
        : window.confirm(githubReviewConfirmNavigation);

      if (!allowLeave) {
        return;
      }
    }

    setMode(nextMode);

    if (isSessionWorkspace(nextMode)) {
      selectActiveWorkspaceSession(toWorkspaceKind(nextMode));
    }
  }, [githubReviewConfirmNavigation, githubReviewDirty, mode, selectActiveWorkspaceSession, setMode]);

  const handlePinChatContext = useCallback((context: PinnedChatContext) => {
    handleCrossTabCommand({
      type: "PinChatContext",
      payload: context,
    });
  }, [handleCrossTabCommand]);

  const handleClearPinnedChatContext = useCallback(() => {
    setPinnedChatContext(null);
  }, []);

  return {
    pinnedChatContext,
    handleWorkspaceTabSelect,
    handlePinChatContext,
    handleClearPinnedChatContext,
    handleCrossTabCommand,
  };
}
