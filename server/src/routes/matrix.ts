import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  MatrixAgentPlan,
  MatrixAnalyzeRequestSchema,
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
import {
  createMatrixEvidenceWriter,
  type MatrixEvidenceInput,
  type MatrixEvidenceWriteWarning
} from "../lib/matrix-evidence-writer.js";
import type { MatrixConfig } from "../lib/matrix-env.js";
import {
  createMatrixActionStore,
  type MatrixActionStore,
  type MatrixActionStoreEntry
} from "../lib/matrix-action-store.js";
import {
  buildMatrixScopeSummaryItems,
  createMatrixScopeStore,
  type MatrixScopeSnapshot,
  type MatrixScopeStore
} from "../lib/matrix-scope-store.js";
import type { AppRateLimiter } from "../lib/rate-limit.js";
import type { RuntimeJournal } from "../lib/runtime-journal.js";
import { assertExecuteFallbackBlocked } from "../lib/workflow-model-router.js";

type MatrixRouteDependencies = {
  config: MatrixConfig;
  client: MatrixClient;
  store?: MatrixScopeStore;
  actionStore?: MatrixActionStore;
  rateLimiter: AppRateLimiter;
  runtimeJournal: RuntimeJournal;
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

function isMatrixAgentPlan(
  plan: MatrixActionStoreEntry
): plan is MatrixActionStoreEntry & MatrixAgentPlan {
  return "actions" in plan;
}

function serializeMatrixAgentPlan(plan: MatrixActionStoreEntry & MatrixAgentPlan): MatrixAgentPlan {
  return {
    planId: plan.planId,
    roomId: plan.roomId,
    scopeId: plan.scopeId,
    snapshotId: plan.snapshotId,
    status: plan.status,
    actions: plan.actions.map((action) => ({
      type: action.type,
      roomId: action.roomId,
      currentValue: action.currentValue,
      proposedValue: action.proposedValue
    })),
    currentValue: plan.currentValue,
    proposedValue: plan.proposedValue,
    risk: plan.risk,
    requiresApproval: true,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt
  };
}

function deriveMatrixAgentRisk(snapshot: MatrixScopeSnapshot | null, currentValue: string | null, proposedValue: string) {
  if (snapshot && snapshot.rooms.length > 1) {
    return "medium" as const;
  }

  if (currentValue !== null && currentValue === proposedValue) {
    return "low" as const;
  }

  if (proposedValue.length > 120) {
    return "medium" as const;
  }

  return "low" as const;
}

function validateSupportedMatrixAgentPlan(plan: MatrixAgentPlan) {
  if (
    plan.actions.length !== 1
    || plan.actions[0]?.type !== "set_room_topic"
    || plan.actions[0]?.roomId !== plan.roomId
    || plan.actions[0]?.currentValue !== plan.currentValue
    || plan.actions[0]?.proposedValue !== plan.proposedValue
  ) {
    return false;
  }

  return true;
}

function evidenceWarnings(warnings: MatrixEvidenceWriteWarning[]) {
  return warnings.length > 0
    ? {
      warnings
    }
    : {};
}

function evidenceReceipts(receipts: Array<{
  eventType: MatrixEvidenceInput["eventType"];
  transactionId: string;
}>) {
  return receipts.length > 0
    ? {
      evidence: receipts
    }
    : {};
}

function planBeforeValue(plan: MatrixActionStoreEntry) {
  return isMatrixAgentPlan(plan) ? plan.currentValue : plan.diff.before;
}

function planAfterValue(plan: MatrixActionStoreEntry) {
  return isMatrixAgentPlan(plan) ? plan.proposedValue : plan.diff.after;
}

function matrixEvidenceActor(config: MatrixConfig) {
  return {
    kind: "backend",
    id: config.expectedUserId ?? "matrix-backend"
  };
}

function matrixEvidenceSource(route: string) {
  return {
    surface: "modelgate",
    route
  };
}

function buildMatrixEvidenceInput(
  deps: MatrixRouteDependencies,
  event: Omit<MatrixEvidenceInput, "actor" | "authorityDomain">
): MatrixEvidenceInput {
  return {
    ...event,
    actor: matrixEvidenceActor(deps.config),
    authorityDomain: "backend"
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

function getRoomRequiredTopicPowerLevel(powerLevels: {
  events: Record<string, number>;
  state_default: number;
}) {
  return powerLevels.events["m.room.topic"] ?? powerLevels.state_default ?? 50;
}

function getRoomUserPowerLevel(
  powerLevels: {
    users: Record<string, number>;
    users_default: number;
  },
  userId: string
) {
  return powerLevels.users[userId] ?? powerLevels.users_default ?? 0;
}

async function readMatrixRoomTopicAccess(
  deps: MatrixRouteDependencies,
  roomId: string
) {
  const identity = await deps.client.whoami();
  assertExpectedMatrixUser(deps.config, identity, "matrix_room_topic_access", `/api/matrix/rooms/${roomId}/topic-access`);

  const joinedRooms = await deps.client.joinedRooms();
  const joined = joinedRooms.some((room) => room.roomId === roomId);

  let roomStatus: "joined" | "not_joined" | "not_found" = joined ? "joined" : "not_joined";
  let currentPowerLevel: number | null = null;
  let requiredPowerLevel: number | null = null;
  let canUpdateTopic = false;

  if (!joined) {
    try {
      await deps.client.readRoomTopic(roomId);
      roomStatus = "not_joined";
    } catch (error) {
      if (error instanceof MatrixClientError && error.code === "matrix_room_not_found") {
        roomStatus = "not_found";
      } else if (error instanceof MatrixClientError && (
        error.code === "matrix_unauthorized"
        || error.code === "matrix_invalid_token"
        || error.code === "matrix_forbidden"
        || error.code === "matrix_write_forbidden"
      )) {
        roomStatus = "not_joined";
      } else {
        throw error;
      }
    }
  } else {
    const powerLevels = await deps.client.readRoomPowerLevels(roomId);
    currentPowerLevel = getRoomUserPowerLevel(powerLevels, identity.userId);
    requiredPowerLevel = getRoomRequiredTopicPowerLevel(powerLevels);
    canUpdateTopic = currentPowerLevel >= requiredPowerLevel;
  }

  return {
    roomId,
    userId: identity.userId,
    roomStatus,
    joined,
    currentPowerLevel,
    requiredPowerLevel,
    canUpdateTopic
  };
}

async function assertMatrixRoomTopicUpdateReady(
  deps: MatrixRouteDependencies,
  roomId: string
) {
  const access = await readMatrixRoomTopicAccess(deps, roomId);

  if (access.roomStatus === "not_found") {
    throw new MatrixClientError({
      code: "matrix_room_not_found",
      status: 404,
      operation: "matrix_room_topic_access",
      path: `/api/matrix/rooms/${roomId}/topic-access`,
      baseUrl: deps.config.baseUrl ?? "unconfigured",
      message: "Matrix room was not found"
    });
  }

  if (!access.joined) {
    throw new MatrixClientError({
      code: "matrix_not_joined",
      status: 403,
      operation: "matrix_room_topic_access",
      path: `/api/matrix/rooms/${roomId}/topic-access`,
      baseUrl: deps.config.baseUrl ?? "unconfigured",
      message: "Matrix user is not joined to the room"
    });
  }

  if (!access.canUpdateTopic) {
    throw new MatrixClientError({
      code: "matrix_insufficient_power_level",
      status: 403,
      operation: "matrix_room_topic_access",
      path: `/api/matrix/rooms/${roomId}/topic-access`,
      baseUrl: deps.config.baseUrl ?? "unconfigured",
      message: "Matrix user lacks room power level to update the topic"
    });
  }

  return access;
}

export function matrixRoutes(app: FastifyInstance, deps: MatrixRouteDependencies) {
  const store = deps.store ?? createMatrixScopeStore();
  const actionStore = deps.actionStore ?? createMatrixActionStore();
  const evidenceWriter = createMatrixEvidenceWriter({
    config: deps.config,
    client: deps.client,
    runtimeJournal: deps.runtimeJournal
  });

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
      const resolutionRequest = {
        roomIds: parsed.data.roomIds,
        spaceIds: parsed.data.spaceIds
      };
      const resolution = await deps.client.resolveScope(resolutionRequest);
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

  app.post("/api/matrix/analyze", async (request, reply) => {
    if (!deps.config.ready) {
      return sendMatrixError(reply, "matrix_not_configured");
    }

    const parsed = MatrixAnalyzeRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendMatrixError(reply, "invalid_request");
    }

    try {
      const identity = await deps.client.whoami();
      assertExpectedMatrixUser(deps.config, identity, "matrix_analyze", "/api/matrix/analyze");

      const scopeSnapshot = parsed.data.scopeId ? store.get(parsed.data.scopeId) : null;

      if (parsed.data.scopeId && !scopeSnapshot) {
        return sendMatrixError(reply, "matrix_scope_not_found");
      }

      if (scopeSnapshot && !scopeSnapshot.rooms.some((room) => room.roomId === parsed.data.roomId)) {
        return sendMatrixError(reply, "matrix_room_not_found");
      }

      await assertMatrixRoomTopicUpdateReady(deps, parsed.data.roomId);
      const currentValue = await deps.client.readRoomTopic(parsed.data.roomId);
      const createdAt = new Date().toISOString();
      const plan = actionStore.createPlan({
        planId: `plan_${randomUUID()}`,
        roomId: parsed.data.roomId,
        scopeId: scopeSnapshot?.scopeId ?? parsed.data.scopeId ?? null,
        snapshotId: scopeSnapshot?.snapshotId ?? null,
        status: "pending_review",
        actions: [
          {
            type: "set_room_topic",
            roomId: parsed.data.roomId,
            currentValue,
            proposedValue: parsed.data.proposedValue
          }
        ],
        currentValue,
        proposedValue: parsed.data.proposedValue,
        risk: deriveMatrixAgentRisk(scopeSnapshot, currentValue, parsed.data.proposedValue),
        requiresApproval: true,
        createdAt,
        expiresAt: new Date(Date.now() + actionStore.ttlMs).toISOString()
      }) as MatrixActionStoreEntry & MatrixAgentPlan;
      const warnings: MatrixEvidenceWriteWarning[] = [];

      if (scopeSnapshot) {
        const provenanceEvidence = await evidenceWriter.write(buildMatrixEvidenceInput(deps, {
          eventType: "matrix_provenance_record",
          planId: plan.planId,
          roomId: plan.roomId,
          scopeId: plan.scopeId,
          snapshotId: plan.snapshotId,
          action: "matrix.analyze",
          status: "created",
          createdAt,
          executedAt: null,
          verifiedAt: null,
          transactionId: null,
          before: { text: currentValue ?? "" },
          after: { text: parsed.data.proposedValue },
          result: {
            ok: true,
            risk: plan.risk
          },
          source: matrixEvidenceSource("POST /api/matrix/analyze")
        }));

        if (provenanceEvidence.ok === false) {
          warnings.push(provenanceEvidence.warning);
        }
      }

      return reply.status(200).send({
        ok: true,
        plan: serializeMatrixAgentPlan(plan),
        ...evidenceWarnings(warnings)
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
            status: "derived"
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

  app.get("/api/matrix/rooms/:roomId/topic-access", async (request, reply) => {
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
      const access = await readMatrixRoomTopicAccess(deps, roomId);

      return reply.status(200).send({
        ok: true,
        access
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

    if (isMatrixAgentPlan(lookup.plan)) {
      return reply.status(200).send({
        ok: true,
        plan: serializeMatrixAgentPlan(lookup.plan)
      });
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

    const limit = deps.rateLimiter.check("matrix_execute", request);

    if (!limit.allowed) {
      reply.header("Retry-After", String(limit.retryAfterSeconds));
      return sendMatrixError(reply, "matrix_rate_limited");
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

    assertExecuteFallbackBlocked({
      workflow: "matrix_analyze",
      fallbackUsed: false,
      allowFallbackOnExecute: false
    });

    try {
      const warnings: MatrixEvidenceWriteWarning[] = [];
      const receipts: Array<{ eventType: MatrixEvidenceInput["eventType"]; transactionId: string }> = [];
      deps.runtimeJournal.append({
        source: "matrix",
        eventType: "matrix_execute_attempted",
        authorityDomain: "matrix",
        severity: "info",
        outcome: "observed",
        planId: plan.planId,
        summary: "Matrix execute attempted",
        safeMetadata: {
          roomId: plan.roomId
        }
      });
      const approvalEvidence = await evidenceWriter.write(buildMatrixEvidenceInput(deps, {
        eventType: "matrix_approval_record",
        planId: plan.planId,
        roomId: plan.roomId,
        scopeId: isMatrixAgentPlan(plan) ? plan.scopeId : null,
        snapshotId: isMatrixAgentPlan(plan) ? plan.snapshotId : null,
        action: "matrix.topic.update",
        status: "approved",
        createdAt: new Date().toISOString(),
        executedAt: null,
        verifiedAt: null,
        transactionId: null,
        before: { text: planBeforeValue(plan) ?? "" },
        after: { text: planAfterValue(plan) },
        result: {
          ok: true
        },
        source: matrixEvidenceSource("POST /api/matrix/actions/:planId/execute")
      }));

      if (approvalEvidence.ok === false) {
        warnings.push(approvalEvidence.warning);

        if (approvalEvidence.required) {
          return sendMatrixError(reply, "matrix_unavailable", "Matrix evidence write failed");
        }
      } else if (approvalEvidence.transactionId) {
        receipts.push({
          eventType: "matrix_approval_record",
          transactionId: approvalEvidence.transactionId
        });
      }

      await assertMatrixRoomTopicUpdateReady(deps, plan.roomId);
      const currentTopic = await deps.client.readRoomTopic(plan.roomId);

      if (isMatrixAgentPlan(plan)) {
        if (!validateSupportedMatrixAgentPlan(plan)) {
          return sendMatrixError(reply, "invalid_request");
        }

        if (currentTopic !== plan.currentValue) {
          return sendMatrixError(reply, "matrix_stale_plan");
        }

        const executedAt = new Date().toISOString();
        const transaction = await deps.client.updateRoomTopic(plan.roomId, plan.proposedValue);

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
        deps.runtimeJournal.append({
          source: "matrix",
          eventType: "matrix_execute_completed",
          authorityDomain: "matrix",
          severity: "info",
          outcome: "executed",
          planId: plan.planId,
          executionId: transaction.transactionId,
          summary: "Matrix execute completed",
          safeMetadata: {
            roomId: plan.roomId
          }
        });
        const topicEvidence = await evidenceWriter.write(buildMatrixEvidenceInput(deps, {
          eventType: "matrix_topic_change_record",
          planId: plan.planId,
          roomId: plan.roomId,
          scopeId: plan.scopeId,
          snapshotId: plan.snapshotId,
          action: "matrix.topic.update",
          status: "executed",
          createdAt: plan.createdAt,
          executedAt,
          verifiedAt: null,
          transactionId: transaction.transactionId,
          before: { text: plan.currentValue ?? "" },
          after: { text: plan.proposedValue },
          result: {
            ok: true
          },
          source: matrixEvidenceSource("POST /api/matrix/actions/:planId/execute")
        }));

        if (topicEvidence.ok === false) {
          warnings.push(topicEvidence.warning);
        } else if (topicEvidence.transactionId) {
          receipts.push({
            eventType: "matrix_topic_change_record",
            transactionId: topicEvidence.transactionId
          });
        }

        return reply.status(200).send({
          ok: true,
          result: {
            planId: plan.planId,
            status: "executed",
            executedAt,
            transactionId: transaction.transactionId,
            ...evidenceReceipts(receipts),
            ...evidenceWarnings(warnings)
          }
        });
      }

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
      deps.runtimeJournal.append({
        source: "matrix",
        eventType: "matrix_execute_completed",
        authorityDomain: "matrix",
        severity: "info",
        outcome: "executed",
        planId: plan.planId,
        executionId: transaction.transactionId,
        summary: "Matrix execute completed",
        safeMetadata: {
          roomId: plan.roomId
        }
      });
      const topicEvidence = await evidenceWriter.write(buildMatrixEvidenceInput(deps, {
        eventType: "matrix_topic_change_record",
        planId: plan.planId,
        roomId: plan.roomId,
        scopeId: null,
        snapshotId: null,
        action: "matrix.topic.update",
        status: "executed",
        createdAt: plan.createdAt,
        executedAt,
        verifiedAt: null,
        transactionId: transaction.transactionId,
        before: { text: plan.diff.before ?? "" },
        after: { text: plan.diff.after },
        result: {
          ok: true
        },
        source: matrixEvidenceSource("POST /api/matrix/actions/:planId/execute")
      }));

      if (topicEvidence.ok === false) {
        warnings.push(topicEvidence.warning);
      } else if (topicEvidence.transactionId) {
        receipts.push({
          eventType: "matrix_topic_change_record",
          transactionId: topicEvidence.transactionId
        });
      }

      return reply.status(200).send({
        ok: true,
        result: {
          planId: plan.planId,
          status: "executed",
          executedAt,
          transactionId: transaction.transactionId,
          ...evidenceReceipts(receipts),
          ...evidenceWarnings(warnings)
        }
      });
    } catch (error) {
      deps.runtimeJournal.append({
        source: "matrix",
        eventType: "matrix_execute_failed",
        authorityDomain: "matrix",
        severity: "error",
        outcome: "failed",
        planId: plan.planId,
        summary: "Matrix execute failed",
        safeMetadata: {
          roomId: plan.roomId
        }
      });
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
      const warnings: MatrixEvidenceWriteWarning[] = [];
      const receipts: Array<{ eventType: MatrixEvidenceInput["eventType"]; transactionId: string }> = [];

      let status: "verified" | "mismatch" | "pending" | "failed" = "pending";
      const expected = isMatrixAgentPlan(plan) ? plan.proposedValue : plan.diff.after;

      if (plan.status === "executed") {
        status = actual === null
          ? "failed"
          : actual === expected
            ? "verified"
            : "mismatch";
      }

      actionStore.updatePlan(plan.planId, (current) => ({
        ...current,
        verification: {
          planId: current.planId,
          status,
          checkedAt,
          expected: isMatrixAgentPlan(current) ? current.proposedValue : current.diff.after,
          actual
        }
      }));
      deps.runtimeJournal.append({
        source: "matrix",
        eventType: "matrix_verify_result",
        authorityDomain: "matrix",
        severity: status === "verified" ? "info" : status === "mismatch" ? "warning" : "warning",
        outcome: status === "verified" ? "verified" : status === "mismatch" ? "unverifiable" : status === "failed" ? "failed" : "observed",
        planId: plan.planId,
        verificationId: checkedAt,
        summary: `Matrix verify ${status}`,
        safeMetadata: {
          roomId: plan.roomId
        }
      });
      const verificationEvidence = await evidenceWriter.write(buildMatrixEvidenceInput(deps, {
        eventType: "matrix_verification_result",
        planId: plan.planId,
        roomId: plan.roomId,
        scopeId: isMatrixAgentPlan(plan) ? plan.scopeId : null,
        snapshotId: isMatrixAgentPlan(plan) ? plan.snapshotId : null,
        action: "matrix.verify",
        status,
        createdAt: plan.createdAt,
        executedAt: plan.execution?.executedAt ?? null,
        verifiedAt: checkedAt,
        transactionId: plan.execution?.transactionId ?? null,
        before: { text: expected },
        after: { text: actual ?? "" },
        result: {
          ok: status === "verified",
          status
        },
        source: matrixEvidenceSource("GET /api/matrix/actions/:planId/verify")
      }));

      if (verificationEvidence.ok === false) {
        warnings.push(verificationEvidence.warning);
      } else if (verificationEvidence.transactionId) {
        receipts.push({
          eventType: "matrix_verification_result",
          transactionId: verificationEvidence.transactionId
        });
      }

      return reply.status(200).send({
        ok: true,
        verification: {
          planId: plan.planId,
          status,
          checkedAt,
          expected,
          actual,
          ...evidenceReceipts(receipts),
          ...evidenceWarnings(warnings)
        }
      });
    } catch (error) {
      return handleMatrixError(reply, error);
    }
  });
}
