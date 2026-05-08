#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = resolve(repoRoot, ".env");
const defaultBackendHost = "127.0.0.1";
const defaultBackendPort = "8787";

function parseEnvFile(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadRootEnv() {
  if (!existsSync(rootEnvPath)) {
    return {};
  }

  return parseEnvFile(readFileSync(rootEnvPath, "utf8"));
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizeHost(value) {
  const host = String(value ?? "").trim();

  if (!host || host === "0.0.0.0" || host === "::") {
    return defaultBackendHost;
  }

  return host;
}

function normalizePort(value) {
  const port = String(value ?? "").trim();

  return port || defaultBackendPort;
}

function normalizeBackendBaseUrl(env) {
  return `http://${normalizeHost(env.HOST)}:${normalizePort(env.PORT)}`;
}

function normalizeTopicPrefix(value) {
  const prefix = String(value ?? "").replace(/\s+/g, " ").trim();

  return prefix || "MosaicStacked smoke";
}

function buildSmokeTopic(prefix, now = new Date(), randomSuffix = randomBytes(4).toString("hex")) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const normalizedPrefix = normalizeTopicPrefix(prefix);

  return `${normalizedPrefix} ${timestamp} ${randomSuffix}`.trim();
}

function createSmokeError(code, message, phase, extra = {}) {
  return {
    ok: false,
    status: "failed",
    phase,
    error: {
      code,
      message
    },
    ...extra
  };
}

function createSkipResult(missing, reason) {
  return {
    ok: true,
    status: "skipped",
    reason,
    missing
  };
}

function createSuccessResult(extra) {
  return {
    ok: true,
    status: "passed",
    ...extra
  };
}

async function readJsonResponse(response) {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function callBackendJson(fetchImpl, backendBaseUrl, method, path, body) {
  const headers = {
    Accept: "application/json"
  };

  const init = {
    method,
    headers
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;

  try {
    response = await fetchImpl(`${backendBaseUrl}${path}`, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend failure";

    return {
      ok: false,
      error: {
        code: "smoke_backend_unreachable",
        message
      }
    };
  }

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    if (payload && typeof payload === "object" && "ok" in payload && payload.ok === false && "error" in payload) {
      return {
        ok: false,
        error: {
          code: typeof payload.error?.code === "string" ? payload.error.code : "smoke_backend_error",
          message: typeof payload.error?.message === "string" ? payload.error.message : "Matrix backend returned an error"
        }
      };
    }

    return {
      ok: false,
      error: {
        code: "smoke_backend_error",
        message: `Backend returned HTTP ${response.status}`
      }
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: {
        code: "smoke_backend_error",
        message: "Backend returned an invalid JSON payload"
      }
    };
  }

  return {
    ok: true,
    body: payload
  };
}

function readMatrixSmokeConfig(sourceEnv = process.env, options = {}) {
  const fileEnv = options.loadRootEnvFile === false ? {} : loadRootEnv();
  const env = {
    ...fileEnv,
    ...sourceEnv
  };
  const missing = [];
  const homeserverUrl = String(env.MATRIX_BASE_URL ?? env.MATRIX_HOMESERVER_URL ?? "").trim();
  const smokeRoomId = String(env.MATRIX_SMOKE_ROOM_ID ?? env.MATRIX_ROOM_ID ?? "").trim();

  if (!truthy(env.MATRIX_ENABLED)) {
    missing.push("MATRIX_ENABLED=true");
  }

  if (!homeserverUrl) {
    missing.push("MATRIX_BASE_URL or MATRIX_HOMESERVER_URL");
  }

  if (!String(env.MATRIX_ACCESS_TOKEN ?? "").trim()) {
    missing.push("MATRIX_ACCESS_TOKEN");
  }

  if (!smokeRoomId) {
    missing.push("MATRIX_SMOKE_ROOM_ID or MATRIX_ROOM_ID");
  }

  if (missing.length > 0) {
    return {
      state: "skipped",
      reason: "missing_required_env",
      missing
    };
  }

  return {
    state: "ready",
    config: {
      backendBaseUrl: normalizeBackendBaseUrl(env),
      matrixBaseUrl: homeserverUrl,
      matrixAccessToken: String(env.MATRIX_ACCESS_TOKEN).trim(),
      roomId: smokeRoomId,
      topicPrefix: normalizeTopicPrefix(env.MATRIX_SMOKE_TOPIC_PREFIX)
    }
  };
}

async function fetchTopicAccess(fetchImpl, backendBaseUrl, roomId) {
  return callBackendJson(fetchImpl, backendBaseUrl, "GET", `/api/matrix/rooms/${encodeURIComponent(roomId)}/topic-access`);
}

async function analyzeTopic(fetchImpl, backendBaseUrl, roomId, topic) {
  return callBackendJson(fetchImpl, backendBaseUrl, "POST", "/api/matrix/analyze", {
    type: "update_room_topic",
    roomId,
    proposedValue: topic
  });
}

async function fetchPlan(fetchImpl, backendBaseUrl, planId) {
  return callBackendJson(fetchImpl, backendBaseUrl, "GET", `/api/matrix/actions/${planId}`);
}

async function executePlan(fetchImpl, backendBaseUrl, planId) {
  return callBackendJson(fetchImpl, backendBaseUrl, "POST", `/api/matrix/actions/${planId}/execute`, {
    approval: true
  });
}

async function verifyPlan(fetchImpl, backendBaseUrl, planId) {
  return callBackendJson(fetchImpl, backendBaseUrl, "GET", `/api/matrix/actions/${planId}/verify`);
}

function normalizePlanResponse(payload, expectedTopic) {
  if (!payload || typeof payload !== "object" || payload.ok !== true) {
    return null;
  }

  const plan = payload.plan;

  if (!plan || typeof plan !== "object") {
    return null;
  }

  if (plan.status !== "pending_review" && plan.status !== "executed") {
    return null;
  }

  if (Array.isArray(plan.actions) && plan.actions.length > 0) {
    const action = plan.actions[0];

    if (!action || typeof action !== "object" || action.type !== "set_room_topic") {
      return null;
    }

    if (expectedTopic && action.proposedValue !== expectedTopic) {
      return null;
    }

    return plan;
  }

  if (!plan.diff || typeof plan.diff !== "object" || plan.diff.field !== "topic") {
    return null;
  }

  if (expectedTopic && plan.diff.after !== expectedTopic) {
    return null;
  }

  return plan;
}

function readPlanBeforeTopic(plan) {
  if (plan?.diff && typeof plan.diff === "object" && "before" in plan.diff) {
    return plan.diff.before ?? null;
  }

  if ("currentValue" in plan && (typeof plan.currentValue === "string" || plan.currentValue === null)) {
    return plan.currentValue;
  }

  const action = Array.isArray(plan.actions) ? plan.actions[0] : null;

  if (action && typeof action === "object" && (typeof action.currentValue === "string" || action.currentValue === null)) {
    return action.currentValue;
  }

  return null;
}

function normalizeVerificationResponse(payload, expectedTopic) {
  if (!payload || typeof payload !== "object" || payload.ok !== true) {
    return null;
  }

  const verification = payload.verification;

  if (!verification || typeof verification !== "object") {
    return null;
  }

  if (verification.expected !== expectedTopic) {
    return null;
  }

  return verification;
}

function normalizeEvidenceReceipts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) =>
      entry
      && typeof entry === "object"
      && typeof entry.eventType === "string"
      && typeof entry.transactionId === "string"
      && entry.transactionId.trim().length > 0
    )
    .map((entry) => ({
      eventType: entry.eventType,
      transactionId: entry.transactionId
    }));
}

