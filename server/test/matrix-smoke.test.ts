import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMatrixSmokeResult,
  runMatrixSmoke
} from "../../scripts/matrix-smoke.mjs";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("matrix smoke skips cleanly when required env vars are missing", async () => {
  let fetchCalls = 0;

  const result = await runMatrixSmoke({
    env: {},
    loadRootEnvFile: false,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called for a skip");
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "skipped");
  assert.deepEqual(result.missing, [
    "MATRIX_ENABLED=true",
    "MATRIX_BASE_URL or MATRIX_HOMESERVER_URL",
    "MATRIX_ACCESS_TOKEN",
    "MATRIX_SMOKE_ROOM_ID or MATRIX_ROOM_ID"
  ]);
  assert.equal(fetchCalls, 0);
});

test("matrix smoke calls the backend routes in order and redacts token values", async () => {
  const secretToken = "sk-test-secret-token";
  const requests: Array<{
    method: string;
    path: string;
    authorization: string | null;
    body: unknown;
  }> = [];
  const expectedRoomId = "!smoke:matrix.example";
  const expectedPreviousTopic = "Previous dedicated topic";
  let temporaryTopic: string | null = null;
  let analyzeCount = 0;

  const result = await runMatrixSmoke({
    env: {
      MATRIX_ENABLED: "true",
      MATRIX_BASE_URL: "https://matrix.example",
      MATRIX_ACCESS_TOKEN: secretToken,
      MATRIX_SMOKE_ROOM_ID: expectedRoomId,
      MATRIX_SMOKE_TOPIC_PREFIX: "MosaicStack smoke",
      HOST: "127.0.0.1",
      PORT: "8787"
    },
    loadRootEnvFile: false,
    now: () => new Date("2026-04-15T10:11:12.000Z"),
    randomSuffix: () => "abc123",
    fetchImpl: async (input, init) => {
      const requestUrl = typeof input === "string" ? new URL(input) : new URL(input.url);
      const headers = new Headers(init?.headers);
      const method = String(init?.method ?? "GET");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;

      requests.push({
        method,
        path: requestUrl.pathname,
        authorization: headers.get("authorization"),
        body
      });

      if (requestUrl.pathname === "/api/matrix/analyze" && method === "POST") {
        analyzeCount += 1;
        temporaryTopic = typeof body?.proposedValue === "string" ? body.proposedValue : null;

        if (analyzeCount === 1) {
          return createJsonResponse({
            ok: true,
            plan: {
              planId: "plan-forward",
              type: "update_room_topic",
              roomId: expectedRoomId,
              status: "pending_review",
              createdAt: "2026-04-15T10:11:12.000Z",
              expiresAt: "2026-04-15T10:21:12.000Z",
              diff: {
                field: "topic",
                before: expectedPreviousTopic,
                after: temporaryTopic
              },
              requiresApproval: true
            }
          });
        }

        return createJsonResponse({
          ok: true,
          plan: {
            planId: "plan-restore",
            type: "update_room_topic",
            roomId: expectedRoomId,
            status: "pending_review",
            createdAt: "2026-04-15T10:11:13.000Z",
            expiresAt: "2026-04-15T10:21:13.000Z",
            diff: {
              field: "topic",
              before: temporaryTopic,
              after: expectedPreviousTopic
            },
            requiresApproval: true
          }
        });
      }

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
            {
              roomId: expectedRoomId,
              name: "Smoke room",
              canonicalAlias: "#smoke:matrix.example",
              roomType: "room"
            }
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

      if (requestUrl.pathname === "/api/matrix/actions/plan-forward" && method === "GET") {
        return createJsonResponse({
          ok: true,
          plan: {
            planId: "plan-forward",
            type: "update_room_topic",
            roomId: expectedRoomId,
            status: "pending_review",
            createdAt: "2026-04-15T10:11:12.000Z",
            expiresAt: "2026-04-15T10:21:12.000Z",
            diff: {
              field: "topic",
              before: expectedPreviousTopic,
              after: temporaryTopic
            },
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
            executedAt: "2026-04-15T10:11:12.000Z",
            transactionId: "txn-forward"
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-forward/verify" && method === "GET") {
        return createJsonResponse({
          ok: true,
          verification: {
            planId: "plan-forward",
            status: "verified",
            checkedAt: "2026-04-15T10:11:12.000Z",
            expected: temporaryTopic,
            actual: temporaryTopic
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
            createdAt: "2026-04-15T10:11:13.000Z",
            expiresAt: "2026-04-15T10:21:13.000Z",
            diff: {
              field: "topic",
              before: temporaryTopic,
              after: expectedPreviousTopic
            },
            requiresApproval: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore/execute" && method === "POST") {
        return createJsonResponse({
          ok: true,
          result: {
            planId: "plan-restore",
            status: "executed",
            executedAt: "2026-04-15T10:11:13.000Z",
            transactionId: "txn-restore"
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore/verify" && method === "GET") {
        return createJsonResponse({
          ok: true,
          verification: {
            planId: "plan-restore",
            status: "verified",
            checkedAt: "2026-04-15T10:11:13.000Z",
            expected: expectedPreviousTopic,
            actual: expectedPreviousTopic
          }
        });
      }

      throw new Error(`Unexpected request ${method} ${requestUrl.pathname}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.equal(result.roomId, expectedRoomId);
  assert.equal(result.temporaryTopic, "MosaicStack smoke 2026-04-15T10-11-12-000Z abc123");
  assert.equal(result.restorationTopic, expectedPreviousTopic);
  assert.equal(result.forward.verification.status, "verified");
  assert.equal(result.cleanup.verification.status, "verified");
  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.path}`),
    [
      "GET /api/matrix/whoami",
      "GET /api/matrix/joined-rooms",
      `GET /api/matrix/rooms/${encodeURIComponent(expectedRoomId)}/topic-access`,
      "POST /api/matrix/analyze",
      "GET /api/matrix/actions/plan-forward",
      "POST /api/matrix/actions/plan-forward/execute",
      "GET /api/matrix/actions/plan-forward/verify",
      "GET /api/matrix/whoami",
      "GET /api/matrix/joined-rooms",
      `GET /api/matrix/rooms/${encodeURIComponent(expectedRoomId)}/topic-access`,
      "POST /api/matrix/analyze",
      "GET /api/matrix/actions/plan-restore",
      "POST /api/matrix/actions/plan-restore/execute",
      "GET /api/matrix/actions/plan-restore/verify"
    ]
  );
  assert.ok(requests.every((request) => request.authorization === null));
  assert.doesNotMatch(formatMatrixSmokeResult(result), new RegExp(secretToken));
});

test("matrix smoke restores topics from agent plan currentValue", async () => {
  const expectedRoomId = "!agent-smoke:matrix.example";
  const originalTopic = "Original agent topic";
  const temporaryTopic = "Agent smoke 2026-04-15T12-11-12-000Z cafe";
  let analyzeCount = 0;

  const result = await runMatrixSmoke({
    env: {
      MATRIX_ENABLED: "true",
      MATRIX_BASE_URL: "https://matrix.example",
      MATRIX_ACCESS_TOKEN: "sk-agent-secret",
      MATRIX_SMOKE_ROOM_ID: expectedRoomId,
      MATRIX_SMOKE_TOPIC_PREFIX: "Agent smoke",
      HOST: "127.0.0.1",
      PORT: "8787"
    },
    loadRootEnvFile: false,
    now: () => new Date("2026-04-15T12:11:12.000Z"),
    randomSuffix: () => "cafe",
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
            {
              roomId: expectedRoomId,
              name: "Agent smoke room",
              canonicalAlias: "#agent-smoke:matrix.example",
              roomType: "room"
            }
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
        const isRestore = analyzeCount === 2;
        const planId = isRestore ? "plan-agent-restore" : "plan-agent-forward";
        const currentValue = isRestore ? temporaryTopic : originalTopic;

        return createJsonResponse({
          ok: true,
          plan: {
            planId,
            roomId: expectedRoomId,
            scopeId: null,
            snapshotId: null,
            status: "pending_review",
            actions: [
              {
                type: "set_room_topic",
                roomId: expectedRoomId,
                currentValue,
                proposedValue: body?.proposedValue
              }
            ],
            currentValue,
            proposedValue: body?.proposedValue,
            risk: "low",
            requiresApproval: true,
            createdAt: "2026-04-15T12:11:12.000Z",
            expiresAt: "2026-04-15T12:21:12.000Z"
          }
        });
      }

      if ((requestUrl.pathname === "/api/matrix/actions/plan-agent-forward" || requestUrl.pathname === "/api/matrix/actions/plan-agent-restore") && method === "GET") {
        const isRestore = requestUrl.pathname.includes("restore");
        const planId = isRestore ? "plan-agent-restore" : "plan-agent-forward";
        const currentValue = isRestore ? temporaryTopic : originalTopic;
        const proposedValue = isRestore ? originalTopic : temporaryTopic;

        return createJsonResponse({
          ok: true,
          plan: {
            planId,
            roomId: expectedRoomId,
            scopeId: null,
            snapshotId: null,
            status: "pending_review",
            actions: [
              {
                type: "set_room_topic",
                roomId: expectedRoomId,
                currentValue,
                proposedValue
              }
            ],
            currentValue,
            proposedValue,
            risk: "low",
            requiresApproval: true,
            createdAt: "2026-04-15T12:11:12.000Z",
            expiresAt: "2026-04-15T12:21:12.000Z"
          }
        });
      }

      if ((requestUrl.pathname === "/api/matrix/actions/plan-agent-forward/execute" || requestUrl.pathname === "/api/matrix/actions/plan-agent-restore/execute") && method === "POST") {
        return createJsonResponse({
          ok: true,
          result: {
            planId: requestUrl.pathname.includes("restore") ? "plan-agent-restore" : "plan-agent-forward",
            status: "executed",
            executedAt: "2026-04-15T12:11:12.000Z",
            transactionId: requestUrl.pathname.includes("restore") ? "txn-agent-restore" : "txn-agent-forward"
          }
        });
      }

      if ((requestUrl.pathname === "/api/matrix/actions/plan-agent-forward/verify" || requestUrl.pathname === "/api/matrix/actions/plan-agent-restore/verify") && method === "GET") {
        const isRestore = requestUrl.pathname.includes("restore");

        return createJsonResponse({
          ok: true,
          verification: {
            planId: isRestore ? "plan-agent-restore" : "plan-agent-forward",
            status: "verified",
            checkedAt: "2026-04-15T12:11:12.000Z",
            expected: isRestore ? originalTopic : temporaryTopic,
            actual: isRestore ? originalTopic : temporaryTopic
          }
        });
      }

      throw new Error(`Unexpected request ${method} ${requestUrl.pathname}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.equal(result.restorationTopic, originalTopic);
  assert.equal(result.forward.beforeTopic, originalTopic);
  assert.equal(result.cleanup.beforeTopic, temporaryTopic);
  assert.equal(result.cleanup.verification.status, "verified");
});

test("matrix smoke surfaces cleanup failure with room and topic details", async () => {
  const result = await runMatrixSmoke({
    env: {
      MATRIX_ENABLED: "true",
      MATRIX_BASE_URL: "https://matrix.example",
      MATRIX_ACCESS_TOKEN: "sk-cleanup-secret",
      MATRIX_SMOKE_ROOM_ID: "!cleanup:matrix.example",
      MATRIX_SMOKE_TOPIC_PREFIX: "Cleanup smoke",
      HOST: "127.0.0.1",
      PORT: "8787"
    },
    loadRootEnvFile: false,
    now: () => new Date("2026-04-15T11:11:12.000Z"),
    randomSuffix: () => "deadbeef",
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
            {
              roomId: "!cleanup:matrix.example",
              name: "Cleanup room",
              canonicalAlias: "#cleanup:matrix.example",
              roomType: "room"
            }
          ]
        });
      }

      if (requestUrl.pathname === `/api/matrix/rooms/${encodeURIComponent("!cleanup:matrix.example")}/topic-access` && method === "GET") {
        return createJsonResponse({
          ok: true,
          access: {
            roomId: "!cleanup:matrix.example",
            userId: "@user:matrix.example",
            roomStatus: "joined",
            joined: true,
            currentPowerLevel: 100,
            requiredPowerLevel: 50,
            canUpdateTopic: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/analyze" && method === "POST" && body?.proposedValue?.startsWith("Cleanup smoke")) {
        return createJsonResponse({
          ok: true,
          plan: {
            planId: "plan-forward",
            type: "update_room_topic",
            roomId: "!cleanup:matrix.example",
            status: "pending_review",
            createdAt: "2026-04-15T11:11:12.000Z",
            expiresAt: "2026-04-15T11:21:12.000Z",
            diff: {
              field: "topic",
              before: "Original cleanup topic",
              after: body.proposedValue
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
            roomId: "!cleanup:matrix.example",
            status: "pending_review",
            createdAt: "2026-04-15T11:11:12.000Z",
            expiresAt: "2026-04-15T11:21:12.000Z",
            diff: {
              field: "topic",
              before: "Original cleanup topic",
              after: body?.proposedValue ?? "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef"
            },
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
            executedAt: "2026-04-15T11:11:12.000Z",
            transactionId: "txn-forward"
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-forward/verify" && method === "GET") {
        return createJsonResponse({
          ok: true,
          verification: {
            planId: "plan-forward",
            status: "verified",
            checkedAt: "2026-04-15T11:11:12.000Z",
            expected: "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef",
            actual: "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef"
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/analyze" && method === "POST" && body?.proposedValue === "Original cleanup topic") {
        return createJsonResponse({
          ok: true,
          plan: {
            planId: "plan-restore",
            type: "update_room_topic",
            roomId: "!cleanup:matrix.example",
            status: "pending_review",
            createdAt: "2026-04-15T11:11:13.000Z",
            expiresAt: "2026-04-15T11:21:13.000Z",
            diff: {
              field: "topic",
              before: "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef",
              after: "Original cleanup topic"
            },
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
            roomId: "!cleanup:matrix.example",
            status: "pending_review",
            createdAt: "2026-04-15T11:11:13.000Z",
            expiresAt: "2026-04-15T11:21:13.000Z",
            diff: {
              field: "topic",
              before: "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef",
              after: "Original cleanup topic"
            },
            requiresApproval: true
          }
        });
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore/execute" && method === "POST") {
        return createJsonResponse({
          ok: false,
          error: {
            code: "matrix_stale_plan",
            message: "Matrix plan is stale and must be refreshed"
          }
        }, 409);
      }

      if (requestUrl.pathname === "/api/matrix/actions/plan-restore/verify" && method === "GET") {
        return createJsonResponse({
          ok: true,
          verification: {
            planId: "plan-restore",
            status: "mismatch",
            checkedAt: "2026-04-15T11:11:13.000Z",
            expected: "Original cleanup topic",
            actual: "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef"
          }
        });
      }

      throw new Error(`Unexpected request ${method} ${requestUrl.pathname}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.phase, "cleanup");
  assert.equal(result.roomId, "!cleanup:matrix.example");
  assert.equal(result.cleanup.restoreTopic, "Original cleanup topic");
  assert.equal(result.cleanup.temporaryTopic, "Cleanup smoke 2026-04-15T11-11-12-000Z deadbeef");
  assert.equal(result.error.code, "matrix_stale_plan");
});

