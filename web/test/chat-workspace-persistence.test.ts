import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveInitialChatModelAlias,
  resolveChatSessionSyncInterval,
  shouldFlushChatSessionSyncImmediately,
} from "../src/components/ChatWorkspace.js";

test("chat session sync interval throttles streaming state to 1000ms", () => {
  assert.equal(resolveChatSessionSyncInterval("submitting"), 1000);
  assert.equal(resolveChatSessionSyncInterval("streaming"), 1000);
  assert.equal(resolveChatSessionSyncInterval("idle"), 220);
  assert.equal(resolveChatSessionSyncInterval("completed"), 220);
  assert.equal(resolveChatSessionSyncInterval("error"), 220);
});

test("chat session sync flushes immediately only on terminal stream states", () => {
  assert.equal(shouldFlushChatSessionSyncImmediately("completed"), true);
  assert.equal(shouldFlushChatSessionSyncImmediately("error"), true);
  assert.equal(shouldFlushChatSessionSyncImmediately("idle"), false);
  assert.equal(shouldFlushChatSessionSyncImmediately("submitting"), false);
  assert.equal(shouldFlushChatSessionSyncImmediately("streaming"), false);
});

test("new chat sessions default to default-free when no session alias exists", () => {
  const selected = resolveInitialChatModelAlias({
    sessionSelectedModelAlias: null,
    activeModelAlias: null,
    availableModels: ["default", "default-free"],
    modelRegistry: [{ alias: "default" }, { alias: "default-free" }],
  });

  assert.equal(selected, "default-free");
});

test("existing chat session selection stays authoritative over shell aliases", () => {
  const selected = resolveInitialChatModelAlias({
    sessionSelectedModelAlias: "openrouter-1",
    activeModelAlias: "default-free",
    availableModels: ["default", "default-free", "openrouter-1"],
    modelRegistry: [{ alias: "default" }, { alias: "default-free" }, { alias: "openrouter-1" }],
  });

  assert.equal(selected, "openrouter-1");
});
