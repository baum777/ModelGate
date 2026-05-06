import assert from "node:assert/strict";
import test from "node:test";
import { canApproveTopicUpdateExecution } from "../src/lib/matrix-gates.js";

const pendingReviewTopicPlan = {
  planId: "plan-topic-1",
  roomId: "!room:matrix.example",
  scopeId: null,
  snapshotId: null,
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
  createdAt: "2026-04-16T10:00:00.000Z",
  expiresAt: "2026-04-16T10:10:00.000Z"
};

test("matrix topic-update gate stays closed unless approval, freshness, and a pending review plan are present", () => {
  assert.equal(
    canApproveTopicUpdateExecution({
      approvalPending: false,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      topicPlan: null,
      stalePlanDetected: false
    }),
    false
  );

  assert.equal(
    canApproveTopicUpdateExecution({
      approvalPending: true,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      topicPlan: pendingReviewTopicPlan,
      stalePlanDetected: false
    }),
    true
  );

  assert.equal(
    canApproveTopicUpdateExecution({
      approvalPending: true,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      topicPlan: {
        ...pendingReviewTopicPlan,
        status: "executed"
      },
      stalePlanDetected: false
    }),
    false
  );

  assert.equal(
    canApproveTopicUpdateExecution({
      approvalPending: true,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      topicPlan: pendingReviewTopicPlan,
      stalePlanDetected: true
    }),
    false
  );
});
