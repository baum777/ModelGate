import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  MatrixActionExecuteRequestSchema,
  MatrixActionPlanIdSchema,
  MatrixUpdateRoomTopicRequestSchema,
  type MatrixActionPlan
} from "../lib/matrix-action-contract.js";
import {
  MatrixScopeResolveRequestSchema,
  type MatrixWhoAmIResponse,
  buildMatrixErrorResponse,
  matrixErrorStatus,
  type MatrixErrorCode
} from "../lib/matrix-contract.js";
import { MatrixClientError, type MatrixClient } from "../lib/matrix-client.js";
import type { MatrixConfig } from "../lib/matrix-env.js";
import { createMatrixActionStore, type MatrixActionStore } from "../lib/matrix-action-store.js";
import {
  buildMatrixScopeSummaryItems,
  createMatrixScopeStore,
  type MatrixScopeSnapshot,
  type MatrixScopeStore
} from "../lib/matrix-scope-store.js";

type MatrixRouteDependencies = {
  config: MatrixConfig;
  client: MatrixClient;
  store?: MatrixScopeStore;
  actionStore?: MatrixActionStore;
};

function sendMatrixError(reply: FastifyReply, code: MatrixErrorCode, message?: string) {
  return reply.status(matrixErrorStatus(code)).send(buildMatrixErrorResponse(code, message));
}

function isMatrixClientError(error: unknown): error is MatrixClientError {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "MatrixClientError"
  );
}

function handleMatrixError(reply: FastifyReply, error: unknown) {
  if (isMatrixClientError(error)) {
    return sendMatrixError(reply, error.code, error.message);
  }

  return sendMatrixError(reply, "matrix_internal_error");
}

function readActionPlanOrError(reply: FastifyReply, actionStore: MatrixActionStore, planId: string) {
  const lookup = actionStore.readPlan(planId);

  if (lookup.state === "missing") {
    return { error: sendMatrixError(reply, "matrix_plan_not_found") as never };
  }

  if (lookup.state === "expired") {
    return { error: sendMatrixError(reply, "matrix_plan_expired") as never };
  }

  return { plan: lookup.plan };
}

function serializeActionPlan(plan: MatrixActionPlan): MatrixActionPlan {
  return {
    planId: plan.planId,
    type: plan.type,
    roomId: plan.roomId,
    status: plan.status,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    diff: {
      field: plan.diff.field,
      before: plan.diff.before,
      after: plan.diff.after
    },
    requiresApproval: true
  };
}

function assertExpectedMatrixUser(
  config: MatrixConfig,
  identity: MatrixWhoAmIResponse,
  operation: string,
  path: string
) {
  if (config.expectedUserId && identity.userId !== config.expectedUserId) {
    throw new MatrixClientError({
      code: "matrix_forbidden",
      status: 403,
      operation,
      path,
      baseUrl: config.baseUrl ?? "unconfigured",
      message: "Matrix backend returned an unexpected user identity"
    });
  }
}

