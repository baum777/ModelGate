import assert from "node:assert/strict";
import test from "node:test";
import {
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
