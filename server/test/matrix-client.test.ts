import assert from "node:assert/strict";
import test from "node:test";
import { createMatrixClient, MatrixClientError } from "../src/lib/matrix-client.js";
import { createTestMatrixConfig } from "../test-support/helpers.js";

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("matrix whoami normalizes the homeserver identity", async () => {
  const client = createMatrixClient({
    config: createTestMatrixConfig(),
    fetchImpl: async (input, init) => {
      assert.match(String(input), /\/_matrix\/client\/v3\/account\/whoami$/);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-matrix-token");
      return makeJsonResponse({
        user_id: "@user:matrix.example",
        device_id: "DEVICE"
      });
    }
  });

  const whoami = await client.whoami();

  assert.deepEqual(whoami, {
    ok: true,
    userId: "@user:matrix.example",
    deviceId: "DEVICE",
    homeserver: "http://matrix.example"
  });
});

test("matrix joined rooms normalizes room metadata from upstream state", async () => {
  const calls: string[] = [];
  const client = createMatrixClient({
    config: createTestMatrixConfig(),
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname);

      if (url.pathname === "/_matrix/client/v3/joined_rooms") {
        return makeJsonResponse({
          joined_rooms: ["!room:matrix.example"]
        });
      }

      if (url.pathname.endsWith("/state/m.room.name")) {
        return makeJsonResponse({
          name: "Room name"
        });
      }

      if (url.pathname.endsWith("/state/m.room.canonical_alias")) {
        return makeJsonResponse({
          alias: "#room:matrix.example"
        });
      }

      if (url.pathname.endsWith("/state/m.room.create")) {
        return makeJsonResponse({
          room_type: "m.space"
        });
      }

      throw new Error(`unexpected path: ${url.pathname}`);
    }
  });

  const rooms = await client.joinedRooms();

  assert.deepEqual(rooms, [
    {
      roomId: "!room:matrix.example",
      name: "Room name",
      canonicalAlias: "#room:matrix.example",
      roomType: "space"
    }
  ]);
  assert.deepEqual(calls, [
    "/_matrix/client/v3/joined_rooms",
    "/_matrix/client/v3/rooms/!room%3Amatrix.example/state/m.room.create",
    "/_matrix/client/v3/rooms/!room%3Amatrix.example/state/m.room.name",
    "/_matrix/client/v3/rooms/!room%3Amatrix.example/state/m.room.canonical_alias"
  ]);
});

test("matrix scope resolve normalizes a cached snapshot", async () => {
  const client = createMatrixClient({
    config: createTestMatrixConfig(),
    fetchImpl: async (input) => {
      const url = new URL(String(input));

      if (url.pathname === "/_matrix/client/v3/joined_rooms") {
        return makeJsonResponse({
          joined_rooms: ["!room:matrix.example"]
        });
      }

      if (url.pathname.endsWith("/joined_members")) {
        return makeJsonResponse({
          joined: {
            "@user:matrix.example": {
              display_name: "User"
            }
          }
        });
      }

      if (url.pathname.endsWith("/state/m.room.name")) {
        return makeJsonResponse({
          name: "Room name"
        });
      }

      if (url.pathname.endsWith("/state/m.room.canonical_alias")) {
        return makeJsonResponse({
          alias: "#room:matrix.example"
        });
      }

      if (url.pathname.endsWith("/state/m.room.create")) {
        return makeJsonResponse({
          room_type: "m.room"
        });
      }

      throw new Error(`unexpected path: ${url.pathname}`);
    }
  });

  const snapshot = await client.resolveScope({
    roomIds: ["!room:matrix.example"],
    spaceIds: []
  });

  assert.equal(snapshot.type, "room");
  assert.equal(snapshot.rooms.length, 1);
  assert.equal(snapshot.rooms[0]?.members, 1);
  assert.equal(snapshot.rooms[0]?.lastEventSummary, "Room metadata snapshot with 1 joined members");
  assert.equal(snapshot.rooms[0]?.roomType, "room");
  assert.match(snapshot.scopeId, /^scope_/);
  assert.match(snapshot.snapshotId, /^snapshot_/);
});

test("matrix client fails closed for malformed, unauthorized, forbidden, and timeout responses", async () => {
  const malformedClient = createMatrixClient({
    config: createTestMatrixConfig(),
    fetchImpl: async () => makeJsonResponse({
      device_id: "DEVICE"
    })
  });

  await assert.rejects(
    malformedClient.whoami(),
    (error) => error instanceof MatrixClientError && error.code === "matrix_malformed_response"
  );

  const unauthorizedClient = createMatrixClient({
    config: createTestMatrixConfig(),
    fetchImpl: async () => new Response("", { status: 401 })
  });

  await assert.rejects(
    unauthorizedClient.whoami(),
    (error) => error instanceof MatrixClientError && error.code === "matrix_unauthorized"
  );

  const forbiddenClient = createMatrixClient({
    config: createTestMatrixConfig(),
    fetchImpl: async () => new Response("", { status: 403 })
  });

  await assert.rejects(
    forbiddenClient.whoami(),
    (error) => error instanceof MatrixClientError && error.code === "matrix_forbidden"
  );

  const timeoutClient = createMatrixClient({
    config: createTestMatrixConfig({
      requestTimeoutMs: 1
    }),
    fetchImpl: async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        signal?.addEventListener("abort", () => {
          reject(new Error("AbortError"));
        });
      })
  });

  await assert.rejects(
    timeoutClient.whoami(),
    (error) => error instanceof MatrixClientError && error.code === "matrix_timeout"
  );
});