export function matrixRoutes(app: FastifyInstance, deps: MatrixRouteDependencies) {
  const store = deps.store ?? createMatrixScopeStore();
  const actionStore = deps.actionStore ?? createMatrixActionStore();

  app.get("/api/matrix/whoami", async (_request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    try {
      const response = await deps.client.whoami();
      assertExpectedMatrixUser(deps.config, response, "matrix_whoami", "/api/matrix/whoami");
      return reply.status(200).send(response);
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });

  app.get("/api/matrix/joined-rooms", async (_request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    try {
      const identity = await deps.client.whoami();
      assertExpectedMatrixUser(deps.config, identity, "matrix_joined_rooms", "/api/matrix/joined-rooms");
      const rooms = await deps.client.joinedRooms();
      return reply.status(200).send({
        ok: true,
        rooms
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });

  app.post("/api/matrix/scope/resolve", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const parsed = MatrixScopeResolveRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendMatrixError(reply, "invalid_request");
    }

    try {
      const identity = await deps.client.whoami();
      assertExpectedMatrixUser(deps.config, identity, "matrix_scope_resolve", "/api/matrix/scope/resolve");
      const resolution = await deps.client.resolveScope(parsed.data);
      const snapshot: MatrixScopeSnapshot = {
        scopeId: resolution.scopeId,
        snapshotId: resolution.snapshotId,
        type: resolution.type,
        createdAt: resolution.createdAt,
        createdAtMs: resolution.createdAtMs,
        expiresAtMs: resolution.createdAtMs + store.ttlMs,
        rooms: resolution.rooms
      };

      store.put(snapshot);

      return reply.status(200).send({
        ok: true,
        scope: {
          scopeId: resolution.scopeId,
          type: resolution.type,
          rooms: resolution.rooms.map(({ members, lastEventSummary, ...room }) => room),
          createdAt: resolution.createdAt
        }
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });

  app.get("/api/matrix/scope/:scopeId/summary", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const scopeId = typeof request.params === "object" && request.params !== null
      ? (request.params as { scopeId?: unknown }).scopeId
      : undefined;

    if (typeof scopeId !== "string" || scopeId.trim().length === 0) {
      return sendMatrixError(reply, "invalid_request");
    }

    try {
      const identity = await deps.client.whoami();
      assertExpectedMatrixUser(
        deps.config,
        identity,
        "matrix_scope_summary",
        `/api/matrix/scope/${scopeId}/summary`
      );
    } catch (error) {
      return handleMatrixError(reply, error);
    }

    const snapshot = store.get(scopeId);

    if (!snapshot) {
      return sendMatrixError(reply, "matrix_scope_not_found");
    }

    return reply.status(200).send({
      ok: true,
      scopeId: snapshot.scopeId,
      snapshotId: snapshot.snapshotId,
      generatedAt: new Date().toISOString(),
      items: buildMatrixScopeSummaryItems(snapshot)
    });
  });

  app.get("/api/matrix/rooms/:roomId/provenance", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const roomId = typeof request.params === "object" && request.params !== null
      ? (request.params as { roomId?: unknown }).roomId
      : undefined;

    if (typeof roomId !== "string" || roomId.trim().length === 0) {
      return sendMatrixError(reply, "invalid_request");
    }

    try {
      const identity = await deps.client.whoami();
      assertExpectedMatrixUser(
        deps.config,
        identity,
        "matrix_room_provenance",
        `/api/matrix/rooms/${roomId}/provenance`
      );

      const rooms = await deps.client.joinedRooms();
      const room = rooms.find((candidate) => candidate.roomId === roomId);

      if (!room) {
        return sendMatrixError(reply, "matrix_room_not_found");
      }

      const generatedAt = new Date().toISOString();

      return reply.status(200).send({
        ok: true,
        roomId,
        snapshotId: null,
        stateEventId: null,
        originServer: deps.config.baseUrl,
        authChainIndex: 0,
        signatures: [
          {
            signer: identity.userId,
            status: "verified"
          }
        ],
        integrityNotice: "Read-only room metadata derived from joined rooms.",
        provenance: {
          source: "matrix",
          kind: "room_metadata",
          generatedAt,
          items: [
            {
              type: "room",
              id: room.roomId,
              label: room.name ?? room.canonicalAlias ?? room.roomId,
              alias: room.canonicalAlias
            }
          ]
        }
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });

  app.post("/api/matrix/actions/promote", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const parsed = MatrixUpdateRoomTopicRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendMatrixError(reply, "invalid_request");
    }

    try {
      const before = await deps.client.readRoomTopic(parsed.data.roomId);
      const plan = actionStore.createPlan({
        planId: `plan_${randomUUID()}`,
        type: "update_room_topic",
        roomId: parsed.data.roomId,
        status: "pending_review",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + actionStore.ttlMs).toISOString(),
        diff: {
          field: "topic",
          before,
          after: parsed.data.topic
        },
        requiresApproval: true
      });

      return reply.status(200).send({
        ok: true,
        plan: serializeActionPlan(plan)
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });

  app.get("/api/matrix/actions/:planId", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const parsed = MatrixActionPlanIdSchema.safeParse(
      typeof request.params === "object" && request.params !== null
        ? (request.params as { planId?: unknown }).planId
        : undefined
    );

    if (!parsed.success) {
      return sendMatrixError(reply, "invalid_request");
    }

    const lookup = readActionPlanOrError(reply, actionStore, parsed.data);

    if ("error" in lookup) {
      return lookup.error;
    }

    return reply.status(200).send({
      ok: true,
      plan: serializeActionPlan(lookup.plan)
    });
  });

  app.post("/api/matrix/actions/:planId/execute", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const planIdResult = MatrixActionPlanIdSchema.safeParse(
      typeof request.params === "object" && request.params !== null
        ? (request.params as { planId?: unknown }).planId
        : undefined
    );
    const bodyResult = MatrixActionExecuteRequestSchema.safeParse(request.body);

    if (!planIdResult.success || !bodyResult.success) {
      return sendMatrixError(reply, "invalid_request");
    }

    const lookup = actionStore.readPlan(planIdResult.data);

    if (lookup.state === "missing") {
      return sendMatrixError(reply, "matrix_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendMatrixError(reply, "matrix_plan_expired");
    }

    const plan = lookup.plan;

    if (plan.status === "executed" || plan.execution) {
      return sendMatrixError(reply, "matrix_plan_already_executed");
    }

    try {
      const currentTopic = await deps.client.readRoomTopic(plan.roomId);

      if (currentTopic !== plan.diff.before) {
        return sendMatrixError(reply, "matrix_stale_plan");
      }

      const executedAt = new Date().toISOString();
      const transaction = await deps.client.updateRoomTopic(plan.roomId, plan.diff.after);

      actionStore.updatePlan(plan.planId, (current) => ({
        ...current,
        status: "executed",
        execution: {
          planId: current.planId,
          status: "executed",
          executedAt,
          transactionId: transaction.transactionId
        }
      }));

      return reply.status(200).send({
        ok: true,
        result: {
          planId: plan.planId,
          status: "executed",
          executedAt,
          transactionId: transaction.transactionId
        }
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });

  app.get("/api/matrix/actions/:planId/verify", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const parsed = MatrixActionPlanIdSchema.safeParse(
      typeof request.params === "object" && request.params !== null
        ? (request.params as { planId?: unknown }).planId
        : undefined
    );

    if (!parsed.success) {
      return sendMatrixError(reply, "invalid_request");
    }

    const lookup = actionStore.readPlan(parsed.data);

    if (lookup.state === "missing") {
      return sendMatrixError(reply, "matrix_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendMatrixError(reply, "matrix_plan_expired");
    }

    const plan = lookup.plan;

    if (plan.status === "executed" && !plan.execution) {
      return sendMatrixError(reply, "matrix_verification_failed");
    }

    try {
      const actual = await deps.client.readRoomTopic(plan.roomId);
      const checkedAt = new Date().toISOString();

      let status: "verified" | "mismatch" | "pending" | "failed" = "pending";

      if (plan.status === "executed") {
        status = actual === null
          ? "failed"
          : actual === plan.diff.after
            ? "verified"
            : "mismatch";
      }

      actionStore.updatePlan(plan.planId, (current) => ({
        ...current,
        verification: {
          planId: current.planId,
          status,
          checkedAt,
          expected: current.diff.after,
          actual
        }
      }));

      return reply.status(200).send({
        ok: true,
        verification: {
          planId: plan.planId,
          status,
          checkedAt,
          expected: plan.diff.after,
          actual
        }
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });
}
