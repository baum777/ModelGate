import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSession,
  createChatSessionMetadata,
  createSession,
  createDefaultWorkspaceState,
  deleteSession,
  deriveSessionStatus,
  deriveSessionTitle,
  loadWorkspaceState,
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

  storage.set("modelgate.console.workspaces.v1", JSON.stringify({
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
