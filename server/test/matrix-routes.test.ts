import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createDisabledMatrixConfig } from "../src/lib/matrix-env.js";
import { createMockMatrixClient, createMockOpenRouterClient, createTestEnv, createTestMatrixConfig } from "../test-support/helpers.js";
import { createMatrixScopeStore } from "../src/lib/matrix-scope-store.js";

test("matrix routes return not configured when matrix is disabled", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createDisabledMatrixConfig(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/matrix/whoami"
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "matrix_not_configured",
      message: "Matrix backend is not configured"
    }
  });
});

test("matrix routes fail closed when the expected user id does not match whoami", async (t) => {
  let whoamiCalls = 0;
  let joinedRoomsCalls = 0;
  let resolveScopeCalls = 0;

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig({
      expectedUserId: "@expected:matrix.example"
    }),
    matrixClient: {
      whoami: async () => {
        whoamiCalls += 1;
        return {
          ok: true,
          userId: "@other:matrix.example",
          deviceId: "DEVICE",
          homeserver: "http://matrix.example"
        };
      },
      joinedRooms: async () => {
        joinedRoomsCalls += 1;
        throw new Error("joinedRooms should not be called when identity mismatches");
      },
      readRoomPowerLevels: async () => {
        throw new Error("readRoomPowerLevels should not be called when identity mismatches");
      },
      resolveScope: async () => {
        resolveScopeCalls += 1;
        throw new Error("resolveScope should not be called when identity mismatches");
      },
      readRoomTopic: async () => {
        throw new Error("readRoomTopic should not be called when identity mismatches");
      },
      updateRoomTopic: async () => {
        throw new Error("updateRoomTopic should not be called when identity mismatches");
      }
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const whoamiResponse = await app.inject({
    method: "GET",
    url: "/api/matrix/whoami"
  });

  assert.equal(whoamiResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(whoamiResponse.body), {
    ok: false,
    error: {
      code: "matrix_forbidden",
      message: "Matrix backend returned an unexpected user identity"
    }
  });

  const joinedRoomsResponse = await app.inject({
    method: "GET",
    url: "/api/matrix/joined-rooms"
  });

  assert.equal(joinedRoomsResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(joinedRoomsResponse.body), {
    ok: false,
    error: {
      code: "matrix_forbidden",
      message: "Matrix backend returned an unexpected user identity"
    }
  });

  const scopeResolveResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/scope/resolve",
    payload: {
      roomIds: ["!room:matrix.example"],
      spaceIds: []
    }
  });

  assert.equal(scopeResolveResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(scopeResolveResponse.body), {
    ok: false,
    error: {
      code: "matrix_forbidden",
      message: "Matrix backend returned an unexpected user identity"
    }
  });

  assert.equal(whoamiCalls, 3);
  assert.equal(joinedRoomsCalls, 0);
  assert.equal(resolveScopeCalls, 0);
});

test("matrix scope resolve rejects empty selections", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/matrix/scope/resolve",
    payload: {
      roomIds: [],
      spaceIds: []
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid Matrix request"
    }
  });
});

test("matrix analyze rejects missing room ids", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/matrix/analyze",
    payload: {
      roomId: "   ",
      proposedValue: "New topic"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid Matrix request"
    }
  });
});

test("matrix topic access reports joined room power details", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/matrix/rooms/!room:matrix.example/topic-access"
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body) as {
    ok: true;
    access: {
      roomId: string;
      userId: string;
      roomStatus: "joined" | "not_joined" | "not_found";
      joined: boolean;
      currentPowerLevel: number | null;
      requiredPowerLevel: number | null;
      canUpdateTopic: boolean;
    };
  };

  assert.equal(body.ok, true);
  assert.equal(body.access.roomId, "!room:matrix.example");
  assert.equal(body.access.roomStatus, "joined");
  assert.equal(body.access.joined, true);
  assert.equal(body.access.currentPowerLevel, 100);
  assert.equal(body.access.requiredPowerLevel, 50);
  assert.equal(body.access.canUpdateTopic, true);
});

