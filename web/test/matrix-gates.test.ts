import assert from "node:assert/strict";
import test from "node:test";
import { canApproveExecution, canProceedToAnalyze } from "../src/lib/matrix-gates.js";

test("matrix explore gate stays closed until a non-empty scope is selected", () => {
  assert.equal(canProceedToAnalyze([], []), false);
  assert.equal(canProceedToAnalyze(["   "], [""]), false);
  assert.equal(canProceedToAnalyze(["room-1"], []), true);
  assert.equal(canProceedToAnalyze([], ["space-1"]), true);
});

test("matrix review gate stays closed unless approval and freshness are present", () => {
  assert.equal(
    canApproveExecution({
      approvalPending: false,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      promotedPlan: null,
      stalePlanDetected: false
    }),
    false
  );

  assert.equal(
    canApproveExecution({
      approvalPending: true,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      promotedPlan: {
        planId: "plan-1",
        type: "set_room_name",
        targetRoomId: "room-1",
        summary: "summary",
        rationale: "rationale",
        requiredApproval: true,
        stale: false,
        payloadDelta: { before: {}, after: {} },
        impactSummary: [],
        riskLevel: "low_surface",
        expectedPermissions: [],
        authorizationRequirements: [],
        preflightStatus: "passed",
        snapshotId: "snap-1",
        scopeId: "scope-1"
      },
      stalePlanDetected: false
    }),
    true
  );

  assert.equal(
    canApproveExecution({
      approvalPending: true,
      executionLoading: false,
      executionResult: null,
      planRefreshError: null,
      planRefreshLoading: false,
      promotedPlan: {
        planId: "plan-1",
        type: "set_room_name",
        targetRoomId: "room-1",
        summary: "summary",
        rationale: "rationale",
        requiredApproval: true,
        stale: true,
        payloadDelta: { before: {}, after: {} },
        impactSummary: [],
        riskLevel: "low_surface",
        expectedPermissions: [],
        authorizationRequirements: [],
        preflightStatus: "passed",
        snapshotId: "snap-1",
        scopeId: "scope-1"
      },
      stalePlanDetected: false
    }),
    false
  );
});

