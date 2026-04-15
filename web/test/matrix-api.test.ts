import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeScope,
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
