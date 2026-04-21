import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveShellHealthState,
  summarizePendingApprovals,
} from "../src/lib/shell-view-model.js";

test("deriveShellHealthState fails closed when backend is unreachable", () => {
  const state = deriveShellHealthState(false);
  assert.equal(state.tone, "error");
  assert.equal(state.label, "Nicht verfügbar");
  assert.match(state.detail, /fail-closed/i);
});

test("summarizePendingApprovals counts pending and stale items deterministically", () => {
  const summary = summarizePendingApprovals([
    {
      id: "a",
      source: "github",
      title: "A",
      summary: "A",
      status: "pending_review",
    },
    {
      id: "b",
      source: "matrix",
      title: "B",
      summary: "B",
      status: "stale",
    },
    {
      id: "c",
      source: "matrix",
      title: "C",
      summary: "C",
      status: "executed",
    },
  ]);

  assert.deepEqual(summary, {
    pending: 1,
    stale: 1,
    hasApprovals: true,
  });
});
