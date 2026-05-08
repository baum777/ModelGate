import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSession,
  createChatSessionMetadata,
  createDefaultWorkspaceState,
  createSession,
  deleteSession,
  deriveSessionStatus,
  deriveSessionTitle,
  loadWorkspaceState,
  saveWorkspaceState,
  selectSession,
  type WorkspaceState
} from "../src/lib/workspace-state.js";

function withWindow<T>(windowValue: Partial<Window>, fn: () => T) {
  const globalAny = globalThis as unknown as { window?: Window };
  const previousWindow = globalAny.window;
  try {
    globalAny.window = windowValue as Window;
    return fn();
  } finally {
    globalAny.window = previousWindow;
  }
}

test("workspace state creates a fail-closed default with one session per workspace", () => {
  const state = createDefaultWorkspaceState();

  assert.equal(state.version, 1);
  assert.equal(state.activeWorkspace, "chat");
  assert.equal(state.sessionsByWorkspace.chat.length, 1);
  assert.equal(state.sessionsByWorkspace.github.length, 1);
  assert.equal(state.sessionsByWorkspace.matrix.length, 1);
  assert.equal(state.activeSessionIdByWorkspace.chat, state.sessionsByWorkspace.chat[0]?.id);
});

test("session helpers keep selection, title, and status deterministic", () => {
  let state = createDefaultWorkspaceState();
  const nextSession = createSession("chat", {
    ...createChatSessionMetadata(),
    chatState: {
      ...createChatSessionMetadata().chatState,
      input: "Session draft"
    }
  });

  state = appendSession(state, "chat", nextSession);
  state = selectSession(state, "chat", nextSession.id);

  const activeSession = state.sessionsByWorkspace.chat.find((session) => session.id === nextSession.id);
  assert.ok(activeSession);
  assert.equal(deriveSessionTitle(activeSession), "Session draft");
  assert.equal(deriveSessionStatus(activeSession), "draft");

  state = deleteSession(state, "chat", nextSession.id);
  assert.equal(state.sessionsByWorkspace.chat.length, 1);
});

test("loadWorkspaceState fails closed when persisted data is malformed", () => {
  const storage = new Map<string, string>();

  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  } as Partial<Window>;

  storage.set("mosaicstacked.console.workspaces.v1", JSON.stringify({
    version: 1,
    activeWorkspace: "chat",
    activeSessionIdByWorkspace: {
      chat: "invalid",
      github: "invalid",
      matrix: "invalid"
    },
    sessionsByWorkspace: {
      chat: [{}],
      github: [{}],
      matrix: [{}]
    }
  }));

  const state = withWindow(fakeWindow, () => loadWorkspaceState());
  const normalized = state as WorkspaceState;

  assert.equal(normalized.activeWorkspace, "chat");
  assert.equal(normalized.sessionsByWorkspace.chat.length, 1);
  assert.equal(normalized.sessionsByWorkspace.github.length, 1);
  assert.equal(normalized.sessionsByWorkspace.matrix.length, 1);
});

