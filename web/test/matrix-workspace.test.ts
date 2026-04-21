import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatrixReviewItems,
} from "../src/components/MatrixWorkspace.js";
import type {
  MatrixRoomTopicAgentPlan,
  MatrixRoomTopicExecutionResult,
  MatrixRoomTopicVerificationResult,
} from "../src/lib/matrix-api.js";

test("Matrix workspace review items map topic plans into the shared review language", () => {
  const plan = {
    planId: "topic-plan-1",
    roomId: "!room:matrix.example",
    scopeId: "scope-1",
    snapshotId: "snapshot-1",
    status: "pending_review",
    actions: [
      {
        type: "set_room_topic",
        roomId: "!room:matrix.example",
        currentValue: "Old topic",
        proposedValue: "New topic",
      },
    ],
    currentValue: "Old topic",
    proposedValue: "New topic",
    risk: "medium",
    requiresApproval: true,
    createdAt: "2026-04-21T08:00:00.000Z",
    expiresAt: "2026-04-21T09:00:00.000Z",
  } as MatrixRoomTopicAgentPlan;

  const execution = {
    planId: "topic-plan-1",
    status: "executed",
    executedAt: "2026-04-21T08:05:00.000Z",
    transactionId: "txn-1",
  } as MatrixRoomTopicExecutionResult;
  const verified = {
    planId: "topic-plan-1",
    status: "verified",
    checkedAt: "2026-04-21T08:06:00.000Z",
    expected: "New topic",
    actual: "New topic",
  } as MatrixRoomTopicVerificationResult;
  const mismatch = {
    ...verified,
    status: "mismatch",
  } as MatrixRoomTopicVerificationResult;

  const pendingItems = buildMatrixReviewItems(plan, null, null, "@alice:matrix.example");
  const pendingItemsEn = buildMatrixReviewItems(plan, null, null, "@alice:matrix.example", "en");
  const approvedItems = buildMatrixReviewItems(plan, execution, null, "@alice:matrix.example");
  const executedItems = buildMatrixReviewItems(plan, execution, verified, "@alice:matrix.example");
  const rejectedItems = buildMatrixReviewItems(plan, execution, mismatch, "@alice:matrix.example");

  assert.equal(pendingItems[0]?.status, "pending_review");
  assert.equal(approvedItems[0]?.status, "approved");
  assert.equal(executedItems[0]?.status, "executed");
  assert.equal(rejectedItems[0]?.status, "rejected");
  assert.equal(pendingItems[0]?.sourceLabel, "Matrix-Workspace");
  assert.match(pendingItems[0]?.summary ?? "", /Aktuell:/);
  assert.match(pendingItems[0]?.title ?? "", /Raumtopic/);
  assert.match(pendingItemsEn[0]?.summary ?? "", /Current:/);
  assert.match(pendingItemsEn[0]?.title ?? "", /Room topic/);
  assert.deepEqual(pendingItems[0]?.provenanceRows?.[0], {
    label: "Acting identity",
    value: "@alice:matrix.example",
  });
});
