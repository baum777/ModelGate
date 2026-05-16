import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  selectSession,
  updateSession,
  type MatrixSession,
  type WorkspaceKind,
  type WorkspaceState,
} from "../lib/workspace-state.js";
import type { PinnedChatContext } from "../lib/pinned-chat-context.js";

export type WorkspaceMode = "chat" | "workbench" | "matrix" | "settings";

type RecordTelemetry = (kind: "info" | "warning" | "error", label: string, detail?: string) => void;

function nowIso() {
  return new Date().toISOString();
}

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
    setPinnedChatContext(context);
    setMode("chat");
    selectActiveWorkspaceSession("chat");
  }, [selectActiveWorkspaceSession, setMode]);

  const handleClearPinnedChatContext = useCallback(() => {
    setPinnedChatContext(null);
  }, []);

  const handleQueueMatrixDraftFromChat = useCallback((payload: {
    sourceMessageId: string;
    roomId: string;
    content: string;
    tags: string[];
  }) => {
    const roomId = payload.roomId.trim();
    const content = payload.content.trim();
    if (!roomId || !content) {
      return;
    }

    const tagsLine = payload.tags.length > 0
      ? `\n\n${payload.tags.map((tag) => `#${tag}`).join(" ")}`
      : "";
    const draftContent = `${content}${tagsLine}`;
    const now = nowIso();

    setMode("matrix");
    setWorkspaceState((current) => {
      const sessionId = current.activeSessionIdByWorkspace.matrix;
      const withDraft = updateSession<MatrixSession["metadata"]>(
        current,
        "matrix",
        sessionId,
        (session) => ({
          ...session,
          updatedAt: now,
          lastOpenedAt: now,
          metadata: {
            ...session.metadata,
            roomId,
            composerMode: "post",
            composerTarget: {
              kind: "post",
              roomId,
              postId: null,
              threadRootId: null,
              previewLabel: `${locale === "de" ? "Beitrag" : "Post"}: ${roomId}`,
            },
            selectedEventId: null,
            selectedThreadRootId: null,
            draftContent,
            lastActionResult: locale === "de"
              ? "Entwurf aus Chat übernommen."
              : "Draft adopted from chat.",
          },
        }),
      );

      return selectSession(withDraft, "matrix", sessionId);
    });

    recordTelemetry(
      "info",
      locale === "de" ? "Matrix-Entwurf vorbereitet" : "Matrix draft prepared",
      `${payload.sourceMessageId} -> ${roomId}`,
    );
  }, [locale, recordTelemetry, setMode, setWorkspaceState]);

  const handleOpenGitHubFromChatAction = useCallback((payload: {
    sourceMessageId: string;
    content: string;
  }) => {
    setMode("workbench");
    selectActiveWorkspaceSession("github");
    recordTelemetry(
      "info",
      locale === "de" ? "GitHub-Dispatch geöffnet" : "GitHub dispatch opened",
      `${payload.sourceMessageId} (${payload.content.length} chars)`,
    );
  }, [locale, recordTelemetry, selectActiveWorkspaceSession, setMode]);

  return {
    pinnedChatContext,
    handleWorkspaceTabSelect,
    handlePinChatContext,
    handleClearPinnedChatContext,
    handleQueueMatrixDraftFromChat,
    handleOpenGitHubFromChatAction,
  };
}
