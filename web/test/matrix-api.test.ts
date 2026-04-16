import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeScope,
  fetchProvenance,
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

test("matrix analysis rejects malformed nested candidate payloads", async () => {
  const restoreFetch = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        snapshotId: "snapshot-1",
        response: {
          role: "assistant",
          content: "Analysis response"
        },
        references: [
          {
            type: "room",
            roomId: "!room:example",
            label: "Referenced room"
          }
        ],
        actionCandidates: [
          {
            type: "set_room_name",
            targetRoomId: "!room:example",
            summary: "Rename room",
            rationale: "Bounded rename candidate",
            requiresPromotion: true
          }
        ]
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
      analyzeScope({
        scopeId: "scope-1",
        prompt: "Review the scope"
      }),
      (error) =>
        error instanceof MatrixRequestError
        && error.kind === "parse"
        && error.operation === "Matrix analysis"
        && error.message.includes("candidateId")
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
            status: "verified"
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
    assert.deepEqual(seenRequests.map((request) => request.method), ["GET"]);
    assert.equal(parsedUrl.pathname, "/api/matrix/rooms/!room%3Amatrix.example/provenance");
  } finally {
    restoreFetch();
  }
});
