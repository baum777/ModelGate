import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMatrixEvidenceSmokeResult,
  runMatrixEvidenceSmoke
} from "../../scripts/matrix-evidence-smoke.mjs";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("matrix evidence smoke skips unless a dedicated evidence room is configured", async () => {
  let fetchCalls = 0;

  const result = await runMatrixEvidenceSmoke({
    env: {},
    loadRootEnvFile: false,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called for skipped evidence smoke");
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "skipped");
  assert.deepEqual(result.missing, [
    "MATRIX_ENABLED=true",
    "MATRIX_BASE_URL or MATRIX_HOMESERVER_URL",
    "MATRIX_ACCESS_TOKEN",
    "MATRIX_SMOKE_ROOM_ID or MATRIX_ROOM_ID",
    "MATRIX_EVIDENCE_WRITES_ENABLED=true",
    "MATRIX_EVIDENCE_ROOM_ID or MATRIX_EVIDENCE_*_ROOM_ID"
  ]);
  assert.equal(fetchCalls, 0);
});

test("matrix evidence smoke requires evidence receipts and does not expose tokens", async () => {
  const secretToken = "sk-evidence-secret-token";
  const expectedRoomId = "!topic-smoke:matrix.example";
  const evidenceRoomId = "!evidence:matrix.example";
  const previousTopic = "Original topic";
  const temporaryTopic = "Evidence smoke 2026-04-30T10-11-12-000Z beef";
  let analyzeCount = 0;

  const result = await runMatrixEvidenceSmoke({
    env: {
      MATRIX_ENABLED: "true",
      MATRIX_BASE_URL: "https://matrix.example",
      MATRIX_ACCESS_TOKEN: secretToken,
      MATRIX_SMOKE_ROOM_ID: expectedRoomId,
      MATRIX_EVIDENCE_WRITES_ENABLED: "true",
      MATRIX_EVIDENCE_ROOM_ID: evidenceRoomId,
      MATRIX_SMOKE_TOPIC_PREFIX: "Evidence smoke",
      HOST: "127.0.0.1",
      PORT: "8787"
    },
    loadRootEnvFile: false,
    now: () => new Date("2026-04-30T10:11:12.000Z"),
    randomSuffix: () => "beef",
    fetchImpl: async (input, init) => {
      const requestUrl = typeof input === "string" ? new URL(input) : new URL(input.url);
      const method = String(init?.method ?? "GET");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;

      if (requestUrl.pathname === "/api/matrix/whoami" && method === "GET") {
        return createJsonResponse({
          ok: true,
          userId: "@user:matrix.example",
          deviceId: "DEVICE",
          homeserver: "https://matrix.example"
        });
      }

      if (requestUrl.pathname === "/api/matrix/joined-rooms" && method === "GET") {
        return createJsonResponse({
          ok: true,
          rooms: [
            { roomId: expectedRoomId, name: "Topic smoke", canonicalAlias: null, roomType: "room" },
            { roomId: evidenceRoomId, name: "Evidence", canonicalAlias: null, roomType: "room" }
          ]
        });
      }

      if (requestUrl.pathname === `/api/matrix/rooms/${encodeURIComponent(expectedRoomId)}/topic-access` && method === "GET") {
        return createJsonResponse({
          ok: true,
          access: {
            roomId: expectedRoomId,
            userId: "@user:matrix.example",
            roomStatus: "joined",
            joined: true,
            currentPowerLevel: 100,
            requiredPowerLevel: 50,
            canUpdateTopic: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/analyze" && method === "POST") {
        analyzeCount += 1;
        const restoring = analyzeCount === 2;
        return createJsonResponse({
          ok: true,
          plan: {
            planId: restoring ? "plan-restore" : "plan-forward",
            type: "update_room_topic",
            roomId: expectedRoomId,
            status: "pending_review",
            createdAt: "2026-04-30T10:11:12.000Z",
            expiresAt: "2026-04-30T10:21:12.000Z",
            diff: {
              field: "topic",
              before: restoring ? temporaryTopic : previousTopic,
              after: body?.proposedValue
            },
            requiresApproval: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-forward" && method === "GET") {
        return createJsonResponse({
          ok: true,
          plan: {
            planId: "plan-forward",
            type: "update_room_topic",
            roomId: expectedRoomId,
            status: "pending_review",
            createdAt: "2026-04-30T10:11:12.000Z",
            expiresAt: "2026-04-30T10:21:12.000Z",
            diff: { field: "topic", before: previousTopic, after: temporaryTopic },
            requiresApproval: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore" && method === "GET") {
        return createJsonResponse({
          ok: true,
          plan: {
            planId: "plan-restore",
            type: "update_room_topic",
            roomId: expectedRoomId,
            status: "pending_review",
            createdAt: "2026-04-30T10:11:13.000Z",
            expiresAt: "2026-04-30T10:21:13.000Z",
            diff: { field: "topic", before: temporaryTopic, after: previousTopic },
            requiresApproval: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-forward/execute" && method === "POST") {
        return createJsonResponse({
          ok: true,
          result: {
            planId: "plan-forward",
            status: "executed",
            executedAt: "2026-04-30T10:11:12.000Z",
            transactionId: "txn-forward",
            evidence: [
              { eventType: "matrix_approval_record", transactionId: "$approval" },
              { eventType: "matrix_topic_change_record", transactionId: "$topic" }
            ]
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore/execute" && method === "POST") {
        return createJsonResponse({
          ok: true,
          result: {
            planId: "plan-restore",
            status: "executed",
            executedAt: "2026-04-30T10:11:13.000Z",
            transactionId: "txn-restore",
            evidence: [
              { eventType: "matrix_approval_record", transactionId: "$approval-restore" },
              { eventType: "matrix_topic_change_record", transactionId: "$topic-restore" }
            ]
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-forward/verify" && method === "GET") {
        return createJsonResponse({
          ok: true,
          verification: {
            planId: "plan-forward",
            status: "verified",
            checkedAt: "2026-04-30T10:11:12.000Z",
            expected: temporaryTopic,
            actual: temporaryTopic,
            evidence: [
              { eventType: "matrix_verification_result", transactionId: "$verify" }
            ]
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore/verify" && method === "GET") {
        return createJsonResponse({
          ok: true,
          verification: {
            planId: "plan-restore",
            status: "verified",
            checkedAt: "2026-04-30T10:11:13.000Z",
            expected: previousTopic,
            actual: previousTopic,
            evidence: [
              { eventType: "matrix_verification_result", transactionId: "$verify-restore" }
            ]
          }
        });
      }

      throw new Error(`Unexpected request ${method} ${requestUrl.pathname}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.equal(result.evidenceRoomId, evidenceRoomId);
  assert.equal(result.forward.evidence.execute.length, 2);
  assert.equal(result.forward.evidence.verify.length, 1);
  assert.doesNotMatch(formatMatrixEvidenceSmokeResult(result), new RegExp(secretToken));
});