async function runUpdateLifecycle(fetchImpl, backendBaseUrl, roomId, topic, options = {}) {
  const whoamiResult = await callBackendJson(fetchImpl, backendBaseUrl, "GET", "/api/matrix/whoami");

  if (!whoamiResult.ok) {
    return {
      ok: false,
      phase: "whoami",
      error: whoamiResult.error
    };
  }

  const joinedRoomsResult = await callBackendJson(fetchImpl, backendBaseUrl, "GET", "/api/matrix/joined-rooms");

  if (!joinedRoomsResult.ok) {
    return {
      ok: false,
      phase: "joined_rooms",
      error: joinedRoomsResult.error
    };
  }

  const topicAccessResult = await fetchTopicAccess(fetchImpl, backendBaseUrl, roomId);

  if (!topicAccessResult.ok) {
    return {
      ok: false,
      phase: "topic_access",
      error: topicAccessResult.error
    };
  }

  const access = topicAccessResult.body?.access;

  if (!access || typeof access !== "object") {
    return createSmokeError("smoke_backend_error", "Backend returned an invalid topic access result", "topic_access");
  }

  if (access.roomStatus === "not_found") {
    return createSmokeError("matrix_wrong_room_id", "Configured Matrix smoke room does not resolve", "topic_access", { roomId });
  }

  if (!access.joined) {
    return createSmokeError("matrix_not_joined", "Matrix user is not joined to the smoke room", "topic_access", { roomId });
  }

  if (!access.canUpdateTopic) {
    return createSmokeError(
      "matrix_insufficient_power_level",
      "Matrix user lacks room power to update the topic",
      "topic_access",
      {
        roomId,
        access: {
          currentPowerLevel: access.currentPowerLevel ?? null,
          requiredPowerLevel: access.requiredPowerLevel ?? null
        }
      }
    );
  }

  const analyzeResult = await analyzeTopic(fetchImpl, backendBaseUrl, roomId, topic);

  if (!analyzeResult.ok) {
    return {
      ok: false,
      phase: "analyze",
      error: analyzeResult.error
    };
  }

  const plan = normalizePlanResponse(analyzeResult.body, topic);

  if (!plan) {
    return createSmokeError("smoke_backend_error", "Backend returned an invalid plan", "analyze");
  }

  const fetchedPlanResult = await fetchPlan(fetchImpl, backendBaseUrl, plan.planId);

  if (!fetchedPlanResult.ok) {
    return {
      ok: false,
      phase: "fetch_plan",
      error: fetchedPlanResult.error
    };
  }

  const fetchedPlan = normalizePlanResponse(fetchedPlanResult.body, topic);

  if (!fetchedPlan || fetchedPlan.status !== "pending_review") {
    return createSmokeError("smoke_backend_error", "Backend returned an invalid review plan", "fetch_plan");
  }

  const executeResult = await executePlan(fetchImpl, backendBaseUrl, plan.planId);

  if (!executeResult.ok) {
    return {
      ok: false,
      phase: "execute",
      error: executeResult.error
    };
  }

  const executed = executeResult.body;

  if (
    !executed
    || typeof executed !== "object"
    || executed.ok !== true
    || !executed.result
    || typeof executed.result !== "object"
    || executed.result.status !== "executed"
  ) {
    return createSmokeError("smoke_backend_error", "Backend returned an invalid execution result", "execute");
  }

  const verifyResult = await verifyPlan(fetchImpl, backendBaseUrl, plan.planId);

  if (!verifyResult.ok) {
    return {
      ok: false,
      phase: "verify",
      error: verifyResult.error
    };
  }

  const verification = normalizeVerificationResponse(verifyResult.body, topic);

  if (!verification) {
    return createSmokeError("smoke_backend_error", "Backend returned an invalid verification result", "verify");
  }

  const result = {
    roomId,
    planId: plan.planId,
    beforeTopic: readPlanBeforeTopic(plan),
    targetTopic: topic,
    evidence: {
      execute: normalizeEvidenceReceipts(executed.result.evidence),
      verify: normalizeEvidenceReceipts(verification.evidence)
    },
    verification: {
      status: verification.status,
      expected: verification.expected,
      actual: verification.actual
    }
  };

  if (options.keepPlanState === true) {
    return {
      ok: true,
      result
    };
  }

  return {
    ok: true,
    result
  };
}