test("loadWorkspaceState canonicalizes legacy Matrix fields", () => {
  const storage = new Map<string, string>();
  const baseState = createDefaultWorkspaceState();
  const matrixSession = baseState.sessionsByWorkspace.matrix[0];

  assert.ok(matrixSession);

  storage.set("mosaicstacked.console.workspaces.v1", JSON.stringify({
    ...baseState,
    activeWorkspace: "matrix",
    sessionsByWorkspace: {
      ...baseState.sessionsByWorkspace,
      matrix: [
        {
          ...matrixSession,
          metadata: {
            ...matrixSession.metadata,
            topicText: "New topic",
            analysisPrompt: "Legacy prompt",
            analysisResult: { snapshotId: "snapshot-legacy" },
            analysisError: "Legacy error",
            analysisLoading: true,
            selectedCandidateId: "candidate-legacy",
            promotedPlan: {
              planId: "legacy-plan",
              targetRoomId: "!room:matrix.example",
              payloadDelta: {
                before: { topic: "Old topic" },
                after: { topic: "New topic" }
              },
              riskLevel: "low_surface",
              snapshotId: "snapshot-legacy",
              scopeId: "scope-legacy"
            },
            promotionLoading: true,
            promotionError: "Legacy promote error"
          }
        }
      ]
    }
  }));

  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  } as Partial<Window>;

  const state = withWindow(fakeWindow, () => loadWorkspaceState());
  const metadata = state.sessionsByWorkspace.matrix[0]?.metadata as Record<string, unknown> | undefined;

  assert.ok(metadata);
  assert.equal(deriveSessionTitle(state.sessionsByWorkspace.matrix[0]!), "New topic");
  assert.equal(deriveSessionStatus(state.sessionsByWorkspace.matrix[0]!), "review_required");
  assert.equal((metadata.topicPlan as { planId?: string } | undefined)?.planId, "legacy-plan");
  assert.equal((metadata.topicPlan as { proposedValue?: string } | undefined)?.proposedValue, "New topic");
  assert.equal(metadata.promotedPlan, undefined);
  assert.equal(metadata.analysisPrompt, undefined);
  assert.equal(metadata.analysisResult, undefined);
  assert.equal(metadata.analysisError, undefined);
  assert.equal(metadata.analysisLoading, undefined);
  assert.equal(metadata.selectedCandidateId, undefined);
  assert.equal(metadata.promotionLoading, undefined);
  assert.equal(metadata.promotionError, undefined);
  assert.equal(state.sessionsByWorkspace.matrix[0]?.metadata.topicText, "New topic");
});

test("saveWorkspaceState strips legacy Matrix fields from persisted payload", () => {
  const storage = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  } as Partial<Window>;

  const state = createDefaultWorkspaceState();
  const matrixSession = state.sessionsByWorkspace.matrix[0];

  assert.ok(matrixSession);

  const legacyTopicPlan = {
    planId: "plan_topic_save",
    roomId: "!room:matrix.example",
    scopeId: "scope-save",
    snapshotId: "snapshot-save",
    status: "pending_review" as const,
    actions: [
      {
        type: "set_room_topic" as const,
        roomId: "!room:matrix.example",
        currentValue: "Old topic",
        proposedValue: "New topic"
      }
    ],
    currentValue: "Old topic",
    proposedValue: "New topic",
    risk: "low" as const,
    requiresApproval: true as const,
    createdAt: "2026-04-16T08:00:00.000Z",
    expiresAt: "2026-04-16T09:00:00.000Z"
  };

  (matrixSession as typeof matrixSession & { metadata: Record<string, unknown> }).metadata = {
    ...matrixSession.metadata,
    topicPlan: legacyTopicPlan,
    topicText: "New topic",
    analysisPrompt: "Legacy prompt",
    analysisResult: { snapshotId: "snapshot-legacy" },
    analysisError: "Legacy error",
    analysisLoading: true,
    selectedCandidateId: "candidate-legacy",
    promotedPlan: {
      planId: "legacy-plan",
      targetRoomId: "!room:matrix.example",
      summary: "Legacy summary",
      rationale: "Legacy rationale",
      requiredApproval: true,
      stale: false,
      payloadDelta: {
        before: { topic: "Old topic" },
        after: { topic: "New topic" }
      },
      impactSummary: [],
      riskLevel: "low_surface",
      expectedPermissions: [],
      authorizationRequirements: [],
      preflightStatus: "unknown",
      snapshotId: "snapshot-legacy",
      scopeId: "scope-legacy"
    },
    promotionLoading: true,
    promotionError: "Legacy promote error"
  };

  withWindow(fakeWindow, () => saveWorkspaceState(state));

  const persisted = JSON.parse(storage.get("mosaicstacked.console.workspaces.v1") ?? "{}") as {
    sessionsByWorkspace?: {
      matrix?: Array<{
        metadata?: Record<string, unknown>;
      }>;
    };
  };

  const persistedMetadata = persisted.sessionsByWorkspace?.matrix?.[0]?.metadata;

  assert.ok(persistedMetadata);
  assert.equal((persistedMetadata.topicPlan as { planId?: string } | undefined)?.planId, "plan_topic_save");
  assert.equal(persistedMetadata.promotedPlan, undefined);
  assert.equal(persistedMetadata.analysisPrompt, undefined);
  assert.equal(persistedMetadata.analysisResult, undefined);
  assert.equal(persistedMetadata.analysisError, undefined);
  assert.equal(persistedMetadata.analysisLoading, undefined);
  assert.equal(persistedMetadata.selectedCandidateId, undefined);
  assert.equal(persistedMetadata.promotionLoading, undefined);
  assert.equal(persistedMetadata.promotionError, undefined);
});

