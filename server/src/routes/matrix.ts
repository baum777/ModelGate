import type { FastifyInstance, FastifyReply } from "fastify";
import {
  MatrixScopeResolveRequestSchema,
  type MatrixWhoAmIResponse,
  buildMatrixErrorResponse,
  matrixErrorStatus,
  type MatrixErrorCode
} from "../lib/matrix-contract.js";
import { MatrixClientError, type MatrixClient } from "../lib/matrix-client.js";
import type { MatrixConfig } from "../lib/matrix-env.js";
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
}