test("matrix scope resolve stores a snapshot and summary reads it back", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const resolveResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/scope/resolve",
    payload: {
      roomIds: ["!room:matrix.example"],
      spaceIds: []
    }
  });

  assert.equal(resolveResponse.statusCode, 200);
  const resolved = JSON.parse(resolveResponse.body) as {
    ok: true;
    scope: { scopeId: string; type: string; createdAt: string; rooms: unknown[] };
  };

  assert.equal(resolved.ok, true);
  assert.equal(resolved.scope.type, "room");
  assert.equal(resolved.scope.rooms.length, 1);
  assert.match(resolved.scope.scopeId, /^scope_/);

  const summaryResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/scope/${resolved.scope.scopeId}/summary`
  });

  assert.equal(summaryResponse.statusCode, 200);
  const summary = JSON.parse(summaryResponse.body) as {
    ok: true;
    scopeId: string;
    snapshotId: string;
    generatedAt: string;
    items: Array<{
      roomId: string;
      members: number;
      freshnessMs: number;
      lastEventSummary: string;
      selected: boolean;
    }>;
  };

  assert.equal(summary.ok, true);
  assert.equal(summary.scopeId, resolved.scope.scopeId);
  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0]?.members, 1);
  assert.equal(summary.items[0]?.selected, true);
  assert.match(summary.items[0]?.lastEventSummary ?? "", /Room metadata snapshot/);
});

test("matrix scope summary fails closed for missing and expired snapshots", async (t) => {
  const missingApp = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    logger: false
  });

  t.after(async () => {
    await missingApp.close();
  });

  const missingResponse = await missingApp.inject({
    method: "GET",
    url: "/api/matrix/scope/missing/summary"
  });

  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(JSON.parse(missingResponse.body), {
    ok: false,
    error: {
      code: "matrix_scope_not_found",
      message: "Matrix scope was not found"
    }
  });

  let now = Date.now();
  const store = createMatrixScopeStore(1, () => now);
  const expiredApp = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    matrixStore: store,
    logger: false
  });

  t.after(async () => {
    await expiredApp.close();
  });

  const resolveResponse = await expiredApp.inject({
    method: "POST",
    url: "/api/matrix/scope/resolve",
    payload: {
      roomIds: ["!room:matrix.example"],
      spaceIds: []
    }
  });

  assert.equal(resolveResponse.statusCode, 200);
  const resolved = JSON.parse(resolveResponse.body) as { scope: { scopeId: string } };

  now = Date.now() + 10_000;

  const expiredResponse = await expiredApp.inject({
    method: "GET",
    url: `/api/matrix/scope/${resolved.scope.scopeId}/summary`
  });

  assert.equal(expiredResponse.statusCode, 404);
  assert.deepEqual(JSON.parse(expiredResponse.body), {
    ok: false,
    error: {
      code: "matrix_scope_not_found",
      message: "Matrix scope was not found"
    }
  });
});

test("matrix room provenance returns normalized read-only room metadata", async (t) => {
  let whoamiCalls = 0;
  let joinedRoomsCalls = 0;
  let readTopicCalls = 0;

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig({
      expectedUserId: "@user:matrix.example",
      baseUrl: "https://matrix.example"
    }),
    matrixClient: {
      whoami: async () => {
        whoamiCalls += 1;
        return {
          ok: true,
          userId: "@user:matrix.example",
          deviceId: "DEVICE",
          homeserver: "https://matrix.example"
        };
      },
      joinedRooms: async () => {
        joinedRoomsCalls += 1;
        return [
          {
            roomId: "!room:matrix.example",
            name: "ModelGate Test",
            canonicalAlias: "#modelgate-test:matrix.example",
            roomType: "room"
          }
        ];
      },
      resolveScope: async () => {
        throw new Error("resolveScope should not be called for provenance");
      },
      readRoomTopic: async () => {
        readTopicCalls += 1;
        throw new Error("readRoomTopic should not be called for provenance");
      },
      readRoomPowerLevels: async () => {
        throw new Error("readRoomPowerLevels should not be called for provenance");
      },
      updateRoomTopic: async () => {
        throw new Error("updateRoomTopic should not be called for provenance");
      }
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/matrix/rooms/%21room%3Amatrix.example/provenance"
  });

  assert.equal(response.statusCode, 200);
  const parsed = JSON.parse(response.body) as {
    ok: true;
    roomId: string;
    snapshotId: string | null;
    stateEventId: string | null;
    originServer: string;
    authChainIndex: number;
    signatures: Array<{ signer: string; status: string }>;
    integrityNotice: string;
    provenance: {
      source: string;
      kind: string;
      generatedAt: string;
      items: Array<{
        type: string;
        id: string;
        label: string;
        alias: string | null;
      }>;
    };
  };

  assert.equal(parsed.ok, true);
  assert.equal(parsed.roomId, "!room:matrix.example");
  assert.equal(parsed.snapshotId, null);
  assert.equal(parsed.stateEventId, null);
  assert.equal(parsed.originServer, "https://matrix.example");
  assert.equal(parsed.authChainIndex, 0);
  assert.equal(parsed.signatures[0]?.signer, "@user:matrix.example");
  assert.equal(parsed.signatures[0]?.status, "derived");
  assert.equal(parsed.integrityNotice, "Read-only room metadata derived from joined rooms.");
  assert.equal(parsed.provenance.source, "matrix");
  assert.equal(parsed.provenance.kind, "room_metadata");
  assert.equal(parsed.provenance.items[0]?.id, "!room:matrix.example");
  assert.equal(parsed.provenance.items[0]?.label, "ModelGate Test");
  assert.equal(parsed.provenance.items[0]?.alias, "#modelgate-test:matrix.example");
  assert.match(parsed.provenance.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(whoamiCalls, 1);
  assert.equal(joinedRoomsCalls, 1);
  assert.equal(readTopicCalls, 0);
});

test("matrix room provenance fails closed when the room is missing", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: {
      whoami: async () => ({
        ok: true,
        userId: "@user:matrix.example",
        deviceId: "DEVICE",
        homeserver: "https://matrix.example"
      }),
      joinedRooms: async () => [
        {
          roomId: "!other:matrix.example",
          name: "Other room",
          canonicalAlias: "#other:matrix.example",
          roomType: "room"
        }
      ],
      resolveScope: async () => {
        throw new Error("resolveScope should not be called for provenance");
      },
      readRoomTopic: async () => {
        throw new Error("readRoomTopic should not be called for provenance");
      },
      readRoomPowerLevels: async () => {
        throw new Error("readRoomPowerLevels should not be called for provenance");
      },
      updateRoomTopic: async () => {
        throw new Error("updateRoomTopic should not be called for provenance");
      }
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/matrix/rooms/%21room%3Amatrix.example/provenance"
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "matrix_room_not_found",
      message: "Matrix room was not found"
    }
  });
});
