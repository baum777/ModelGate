import type { PinnedChatContext } from "./pinned-chat-context.js";
import type { ChatSession, GitHubSession, MatrixSession, WorkspaceState } from "./workspace-state.js";
import { selectSession, updateSession } from "./workspace-state.js";

export type CrossTabCommand =
  | {
      type: "OpenWorkbenchWithDraft";
      payload: {
        content: string;
        repo: string;
        branch?: string;
        intent: "analysis" | "proposal" | "context";
        sourceMessageId?: string;
      };
    }
  | {
      type: "QueueMatrixDraft";
      payload: {
        sourceMessageId: string;
        roomId: string;
        content: string;
        tags?: string[];
      };
    }
  | {
      type: "PinChatContext";
      payload: PinnedChatContext;
    }
  | {
      type: "QueueChatDraft";
      payload: {
        content: string;
        source: "matrix";
      };
    };

function nowIso() {
  return new Date().toISOString();
}

export function applyOpenWorkbenchWithDraftCommand(options: {
  state: WorkspaceState;
  payload: Extract<CrossTabCommand, { type: "OpenWorkbenchWithDraft" }>["payload"];
}) {
  const now = nowIso();
  const sessionId = options.state.activeSessionIdByWorkspace.github;

  return updateSession<GitHubSession["metadata"]>(options.state, "github", sessionId, (session) => ({
    ...session,
    updatedAt: now,
    lastOpenedAt: now,
    metadata: {
      ...session.metadata,
      selectedRepoFullName: options.payload.repo.trim(),
      pendingDraft: {
        id: `workbench-draft-${now}`,
        content: options.payload.content,
        intent: options.payload.intent,
        repo: options.payload.repo.trim(),
        branch: options.payload.branch,
        sourceMessageId: options.payload.sourceMessageId,
        createdAt: now,
      },
    },
  }));
}

export function applyQueueMatrixDraftCommand(options: {
  state: WorkspaceState;
  payload: Extract<CrossTabCommand, { type: "QueueMatrixDraft" }>["payload"];
  locale: "de" | "en";
}) {
  const roomId = options.payload.roomId.trim();
  const content = options.payload.content.trim();

  if (!roomId || !content) {
    return options.state;
  }

  const tags = options.payload.tags ?? [];
  const tagsLine = tags.length > 0
    ? `\n\n${tags.map((tag) => `#${tag}`).join(" ")}`
    : "";
  const draftContent = `${content}${tagsLine}`;
  const now = nowIso();
  const sessionId = options.state.activeSessionIdByWorkspace.matrix;
  const withDraft = updateSession<MatrixSession["metadata"]>(
    options.state,
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
          previewLabel: `${options.locale === "de" ? "Beitrag" : "Post"}: ${roomId}`,
        },
        selectedEventId: null,
        selectedThreadRootId: null,
        draftContent,
        lastActionResult: options.locale === "de"
          ? "Entwurf aus Chat übernommen."
          : "Draft adopted from chat.",
      },
    }),
  );

  return selectSession(withDraft, "matrix", sessionId);
}

export function applyQueueChatDraftCommand(options: {
  state: WorkspaceState;
  payload: Extract<CrossTabCommand, { type: "QueueChatDraft" }>["payload"];
  locale: "de" | "en";
}) {
  const content = options.payload.content.trim();
  if (!content) {
    return options.state;
  }

  const now = nowIso();
  const sessionId = options.state.activeSessionIdByWorkspace.chat;
  const withDraft = updateSession<ChatSession["metadata"]>(
    options.state,
    "chat",
    sessionId,
    (session) => ({
      ...session,
      updatedAt: now,
      lastOpenedAt: now,
      metadata: {
        ...session.metadata,
        chatState: {
          ...session.metadata.chatState,
          input: content,
          connectionState: "idle",
        },
      },
    }),
  );

  return selectSession(withDraft, "chat", sessionId);
}
