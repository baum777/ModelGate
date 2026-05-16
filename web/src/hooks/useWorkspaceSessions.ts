import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendSession,
  createChatSessionMetadata,
  createGitHubSessionMetadata,
  createMatrixSessionMetadata,
  createSession,
  deleteSession,
  loadWorkspaceState,
  saveWorkspaceState,
  selectSession,
  updateSession,
  type ChatSession,
  type GitHubSession,
  type MatrixSession,
  type WorkspaceKind,
  type WorkspaceSession,
  type WorkspaceState,
} from "../lib/workspace-state.js";

const WORKSPACE_STATE_SAVE_INTERVAL_MS = 250;

function nowIso() {
  return new Date().toISOString();
}

export function useWorkspaceSessions(activeModelAlias: string | null) {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() => loadWorkspaceState());
  const [restoredSession] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("mosaicstacked.console.workspaces.v1") !== null;
  });

  const workspaceSaveHandleRef = useRef<number | null>(null);
  const latestWorkspaceStateRef = useRef(workspaceState);

  const flushWorkspaceState = useCallback(() => {
    if (workspaceSaveHandleRef.current !== null) {
      globalThis.clearTimeout(workspaceSaveHandleRef.current);
      workspaceSaveHandleRef.current = null;
    }

    saveWorkspaceState(latestWorkspaceStateRef.current);
  }, []);

  useEffect(() => {
    latestWorkspaceStateRef.current = workspaceState;

    if (workspaceSaveHandleRef.current !== null) {
      return;
    }

    workspaceSaveHandleRef.current = globalThis.setTimeout(() => {
      flushWorkspaceState();
    }, WORKSPACE_STATE_SAVE_INTERVAL_MS);
  }, [flushWorkspaceState, workspaceState]);

  useEffect(() => () => {
    flushWorkspaceState();
  }, [flushWorkspaceState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const handlePageHide = () => {
      flushWorkspaceState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushWorkspaceState();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushWorkspaceState]);

  const handleWorkspaceSessionCreate = useCallback((workspace: WorkspaceKind) => {
    const now = nowIso();

    setWorkspaceState((current) => {
      switch (workspace) {
        case "github":
          return appendSession(
            current,
            "github",
            createSession("github", createGitHubSessionMetadata(), {
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now,
            }),
          );
        case "matrix":
          return appendSession(
            current,
            "matrix",
            createSession("matrix", createMatrixSessionMetadata(), {
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now,
            }),
          );
        case "chat":
        default:
          return appendSession(
            current,
            "chat",
            createSession(
              "chat",
              {
                ...createChatSessionMetadata(),
                selectedModelAlias: activeModelAlias,
              },
              {
                createdAt: now,
                updatedAt: now,
                lastOpenedAt: now,
              },
            ),
          );
      }
    });
  }, [activeModelAlias]);

  const handleWorkspaceSessionSelect = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) => selectSession(current, workspace, sessionId));
  }, []);

  const selectActiveWorkspaceSession = useCallback((workspace: WorkspaceKind) => {
    setWorkspaceState((current) => {
      const activeSessionId = current.activeSessionIdByWorkspace[workspace];
      return selectSession(current, workspace, activeSessionId);
    });
  }, []);

  const handleWorkspaceSessionArchive = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) =>
      updateSession(current, workspace, sessionId, (session) => ({
        ...session,
        archived: true,
        resumable: false,
        updatedAt: nowIso(),
        lastOpenedAt: nowIso(),
      })),
    );
  }, []);

  const handleWorkspaceSessionDelete = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) => deleteSession(current, workspace, sessionId));
  }, []);

  const handleChatSessionChange = useCallback((session: ChatSession) => {
    setWorkspaceState((current) => updateSession(current, "chat", session.id, () => session));
  }, []);

  const handleGitHubSessionChange = useCallback((session: GitHubSession) => {
    setWorkspaceState((current) => updateSession(current, "github", session.id, () => session));
  }, []);

  const handleMatrixSessionChange = useCallback((session: MatrixSession) => {
    setWorkspaceState((current) => updateSession(current, "matrix", session.id, () => session));
  }, []);

  const chatSession = useMemo(() => (
    (workspaceState.sessionsByWorkspace.chat.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.chat)
      ?? workspaceState.sessionsByWorkspace.chat[0]) as ChatSession
  ), [workspaceState.activeSessionIdByWorkspace.chat, workspaceState.sessionsByWorkspace.chat]);

  const githubSession = useMemo(() => (
    (workspaceState.sessionsByWorkspace.github.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.github)
      ?? workspaceState.sessionsByWorkspace.github[0]) as GitHubSession
  ), [workspaceState.activeSessionIdByWorkspace.github, workspaceState.sessionsByWorkspace.github]);

  const matrixSession = useMemo(() => (
    (workspaceState.sessionsByWorkspace.matrix.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.matrix)
      ?? workspaceState.sessionsByWorkspace.matrix[0]) as MatrixSession
  ), [workspaceState.activeSessionIdByWorkspace.matrix, workspaceState.sessionsByWorkspace.matrix]);

  const getWorkspaceSessions = useCallback((workspace: WorkspaceKind): WorkspaceSession<unknown>[] => (
    workspaceState.sessionsByWorkspace[workspace] as WorkspaceSession<unknown>[]
  ), [workspaceState.sessionsByWorkspace]);

  return {
    workspaceState,
    setWorkspaceState,
    restoredSession,
    flushWorkspaceState,
    chatSession,
    githubSession,
    matrixSession,
    getWorkspaceSessions,
    handleWorkspaceSessionCreate,
    handleWorkspaceSessionSelect,
    selectActiveWorkspaceSession,
    handleWorkspaceSessionArchive,
    handleWorkspaceSessionDelete,
    handleChatSessionChange,
    handleGitHubSessionChange,
    handleMatrixSessionChange,
  };
}