test("chat session defaults to governed mode and legacy sessions normalize safely", () => {
  const state = createDefaultWorkspaceState();
  const chatSession = state.sessionsByWorkspace.chat[0];

  assert.ok(chatSession);
  assert.equal(chatSession.metadata.executionMode, "governed");

  const storage = new Map<string, string>();
  storage.set("mosaicstacked.console.workspaces.v1", JSON.stringify({
    ...state,
    sessionsByWorkspace: {
      ...state.sessionsByWorkspace,
      chat: [
        {
          ...chatSession,
          metadata: {
            ...chatSession?.metadata,
            executionMode: undefined
          }
        }
      ]
    }
  }));

  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  } as Partial<Window>;

  const loaded = withWindow(fakeWindow, () => loadWorkspaceState());
  assert.equal(loaded.sessionsByWorkspace.chat[0]?.metadata.executionMode, "direct");
});

test("chat execution mode persists in workspace state", () => {
  const storage = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  } as Partial<Window>;

  const state = createDefaultWorkspaceState();
  const chatSession = state.sessionsByWorkspace.chat[0];
  assert.ok(chatSession);

  chatSession.metadata.executionMode = "governed";
  withWindow(fakeWindow, () => saveWorkspaceState(state));

  const loaded = withWindow(fakeWindow, () => loadWorkspaceState());
  assert.equal(loaded.sessionsByWorkspace.chat[0]?.metadata.executionMode, "governed");
});

test("in-progress chat streams normalize to interrupted state after reload with partial draft preserved", () => {
  const base = createDefaultWorkspaceState();
  const chatSession = base.sessionsByWorkspace.chat[0];
  assert.ok(chatSession);

  const storage = new Map<string, string>();
  storage.set("mosaicstacked.console.workspaces.v1", JSON.stringify({
    ...base,
    sessionsByWorkspace: {
      ...base.sessionsByWorkspace,
      chat: [
        {
          ...chatSession,
          metadata: {
            ...chatSession.metadata,
            chatState: {
              ...chatSession.metadata.chatState,
              connectionState: "streaming",
              currentAssistantDraft: {
                text: "Partial stream",
                model: "default",
                started: true
              }
            }
          }
        }
      ]
    }
  }));

  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  } as Partial<Window>;

  const loaded = withWindow(fakeWindow, () => loadWorkspaceState());
  const restored = loaded.sessionsByWorkspace.chat[0]?.metadata.chatState;
  assert.ok(restored);
  assert.equal(restored?.connectionState, "error");
  assert.equal(restored?.currentAssistantDraft?.text, "Partial stream");
  assert.equal(restored?.currentAssistantDraft?.started, false);
  assert.equal(restored?.streamState.interrupted, true);
  assert.equal(restored?.lastStreamWarning, "A chat stream was interrupted before completion and was not resumed.");
  assert.equal(restored?.pendingProposal, null);
  assert.equal(restored?.notices.at(-1)?.level, "system");
});