test("matrix client refreshes rotated credentials on unauthorized responses and retries once", async () => {
  const requests: Array<{
    path: string;
    method: string;
    authorization: string | null;
  }> = [];

  const config = createTestMatrixConfig({
    accessToken: "stale-access-token",
    refreshToken: "initial-refresh-token",
    clientId: "client-id"
  });

  const client = createMatrixClient({
    config,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET");
      const headers = new Headers(init?.headers);
      requests.push({
        path: url.pathname,
        method,
        authorization: headers.get("Authorization")
      });

      if (url.pathname === "/oauth2/token" && method === "POST") {
        const rawBody = init?.body;
        const body = rawBody instanceof URLSearchParams
          ? rawBody
          : typeof rawBody === "string"
            ? new URLSearchParams(rawBody)
            : new URLSearchParams(String(rawBody ?? ""));

        assert.equal(headers.get("Authorization"), null);
        assert.equal(body.get("grant_type"), "refresh_token");
        assert.equal(body.get("refresh_token"), "initial-refresh-token");
        assert.equal(body.get("client_id"), "client-id");

        return makeJsonResponse({
          access_token: "fresh-access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600
        });
      }

      if (url.pathname === "/_matrix/client/v3/account/whoami") {
        if (headers.get("Authorization") === "Bearer stale-access-token") {
          return new Response("", { status: 401 });
        }

        assert.equal(headers.get("Authorization"), "Bearer fresh-access-token");
        return makeJsonResponse({
          user_id: "@user:matrix.example",
          device_id: "DEVICE"
        });
      }

      throw new Error(`unexpected request: ${method} ${url.pathname}`);
    }
  });

  const whoami = await client.whoami();

  assert.deepEqual(whoami, {
    ok: true,
    userId: "@user:matrix.example",
    deviceId: "DEVICE",
    homeserver: "http://matrix.example"
  });
  assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
    "GET /_matrix/client/v3/account/whoami",
    "POST /oauth2/token",
    "GET /_matrix/client/v3/account/whoami"
  ]);
  assert.equal(config.accessToken, "fresh-access-token");
  assert.equal(config.refreshToken, "rotated-refresh-token");
  assert.match(config.tokenExpiresAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("matrix client proactively refreshes near-expiry credentials before the request", async () => {
  const requests: Array<{
    path: string;
    method: string;
    authorization: string | null;
  }> = [];

  const config = createTestMatrixConfig({
    accessToken: "soon-expiring-access-token",
    refreshToken: "initial-refresh-token",
    clientId: "client-id",
    tokenExpiresAt: new Date(Date.now() + 15_000).toISOString()
  });

  const client = createMatrixClient({
    config,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET");
      const headers = new Headers(init?.headers);
      requests.push({
        path: url.pathname,
        method,
        authorization: headers.get("Authorization")
      });

      if (url.pathname === "/oauth2/token" && method === "POST") {
        const rawBody = init?.body;
        const body = rawBody instanceof URLSearchParams
          ? rawBody
          : typeof rawBody === "string"
            ? new URLSearchParams(rawBody)
            : new URLSearchParams(String(rawBody ?? ""));

        assert.equal(headers.get("Authorization"), null);
        assert.equal(body.get("grant_type"), "refresh_token");
        assert.equal(body.get("refresh_token"), "initial-refresh-token");
        assert.equal(body.get("client_id"), "client-id");

        return makeJsonResponse({
          access_token: "fresh-access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600
        });
      }

      if (url.pathname === "/_matrix/client/v3/account/whoami") {
        assert.equal(headers.get("Authorization"), "Bearer fresh-access-token");
        return makeJsonResponse({
          user_id: "@user:matrix.example",
          device_id: "DEVICE"
        });
      }

      throw new Error(`unexpected request: ${method} ${url.pathname}`);
    }
  });

  const whoami = await client.whoami();

  assert.deepEqual(whoami, {
    ok: true,
    userId: "@user:matrix.example",
    deviceId: "DEVICE",
    homeserver: "http://matrix.example"
  });
  assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
    "POST /oauth2/token",
    "GET /_matrix/client/v3/account/whoami"
  ]);
  assert.equal(config.accessToken, "fresh-access-token");
  assert.equal(config.refreshToken, "rotated-refresh-token");
});

test("matrix client fails closed when the refresh backend is unavailable", async () => {
  const requests: Array<string> = [];
  const client = createMatrixClient({
    config: createTestMatrixConfig({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      clientId: "client-id"
    }),
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET");
      requests.push(`${method} ${url.pathname}`);

      if (url.pathname === "/_matrix/client/v3/account/whoami") {
        return new Response("", { status: 401 });
      }

      if (url.pathname === "/oauth2/token" && method === "POST") {
        return new Response("", { status: 503 });
      }

      throw new Error(`unexpected request: ${method} ${url.pathname}`);
    }
  });

  await assert.rejects(
    client.whoami(),
    (error) => error instanceof MatrixClientError && error.code === "matrix_unavailable"
  );

  assert.deepEqual(requests, [
    "GET /_matrix/client/v3/account/whoami",
    "POST /oauth2/token"
  ]);
});
