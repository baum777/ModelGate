import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { MatrixClientError } from "../src/lib/matrix-client.js";
import { createMatrixActionStore } from "../src/lib/matrix-action-store.js";
import { createTestEnv, createMockMatrixClient, createMockOpenRouterClient, createTestMatrixConfig } from "../test-support/helpers.js";

function createMatrixActionClient(overrides: {
  roomTopic?: string | null;
  writeTransactionId?: string;
  readRoomTopic?: () => Promise<string | null>;
  updateRoomTopic?: (roomId: string, topic: string) => Promise<{ transactionId: string }>;
} = {}) {
  let currentTopic = overrides.roomTopic ?? "Old topic";
  let readCalls = 0;
  let writeCalls = 0;

  const client = createMockMatrixClient({
    readRoomTopic: overrides.readRoomTopic ?? (async () => {
      readCalls += 1;
      return currentTopic;
    }),
    updateRoomTopic: overrides.updateRoomTopic ?? (async (_roomId, topic) => {
      writeCalls += 1;
      currentTopic = topic;
      return {
        transactionId: overrides.writeTransactionId ?? "txn-test"
      };
    })
  });

  return {
    client,
    getCurrentTopic: () => currentTopic,
    getReadCalls: () => readCalls,
    getWriteCalls: () => writeCalls,
    setCurrentTopic: (topic: string | null) => {
      currentTopic = topic;
    }
  };
}

function makeApp(overrides: {
  matrixClient?: ReturnType<typeof createMockMatrixClient>;
  matrixActionStore?: ReturnType<typeof createMatrixActionStore>;
} = {}) {
  return createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: overrides.matrixClient ?? createMockMatrixClient(),
    matrixActionStore: overrides.matrixActionStore,
    logger: false
  });
}

test("matrix promote rejects invalid requests", async (t) => {
  const app = makeApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      roomId: "!room:matrix.example",
      topic: "New room topic"
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

test("matrix promote creates a reviewable topic plan", async (t) => {
  const topicClient = createMatrixActionClient({
    roomTopic: "Old room topic"
  });
  const app = makeApp({
    matrixClient: topicClient.client
  });

  t.after(async () => {
    await app.close();
  });

  const promoteResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      type: "update_room_topic",
      roomId: "!room:matrix.example",
      topic: "New room topic"
    }
  });

  assert.equal(promoteResponse.statusCode, 200);
  const promoted = JSON.parse(promoteResponse.body) as {
    ok: true;
    plan: {
      planId: string;
      type: "update_room_topic";
      roomId: string;
      status: "pending_review";
      createdAt: string;
      expiresAt: string;
      diff: {
        field: "topic";
        before: string | null;
        after: string;
      };
      requiresApproval: true;
    };
  };

  assert.equal(promoted.ok, true);
  assert.match(promoted.plan.planId, /^plan_/);
  assert.equal(promoted.plan.type, "update_room_topic");
  assert.equal(promoted.plan.roomId, "!room:matrix.example");
  assert.equal(promoted.plan.status, "pending_review");
  assert.equal(promoted.plan.diff.field, "topic");
  assert.equal(promoted.plan.diff.before, "Old room topic");
  assert.equal(promoted.plan.diff.after, "New room topic");
  assert.equal(promoted.plan.requiresApproval, true);
  assert.match(promoted.plan.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(promoted.plan.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(topicClient.getReadCalls(), 1);
  assert.equal(topicClient.getWriteCalls(), 0);

  const planResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${promoted.plan.planId}`
  });

  assert.equal(planResponse.statusCode, 200);
  const fetched = JSON.parse(planResponse.body) as typeof promoted;
  assert.equal(fetched.plan.planId, promoted.plan.planId);
  assert.equal(fetched.plan.status, "pending_review");
  assert.equal(fetched.plan.diff.before, "Old room topic");
});

test("matrix analyze creates a structured topic plan and execute/verify use it", async (t) => {
  const topicClient = createMatrixActionClient({
    roomTopic: "Old room topic",
    writeTransactionId: "event-456"
  });
  const app = makeApp({
    matrixClient: topicClient.client
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
  const resolved = JSON.parse(resolveResponse.body) as { scope: { scopeId: string } };

  const analyzeResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/analyze",
    payload: {
      roomId: "!room:matrix.example",
      proposedValue: "New room topic",
      scopeId: resolved.scope.scopeId
    }
  });

  assert.equal(analyzeResponse.statusCode, 200);
  const analyzed = JSON.parse(analyzeResponse.body) as {
    ok: true;
    plan: {
      planId: string;
      roomId: string;
      scopeId: string | null;
      snapshotId: string | null;
      status: "pending_review";
      actions: Array<{
        type: "set_room_topic";
        roomId: string;
        currentValue: string | null;
        proposedValue: string;
      }>;
      currentValue: string | null;
      proposedValue: string;
      risk: "low" | "medium" | "high";
      requiresApproval: true;
      createdAt: string;
      expiresAt: string;
    };
  };

  assert.equal(analyzed.ok, true);
  assert.match(analyzed.plan.planId, /^plan_/);
  assert.equal(analyzed.plan.roomId, "!room:matrix.example");
  assert.equal(analyzed.plan.scopeId, resolved.scope.scopeId);
  assert.equal(analyzed.plan.status, "pending_review");
  assert.equal(analyzed.plan.actions.length, 1);
  assert.equal(analyzed.plan.actions[0]?.type, "set_room_topic");
  assert.equal(analyzed.plan.actions[0]?.currentValue, "Old room topic");
  assert.equal(analyzed.plan.actions[0]?.proposedValue, "New room topic");
  assert.equal(analyzed.plan.currentValue, "Old room topic");
  assert.equal(analyzed.plan.proposedValue, "New room topic");
  assert.equal(analyzed.plan.requiresApproval, true);
  assert.match(analyzed.plan.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(analyzed.plan.expiresAt, /^\d{4}-\d{2}-\d{2}T/);

  const planResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${analyzed.plan.planId}`
  });

  assert.equal(planResponse.statusCode, 200);
  const fetched = JSON.parse(planResponse.body) as typeof analyzed;
  assert.equal(fetched.plan.planId, analyzed.plan.planId);
  assert.equal(fetched.plan.actions[0]?.type, "set_room_topic");
  assert.equal(fetched.plan.actions[0]?.proposedValue, "New room topic");

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${analyzed.plan.planId}/execute`,
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 200);
  const executed = JSON.parse(executeResponse.body) as {
    ok: true;
    result: {
      planId: string;
      status: "executed";
      executedAt: string;
      transactionId: string;
    };
  };

  assert.equal(executed.result.planId, analyzed.plan.planId);
  assert.equal(executed.result.status, "executed");
  assert.equal(executed.result.transactionId, "event-456");
  assert.equal(topicClient.getCurrentTopic(), "New room topic");

  const verifyResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${analyzed.plan.planId}/verify`
  });

  assert.equal(verifyResponse.statusCode, 200);
  const verified = JSON.parse(verifyResponse.body) as {
    ok: true;
    verification: {
      planId: string;
      status: "verified" | "mismatch" | "pending" | "failed";
      expected: string;
      actual: string | null;
    };
  };

  assert.equal(verified.verification.status, "verified");
  assert.equal(verified.verification.expected, "New room topic");
  assert.equal(verified.verification.actual, "New room topic");
});

