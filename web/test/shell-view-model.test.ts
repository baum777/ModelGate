import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveShellHealthState,
  deriveMobileApprovalBar,
  deriveMobileStatusStrip,
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

test("deriveMobileStatusStrip keeps chat model display to safe public aliases", () => {
  const safe = deriveMobileStatusStrip({
    mode: "chat",
    tone: "ready",
    backendLabel: "Ready",
    workspaceLabel: "Chat",
    activeModelAlias: "default",
    approvalCount: 0,
    staleCount: 0,
    labels: {
      backendPrefix: "Backend",
      backendOwned: "backend-owned",
      approvalNeeded: "approval needed",
      blocked: "blocked",
      publicAliasFallback: "public alias",
    },
  });

  assert.deepEqual(safe, {
    tone: "ready",
    text: "Backend Ready · default",
    badge: null,
  });

  const unsafe = deriveMobileStatusStrip({
    mode: "chat",
    tone: "ready",
    backendLabel: "Ready",
    workspaceLabel: "Chat",
    activeModelAlias: "openrouter/auto",
    approvalCount: 0,
    staleCount: 0,
    labels: {
      backendPrefix: "Backend",
      backendOwned: "backend-owned",
      approvalNeeded: "approval needed",
      blocked: "blocked",
      publicAliasFallback: "public alias",
    },
  });

  assert.deepEqual(unsafe, {
    tone: "ready",
    text: "Backend Ready · public alias",
    badge: null,
  });
});

test("deriveMobileStatusStrip promotes pending and stale approvals into persistent badge state", () => {
  assert.deepEqual(
    deriveMobileStatusStrip({
      mode: "github",
      tone: "ready",
      backendLabel: "Ready",
      workspaceLabel: "GitHub",
      activeModelAlias: null,
      approvalCount: 2,
      staleCount: 0,
      labels: {
        backendPrefix: "Backend",
        backendOwned: "backend-owned",
        approvalNeeded: "approval needed",
        blocked: "blocked",
        publicAliasFallback: "public alias",
      },
    }),
    {
      tone: "partial",
      text: "GitHub · backend-owned",
      badge: "approval needed",
    },
  );

  assert.deepEqual(
    deriveMobileStatusStrip({
      mode: "review",
      tone: "partial",
      backendLabel: "Ready",
      workspaceLabel: "Review",
      activeModelAlias: null,
      approvalCount: 1,
      staleCount: 1,
      labels: {
        backendPrefix: "Backend",
        backendOwned: "backend-owned",
        approvalNeeded: "approval needed",
        blocked: "blocked",
        publicAliasFallback: "public alias",
      },
    }),
    {
      tone: "error",
      text: "Review · 2 approval needed",
      badge: "blocked",
    },
  );
});

test("deriveMobileApprovalBar returns null when there is no approval pressure", () => {
  assert.equal(
    deriveMobileApprovalBar({
      pending: 0,
      stale: 0,
      labels: {
        title: "Approval required",
        actionLabel: "Review",
        pendingSummary: (pending, stale) => `${pending} pending, ${stale} stale`,
        staleSummary: (pending, stale) => `${pending} pending, ${stale} stale`,
      },
    }),
    null,
  );

  assert.deepEqual(
    deriveMobileApprovalBar({
      pending: 2,
      stale: 0,
      labels: {
        title: "Approval required",
        actionLabel: "Review",
        pendingSummary: (pending, stale) => `${pending} pending, ${stale} stale`,
        staleSummary: (pending, stale) => `${pending} pending, ${stale} stale`,
      },
    }),
    {
      tone: "partial",
      title: "Approval required",
      detail: "2 pending, 0 stale",
      actionLabel: "Review",
    },
  );
});
