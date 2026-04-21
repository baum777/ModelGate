import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatrixReviewItems,
} from "../src/components/MatrixWorkspace.js";
import type { MatrixRoomTopicAgentPlan } from "../src/lib/matrix-api.js";

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

  const pendingItems = buildMatrixReviewItems(plan);
  const executedItems = buildMatrixReviewItems({ ...plan, status: "executed" });

  assert.equal(pendingItems[0]?.status, "pending_review");
  assert.equal(executedItems[0]?.status, "executed");
  assert.equal(pendingItems[0]?.sourceLabel, "Matrix Workspace");
  assert.match(pendingItems[0]?.summary ?? "", /Aktuell:/);
  assert.match(pendingItems[0]?.title ?? "", /Raumtopic/);
  assert.deepEqual(pendingItems[0]?.provenanceRows?.[0], {
    label: "Raum",
    value: "!room:matrix.example",
  });
});