test("matrix execute rejects requests without approval", async (t) => {
  const topicClient = createMatrixActionClient();
  const app = makeApp({
    matrixClient: topicClient.client
  });

  t.after(async () => {
    await app.close();
  });

  const promoteResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      type: "update_room_topic",
      roomId: "!room:matrix.example",
      topic: "New room topic"
    }
  });

  const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
    payload: {
      approval: false
    }
  });

  assert.equal(executeResponse.statusCode, 400);
  assert.deepEqual(JSON.parse(executeResponse.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid Matrix request"
    }
  });
});

test("matrix execute fails closed for expired plans", async (t) => {
  let now = Date.now();
  const store = createMatrixActionStore(1, () => now);
  const topicClient = createMatrixActionClient();
  const app = makeApp({
    matrixClient: topicClient.client,
    matrixActionStore: store
  });

  t.after(async () => {
    await app.close();
  });

  const promoteResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      type: "update_room_topic",
      roomId: "!room:matrix.example",
      topic: "New room topic"
    }
  });

  const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };
  now += 10_000;

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 410);
  assert.deepEqual(JSON.parse(executeResponse.body), {
    ok: false,
    error: {
      code: "matrix_plan_expired",
      message: "Matrix plan expired"
    }
  });
});

test("matrix execute rejects stale plans when the topic changed out of band", async (t) => {
  const topicClient = createMatrixActionClient({
    roomTopic: "Old room topic"
  });
  const app = makeApp({
    matrixClient: topicClient.client
  });

  t.after(async () => {
    await app.close();
  });

  const promoteResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      type: "update_room_topic",
      roomId: "!room:matrix.example",
      topic: "New room topic"
    }
  });

  const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };
  topicClient.setCurrentTopic("External topic change");

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 409);
  assert.deepEqual(JSON.parse(executeResponse.body), {
    ok: false,
    error: {
      code: "matrix_stale_plan",
      message: "Matrix plan is stale and must be refreshed"
    }
  });
  assert.equal(topicClient.getWriteCalls(), 0);
});

