import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRoomTopicUpdate,
  fetchProvenance,
  fetchRoomTopicAnalysisPlan,
  fetchMatrixWhoAmI,
  MatrixRequestError
} from "../src/lib/matrix-api.js";

function installFetchMock(handler: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("matrix whoami rejects malformed 200 payloads", async () => {
  const restoreFetch = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        deviceId: null,
        homeserver: "matrix.example"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  );

  try {
    await assert.rejects(
      fetchMatrixWhoAmI(),
      (error) =>
        error instanceof MatrixRequestError
        && error.kind === "parse"
        && error.operation === "Matrix whoami"
        && error.message.includes("userId")
    );
  } finally {
    restoreFetch();
  }
});

test("matrix room topic analysis validates structured plan payloads", async () => {
  const seenRequests: Array<{ url: string; method: string }> = [];
  const restoreFetch = installFetchMock(async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    seenRequests.push({
      url: requestUrl,
      method: init?.method ?? "GET"
    });

    return new Response(
      JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-1",
          roomId: "!room:example",
          scopeId: null,
          snapshotId: null,
          status: "pending_review",
          actions: [
            {
              type: "set_room_topic",
              roomId: "!room:example",
              currentValue: "Old topic",
              proposedValue: "New topic"
            }
          ],
          currentValue: "Old topic",
          proposedValue: "New topic",
          risk: "medium",
          requiresApproval: true,
          createdAt: "2026-04-16T10:00:00.000Z",
          expiresAt: "2026-04-16T10:10:00.000Z"
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  });

  try {
    const plan = await analyzeRoomTopicUpdate({
      roomId: "!room:example",
      proposedValue: "New topic"
    });

    assert.equal(plan.roomId, "!room:example");
    assert.equal(plan.actions[0]?.type, "set_room_topic");
    assert.equal(plan.proposedValue, "New topic");
    assert.equal(new URL(seenRequests[0]?.url ?? "http://127.0.0.1").pathname, "/api/matrix/analyze");
    assert.deepEqual(seenRequests.map((request) => request.method), ["POST"]);
  } finally {
    restoreFetch();
  }
});

test("matrix room topic analysis rejects malformed actions in fetched plans", async () => {
  const restoreFetch = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-1",
          roomId: "!room:example",
          scopeId: null,
          snapshotId: null,
          status: "pending_review",
          actions: [
            {
              type: "set_room_topic",
              roomId: "!room:example",
              currentValue: "Old topic"
            }
          ],
          currentValue: "Old topic",
          proposedValue: "New topic",
          risk: "medium",
          requiresApproval: true,
          createdAt: "2026-04-16T10:00:00.000Z",
          expiresAt: "2026-04-16T10:10:00.000Z"
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  );

  try {
    await assert.rejects(
      fetchRoomTopicAnalysisPlan("plan-1"),
      (error) =>
        error instanceof MatrixRequestError
        && error.kind === "parse"
        && error.operation === "Matrix room topic analysis plan fetch"
        && error.message.includes("proposedValue")
    );
  } finally {
    restoreFetch();
  }
});

test("matrix provenance requests the encoded room route and validates the read-only response", async () => {
  const seenRequests: Array<{ url: string; method: string }> = [];
  const restoreFetch = installFetchMock(async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    seenRequests.push({
      url: requestUrl,
      method: init?.method ?? "GET"
    });

    return new Response(
      JSON.stringify({
        ok: true,
        roomId: "!room:matrix.example",
        snapshotId: null,
        stateEventId: null,
        originServer: "https://matrix.example",
        authChainIndex: 0,
        signatures: [
          {
            signer: "@user:matrix.example",
            status: "derived"
          }
        ],
        integrityNotice: "Read-only room metadata derived from joined rooms."
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  });

  try {
    const response = await fetchProvenance("!room:matrix.example");
    const parsedUrl = new URL(seenRequests[0]?.url ?? "http://127.0.0.1");

    assert.equal(response.ok, true);
    assert.equal(response.roomId, "!room:matrix.example");
    assert.equal(response.originServer, "https://matrix.example");
    assert.equal(response.integrityNotice, "Read-only room metadata derived from joined rooms.");
    assert.equal(response.signatures[0]?.status, "derived");
    assert.deepEqual(seenRequests.map((request) => request.method), ["GET"]);
    assert.equal(parsedUrl.pathname, "/api/matrix/rooms/!room%3Amatrix.example/provenance");
  } finally {
    restoreFetch();
  }
});