async function restoreTopic(fetchImpl, backendBaseUrl, roomId, restoreTopicValue) {
  return runUpdateLifecycle(fetchImpl, backendBaseUrl, roomId, restoreTopicValue, {
    keepPlanState: true
  });
}

export function formatMatrixSmokeResult(result) {
  return JSON.stringify(result, null, 2);
}

export async function runMatrixSmoke(options = {}) {
  const fetchedConfig = readMatrixSmokeConfig(options.env ?? process.env, {
    loadRootEnvFile: options.loadRootEnvFile
  });

  if (fetchedConfig.state === "skipped") {
    return createSkipResult(fetchedConfig.missing, fetchedConfig.reason);
  }

  const { backendBaseUrl, roomId, topicPrefix } = fetchedConfig.config;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const randomSuffix = typeof options.randomSuffix === "function"
    ? options.randomSuffix
    : () => randomBytes(4).toString("hex");
  const temporaryTopic = buildSmokeTopic(topicPrefix, now(), randomSuffix());

  const forward = await runUpdateLifecycle(
    options.fetchImpl ?? fetch,
    backendBaseUrl,
    roomId,
    temporaryTopic
  );

  if (!forward.ok) {
    return forward;
  }

  const beforeTopic = forward.result?.beforeTopic ?? null;
  const restoreableTopic = String(beforeTopic ?? "").trim();

  if (!restoreableTopic) {
    return createSmokeError(
      "smoke_cleanup_failed",
      "Previous topic is unavailable for cleanup",
      "cleanup",
      {
        roomId,
        cleanup: {
          restoreTopic: null,
          temporaryTopic
        }
      }
    );
  }

  const restore = await restoreTopic(
    options.fetchImpl ?? fetch,
    backendBaseUrl,
    roomId,
    restoreableTopic
  );

  if (!restore.ok) {
    return {
      ok: false,
      status: "failed",
      phase: "cleanup",
      error: restore.error,
      roomId,
      cleanup: {
        restoreTopic: restoreableTopic,
        temporaryTopic
      }
    };
  }

  return createSuccessResult({
    backendBaseUrl,
    roomId,
    temporaryTopic,
    restorationTopic: restoreableTopic,
    forward: forward.result,
    cleanup: restore.result
  });
}

async function main() {
  const result = await runMatrixSmoke();
  const output = formatMatrixSmokeResult(result);
  const isSkipped = result.ok && result.status === "skipped";

  console.log(output);

  process.exitCode = result.ok || isSkipped ? 0 : 1;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown smoke failure";

    console.error(formatMatrixSmokeResult({
      ok: false,
      status: "failed",
      phase: "main",
      error: {
        code: "smoke_unhandled_error",
        message
      }
    }));

    process.exitCode = 1;
  });
}