test("matrix execute writes the room topic and plan fetch shows the executed state", async (t) => {
  const topicClient = createMatrixActionClient({
    roomTopic: "Old room topic",
    writeTransactionId: "event-123"
  });
  const app = makeApp({
    matrixClient: topicClient.client
  });

  t.after(async () => {
    await app.close();
  });

  const promoteResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      type: "update_room_topic",
      roomId: "!room:matrix.example",
      topic: "New room topic"
    }
  });

  const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 200);
  const executed = JSON.parse(executeResponse.body) as {
    ok: true;
    result: {
      planId: string;
      status: "executed";
      executedAt: string;
      transactionId: string;
    };
  };

  assert.equal(executed.ok, true);
  assert.equal(executed.result.planId, promoted.plan.planId);
  assert.equal(executed.result.status, "executed");
  assert.equal(executed.result.transactionId, "event-123");
  assert.match(executed.result.executedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(topicClient.getCurrentTopic(), "New room topic");
  assert.equal(topicClient.getWriteCalls(), 1);

  const planResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${promoted.plan.planId}`
  });

  assert.equal(planResponse.statusCode, 200);
  const fetched = JSON.parse(planResponse.body) as {
    ok: true;
    plan: { status: "executed" };
  };

  assert.equal(fetched.plan.status, "executed");

  const secondExecuteResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
    payload: {
      approval: true
    }
  });

  assert.equal(secondExecuteResponse.statusCode, 409);
  assert.deepEqual(JSON.parse(secondExecuteResponse.body), {
    ok: false,
    error: {
      code: "matrix_plan_already_executed",
      message: "Matrix plan was already executed"
    }
  });
});

test("matrix verify returns verified, mismatch, and pending states", async (t) => {
  const verifiedClient = createMatrixActionClient({
    roomTopic: "Old room topic"
  });
  const app = makeApp({
    matrixClient: verifiedClient.client
  });

  t.after(async () => {
    await app.close();
  });

  const promoteResponse = await app.inject({
    method: "POST",
    url: "/api/matrix/actions/promote",
    payload: {
      type: "update_room_topic",
      roomId: "!room:matrix.example",
      topic: "New room topic"
    }
  });
  const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };

  const pendingVerifyResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${promoted.plan.planId}/verify`
  });

  assert.equal(pendingVerifyResponse.statusCode, 200);
  const pendingVerification = JSON.parse(pendingVerifyResponse.body) as {
    ok: true;
    verification: {
      planId: string;
      status: "pending";
      checkedAt: string;
      expected: string;
      actual: string | null;
    };
  };

  assert.equal(pendingVerification.verification.status, "pending");
  assert.equal(pendingVerification.verification.expected, "New room topic");
  assert.equal(pendingVerification.verification.actual, "Old room topic");

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
    payload: {
      approval: true
    }
  });
  assert.equal(executeResponse.statusCode, 200);

  const verifiedResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${promoted.plan.planId}/verify`
  });

  assert.equal(verifiedResponse.statusCode, 200);
  const verified = JSON.parse(verifiedResponse.body) as {
    ok: true;
    verification: {
      planId: string;
      status: "verified";
      checkedAt: string;
      expected: string;
      actual: string | null;
    };
  };

  assert.equal(verified.verification.status, "verified");
  assert.equal(verified.verification.actual, "New room topic");

  verifiedClient.setCurrentTopic("Out-of-band change");

  const mismatchResponse = await app.inject({
    method: "GET",
    url: `/api/matrix/actions/${promoted.plan.planId}/verify`
  });

  assert.equal(mismatchResponse.statusCode, 200);
  const mismatch = JSON.parse(mismatchResponse.body) as {
    ok: true;
    verification: {
      status: "mismatch";
      expected: string;
      actual: string | null;
    };
  };

  assert.equal(mismatch.verification.status, "mismatch");
  assert.equal(mismatch.verification.expected, "New room topic");
  assert.equal(mismatch.verification.actual, "Out-of-band change");
});

test("matrix writer routes normalize authorization and timeout failures without leaking tokens", async (t) => {
  const secretToken = "sk-test-secret-token";

  await t.test("unauthorized promote is normalized", async () => {
    const app = createApp({
      env: createTestEnv({
        MATRIX_ACCESS_TOKEN: secretToken
      }),
      openRouter: createMockOpenRouterClient(),
      matrixConfig: createTestMatrixConfig({
        accessToken: secretToken
      }),
      matrixClient: createMockMatrixClient({
        readRoomTopic: async () => {
          throw new MatrixClientError({
            code: "matrix_invalid_token",
            status: 401,
            operation: "Matrix room topic",
            path: "/_matrix/client/v3/rooms/!room%3Amatrix.example/state/m.room.topic",
            baseUrl: "http://matrix.example",
            message: "Matrix credentials were rejected"
          });
        }
      }),
      logger: false
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/matrix/actions/promote",
        payload: {
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          topic: "New room topic"
        }
      });

      assert.equal(response.statusCode, 401);
      assert.deepEqual(JSON.parse(response.body), {
        ok: false,
        error: {
          code: "matrix_invalid_token",
          message: "Matrix credentials were rejected"
        }
      });
      assert.doesNotMatch(response.body, new RegExp(secretToken));
    } finally {
      await app.close();
    }
  });

  await t.test("write forbidden execute is normalized", async () => {
    const app = createApp({
      env: createTestEnv({
        MATRIX_ACCESS_TOKEN: secretToken
      }),
      openRouter: createMockOpenRouterClient(),
      matrixConfig: createTestMatrixConfig({
        accessToken: secretToken
      }),
      matrixClient: createMockMatrixClient({
        readRoomTopic: async () => "Old room topic",
        updateRoomTopic: async () => {
          throw new MatrixClientError({
            code: "matrix_write_forbidden",
            status: 403,
            operation: "Matrix room topic update",
            path: "/_matrix/client/v3/rooms/!room%3Amatrix.example/state/m.room.topic",
            baseUrl: "http://matrix.example",
            message: "Matrix backend denied write access"
          });
        }
      }),
      logger: false
    });

    try {
      const promoteResponse = await app.inject({
        method: "POST",
        url: "/api/matrix/actions/promote",
        payload: {
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          topic: "New room topic"
        }
      });

      const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };

      const response = await app.inject({
        method: "POST",
        url: `/api/matrix/actions/${promoted.plan.planId}/execute`,
        payload: {
          approval: true
        }
      });

      assert.equal(response.statusCode, 403);
      assert.deepEqual(JSON.parse(response.body), {
        ok: false,
        error: {
          code: "matrix_write_forbidden",
          message: "Matrix backend denied write access"
        }
      });
      assert.doesNotMatch(response.body, new RegExp(secretToken));
    } finally {
      await app.close();
    }
  });

  await t.test("timeout verify is normalized", async () => {
    let callCount = 0;
    const app = createApp({
      env: createTestEnv({
        MATRIX_ACCESS_TOKEN: secretToken
      }),
      openRouter: createMockOpenRouterClient(),
      matrixConfig: createTestMatrixConfig({
        accessToken: secretToken
      }),
      matrixClient: createMockMatrixClient({
        readRoomTopic: async () => {
          callCount += 1;

          if (callCount === 1) {
            return "Old room topic";
          }

          throw new MatrixClientError({
            code: "matrix_timeout",
            status: 504,
            operation: "Matrix room topic",
            path: "/_matrix/client/v3/rooms/!room%3Amatrix.example/state/m.room.topic",
            baseUrl: "http://matrix.example",
            message: "Matrix backend request timed out"
          });
        }
      }),
      logger: false
    });

    try {
      const promoteResponse = await app.inject({
        method: "POST",
        url: "/api/matrix/actions/promote",
        payload: {
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          topic: "New room topic"
        }
      });

      const promoted = JSON.parse(promoteResponse.body) as { plan: { planId: string } };

      const response = await app.inject({
        method: "GET",
        url: `/api/matrix/actions/${promoted.plan.planId}/verify`
      });

      assert.equal(response.statusCode, 504);
      assert.deepEqual(JSON.parse(response.body), {
        ok: false,
        error: {
          code: "matrix_timeout",
          message: "Matrix backend request timed out"
        }
      });
      assert.doesNotMatch(response.body, new RegExp(secretToken));
    } finally {
      await app.close();
    }
  });

  await t.test("room not found promote is normalized", async () => {
    const app = createApp({
      env: createTestEnv({
        MATRIX_ACCESS_TOKEN: secretToken
      }),
      openRouter: createMockOpenRouterClient(),
      matrixConfig: createTestMatrixConfig({
        accessToken: secretToken
      }),
      matrixClient: createMockMatrixClient({
        readRoomTopic: async () => {
          throw new MatrixClientError({
            code: "matrix_room_not_found",
            status: 404,
            operation: "Matrix room topic",
            path: "/_matrix/client/v3/rooms/!missing%3Amatrix.example/state/m.room.topic",
            baseUrl: "http://matrix.example",
            message: "Matrix room was not found"
          });
        }
      }),
      logger: false
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/matrix/actions/promote",
        payload: {
          type: "update_room_topic",
          roomId: "!missing:matrix.example",
          topic: "New room topic"
        }
      });

      assert.equal(response.statusCode, 404);
      assert.deepEqual(JSON.parse(response.body), {
        ok: false,
        error: {
          code: "matrix_room_not_found",
          message: "Matrix room was not found"
        }
      });
      assert.doesNotMatch(response.body, new RegExp(secretToken));
    } finally {
      await app.close();
    }
  });
});
