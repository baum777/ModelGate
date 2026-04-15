const runtimeEnv = typeof import.meta !== "undefined" && "env" in import.meta
  ? (import.meta.env as { VITE_MATRIX_API_BASE_URL?: string; VITE_API_BASE_URL?: string; PROD?: boolean } | undefined)
  : undefined;

export const MATRIX_API_BASE_URL = (
  runtimeEnv?.VITE_MATRIX_API_BASE_URL
  ?? runtimeEnv?.VITE_API_BASE_URL
  ?? (runtimeEnv?.PROD ? "" : "http://127.0.0.1:8787")
).replace(/\/+$/, "");

function resolveMatrixApiUrl(path: string) {
  return MATRIX_API_BASE_URL ? `${MATRIX_API_BASE_URL}${path}` : path;
}

export const MATRIX_ACTION_TYPES = [
  "set_room_name",
  "set_room_topic",
  "add_room_alias",
  "attach_child_room",
  "detach_child_room",
  "create_room"
] as const;

export type MatrixActionType = (typeof MATRIX_ACTION_TYPES)[number];

export type MatrixRequestErrorKind = "network" | "http" | "parse";

export class MatrixRequestError extends Error {
  readonly kind: MatrixRequestErrorKind;

  readonly operation: string;

  readonly baseUrl: string;

  readonly path: string;

  readonly status: number | null;

  readonly code: string | null;

  constructor(options: {
    kind: MatrixRequestErrorKind;
    operation: string;
    baseUrl: string;
    path: string;
    message: string;
    status?: number | null;
    code?: string | null;
  }) {
    super(options.message);
    this.name = "MatrixRequestError";
    this.kind = options.kind;
    this.operation = options.operation;
    this.baseUrl = options.baseUrl;
    this.path = options.path;
    this.status = options.status ?? null;
    this.code = options.code ?? null;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type MatrixWhoAmI = {
  userId: string;
  deviceId: string | null;
  homeserver: string;
};

export type MatrixJoinedRoom = {
  roomId: string;
  name: string | null;
  canonicalAlias: string | null;
  roomType: string | null;
};

export type MatrixScope = {
  scopeId: string;
  type: "space" | "room" | "mixed";
  rooms: Array<{
    roomId: string;
    name: string | null;
    canonicalAlias: string | null;
    roomType: string | null;
  }>;
  createdAt: string;
};

export type MatrixScopeSummaryItem = {
  roomId: string;
  name: string | null;
  canonicalAlias: string | null;
  members: number;
  freshnessMs: number;
  lastEventSummary: string;
  selected: boolean;
};

export type MatrixScopeSummary = {
  ok: true;
  scopeId: string;
  snapshotId: string;
  generatedAt: string;
  items: MatrixScopeSummaryItem[];
};

export type MatrixHierarchyItem = {
  room_id?: string;
  name?: string;
  canonical_alias?: string;
  room_type?: string;
  [key: string]: unknown;
};

export type MatrixSpaceHierarchy = {
  ok: true;
  spaceId: string;
  rooms?: MatrixHierarchyItem[];
  [key: string]: unknown;
};

export type MatrixProvenanceSignature = {
  signer: string;
  status: string;
};

export type MatrixProvenance = {
  ok: true;
  roomId: string;
  snapshotId: string | null;
  stateEventId: string | null;
  originServer: string;
  authChainIndex: number;
  signatures: MatrixProvenanceSignature[];
  integrityNotice: string;
};

export type MatrixReference = {
  type: string;
  roomId: string;
  label: string;
};

export type MatrixActionCandidate = {
  candidateId: string;
  type: MatrixActionType;
  targetRoomId: string;
  summary: string;
  rationale: string;
  requiresPromotion: true;
  payload?: Record<string, unknown>;
};

export type MatrixAnalysisResponse = {
  ok: true;
  snapshotId: string;
  response: {
    role: "assistant";
    content: string;
  };
  references: MatrixReference[];
  actionCandidates: MatrixActionCandidate[];
};

export type MatrixPlan = {
  planId: string;
  type: MatrixActionType;
  targetRoomId: string;
  summary: string;
  rationale: string;
  requiredApproval: true;
  stale: boolean;
  payloadDelta: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  impactSummary: string[];
  riskLevel: "low_surface" | "medium_surface" | "high_surface";
  expectedPermissions: string[];
  authorizationRequirements: string[];
  preflightStatus: "passed" | "failed" | "unknown";
  snapshotId: string;
  scopeId: string;
};

export type MatrixExecutionResult = {
  executionId: string;
  planId: string;
  status: "success" | "failed";
  verified: boolean;
  verificationSummary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type MatrixExecuteResult = {
  ok: true;
  result: MatrixExecutionResult;
};

export type MatrixRoomTopicPlan = {
  planId: string;
  type: "update_room_topic";
  roomId: string;
  status: "pending_review" | "executed";
  createdAt: string;
  expiresAt: string;
  diff: {
    field: "topic";
    before: string | null;
    after: string;
  };
  requiresApproval: true;
};

export type MatrixRoomTopicExecutionResult = {
  planId: string;
  status: "executed";
  executedAt: string;
  transactionId: string;
};

export type MatrixRoomTopicVerificationResult = {
  planId: string;
  status: "verified" | "mismatch" | "pending" | "failed";
  checkedAt: string;
  expected: string;
  actual: string | null;
};

type MatrixValidator<T> = (payload: unknown, operation: string, path: string) => T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failMatrixParse(operation: string, path: string, message: string): never {
  throw new MatrixRequestError({
    kind: "parse",
    operation,
    baseUrl: MATRIX_API_BASE_URL,
    path,
    message
  });
}

function requireRecord(payload: unknown, operation: string, path: string, label = "payload") {
  if (!isRecord(payload)) {
    failMatrixParse(operation, path, `Matrix ${label} must be a JSON object`);
  }

  return payload;
}

function requireField(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  if (!(field in obj)) {
    failMatrixParse(operation, path, `Matrix payload missing ${field}`);
  }

  return obj[field];
}

function requireStringField(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  const value = requireField(obj, field, operation, path);

  if (typeof value !== "string" || value.trim().length === 0) {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be a non-empty string`);
  }

  return value;
}

function requireNullableStringField(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  const value = requireField(obj, field, operation, path);

  if (value !== null && (typeof value !== "string" || value.trim().length === 0)) {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be a string or null`);
  }

  return value as string | null;
}

function requireStringFieldAllowEmpty(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  const value = requireField(obj, field, operation, path);

  if (typeof value !== "string") {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be a string`);
  }

  return value;
}

function requireNullableStringFieldAllowEmpty(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  const value = requireField(obj, field, operation, path);

  if (value !== null && typeof value !== "string") {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be a string or null`);
  }

  return value as string | null;
}

function requireNumberField(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  const value = requireField(obj, field, operation, path);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be a finite number`);
  }

  return value;
}

function requireBooleanField(obj: Record<string, unknown>, field: string, operation: string, path: string, expected: boolean) {
  const value = requireField(obj, field, operation, path);

  if (value !== expected) {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be ${expected}`);
  }

  return value;
}

function requireArrayField(obj: Record<string, unknown>, field: string, operation: string, path: string) {
  const value = requireField(obj, field, operation, path);

  if (!Array.isArray(value)) {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be an array`);
  }

  return value;
}

function requireOneOfField<T extends string>(obj: Record<string, unknown>, field: string, allowed: readonly T[], operation: string, path: string) {
  const value = requireStringField(obj, field, operation, path);

  if (!allowed.includes(value as T)) {
    failMatrixParse(operation, path, `Matrix payload field ${field} must be one of: ${allowed.join(", ")}`);
  }

  return value as T;
}

function validateJoinedRoom(payload: unknown, operation: string, path: string) {
  const room = requireRecord(payload, operation, path, "room");
  requireStringField(room, "roomId", operation, path);
  requireNullableStringField(room, "name", operation, path);
  requireNullableStringField(room, "canonicalAlias", operation, path);
  requireNullableStringField(room, "roomType", operation, path);
  return room as MatrixJoinedRoom;
}

function validateScopeSummaryItem(payload: unknown, operation: string, path: string) {
  const item = requireRecord(payload, operation, path, "scope summary item");
  requireStringField(item, "roomId", operation, path);
  requireNullableStringField(item, "name", operation, path);
  requireNullableStringField(item, "canonicalAlias", operation, path);
  requireNumberField(item, "members", operation, path);
  requireNumberField(item, "freshnessMs", operation, path);
  requireStringField(item, "lastEventSummary", operation, path);
  const selected = requireField(item, "selected", operation, path);

  if (typeof selected !== "boolean") {
    failMatrixParse(operation, path, "Matrix payload field selected must be a boolean");
  }

  return item as MatrixScopeSummaryItem;
}

function validateHierarchyItem(payload: unknown, operation: string, path: string) {
  const item = requireRecord(payload, operation, path, "hierarchy item");

  if ("room_id" in item && item.room_id !== undefined && typeof item.room_id !== "string") {
    failMatrixParse(operation, path, "Matrix hierarchy item room_id must be a string when present");
  }
  if ("name" in item && item.name !== undefined && typeof item.name !== "string") {
    failMatrixParse(operation, path, "Matrix hierarchy item name must be a string when present");
  }
  if ("canonical_alias" in item && item.canonical_alias !== undefined && typeof item.canonical_alias !== "string") {
    failMatrixParse(operation, path, "Matrix hierarchy item canonical_alias must be a string when present");
  }
  if ("room_type" in item && item.room_type !== undefined && typeof item.room_type !== "string") {
    failMatrixParse(operation, path, "Matrix hierarchy item room_type must be a string when present");
  }

  return item as MatrixHierarchyItem;
}

function validateMatrixWhoAmI(payload: unknown, operation: string, path: string): MatrixWhoAmI {
  const whoami = requireRecord(payload, operation, path, "whoami response");
  const userId = requireStringField(whoami, "userId", operation, path);
  const deviceId = requireNullableStringField(whoami, "deviceId", operation, path);
  const homeserver = requireStringField(whoami, "homeserver", operation, path);

  return {
    userId,
    deviceId,
    homeserver
  };
}

function validateJoinedRoomsResponse(payload: unknown, operation: string, path: string): MatrixJoinedRoom[] {
  const response = requireRecord(payload, operation, path, "joined rooms response");
  requireBooleanField(response, "ok", operation, path, true);
  return requireArrayField(response, "rooms", operation, path).map((room, index) =>
    validateJoinedRoom(room, operation, `${path}#rooms[${index}]`)
  );
}

function validateSpaceHierarchyResponse(payload: unknown, operation: string, path: string): MatrixSpaceHierarchy {
  const response = requireRecord(payload, operation, path, "hierarchy response");
  requireBooleanField(response, "ok", operation, path, true);
  const spaceId = requireStringField(response, "spaceId", operation, path);
  const rooms = "rooms" in response && response.rooms !== undefined
    ? (() => {
        if (!Array.isArray(response.rooms)) {
          failMatrixParse(operation, path, "Matrix hierarchy response field rooms must be an array when present");
        }

        return response.rooms.map((room, index) =>
          validateHierarchyItem(room, operation, `${path}#rooms[${index}]`)
        );
      })()
    : undefined;

  return {
    ok: true,
    spaceId,
    ...(rooms !== undefined ? { rooms } : {})
  };
}

function validateScopeResponse(payload: unknown, operation: string, path: string): MatrixScope {
  const response = requireRecord(payload, operation, path, "scope response");
  const scopeId = requireStringField(response, "scopeId", operation, path);
  const type = requireOneOfField(response, "type", ["space", "room", "mixed"], operation, path);
  const rooms = requireArrayField(response, "rooms", operation, path).map((room, index) => {
    const item = requireRecord(room, operation, `${path}#rooms[${index}]`, "scope room");
    const roomId = requireStringField(item, "roomId", operation, `${path}#rooms[${index}]`);
    const name = requireNullableStringField(item, "name", operation, `${path}#rooms[${index}]`);
    const canonicalAlias = requireNullableStringField(item, "canonicalAlias", operation, `${path}#rooms[${index}]`);
    const roomType = requireNullableStringField(item, "roomType", operation, `${path}#rooms[${index}]`);

    return {
      roomId,
      name,
      canonicalAlias,
      roomType
    };
  });
  const createdAt = requireStringField(response, "createdAt", operation, path);

  return {
    scopeId,
    type,
    rooms,
    createdAt
  };
}

function validateScopeSummaryResponse(payload: unknown, operation: string, path: string): MatrixScopeSummary {
  const response = requireRecord(payload, operation, path, "scope summary response");
  requireBooleanField(response, "ok", operation, path, true);
  const scopeId = requireStringField(response, "scopeId", operation, path);
  const snapshotId = requireStringField(response, "snapshotId", operation, path);
  const generatedAt = requireStringField(response, "generatedAt", operation, path);
  const items = requireArrayField(response, "items", operation, path).map((item, index) =>
    validateScopeSummaryItem(item, operation, `${path}#items[${index}]`)
  );

  return {
    ok: true,
    scopeId,
    snapshotId,
    generatedAt,
    items
  };
}

function validateProvenanceResponse(payload: unknown, operation: string, path: string): MatrixProvenance {
  const response = requireRecord(payload, operation, path, "provenance response");
  requireBooleanField(response, "ok", operation, path, true);
  const roomId = requireStringField(response, "roomId", operation, path);
  const snapshotId = requireNullableStringField(response, "snapshotId", operation, path);
  const stateEventId = requireNullableStringField(response, "stateEventId", operation, path);
  const originServer = requireStringField(response, "originServer", operation, path);
  const authChainIndex = requireNumberField(response, "authChainIndex", operation, path);
  const signatures = requireArrayField(response, "signatures", operation, path).map((signature, index) => {
    const item = requireRecord(signature, operation, `${path}#signatures[${index}]`, "signature");
    const signer = requireStringField(item, "signer", operation, `${path}#signatures[${index}]`);
    const status = requireStringField(item, "status", operation, `${path}#signatures[${index}]`);

    return {
      signer,
      status
    };
  });
  const integrityNotice = requireStringField(response, "integrityNotice", operation, path);

  return {
    ok: true,
    roomId,
    snapshotId,
    stateEventId,
    originServer,
    authChainIndex,
    signatures,
    integrityNotice
  };
}

function validateAnalysisResponse(payload: unknown, operation: string, path: string): MatrixAnalysisResponse {
  const response = requireRecord(payload, operation, path, "analysis response");
  requireBooleanField(response, "ok", operation, path, true);
  const snapshotId = requireStringField(response, "snapshotId", operation, path);
  const analysis = requireRecord(requireField(response, "response", operation, path), operation, path, "analysis response.response");
  const role = requireStringField(analysis, "role", operation, path);

  if (role !== "assistant") {
    failMatrixParse(operation, path, "Matrix analysis response.response.role must be assistant");
  }

  const content = requireStringField(analysis, "content", operation, path);
  const references = requireArrayField(response, "references", operation, path).map((reference, index) => {
    const item = requireRecord(reference, operation, `${path}#references[${index}]`, "reference");
    const type = requireStringField(item, "type", operation, `${path}#references[${index}]`);
    const roomId = requireStringField(item, "roomId", operation, `${path}#references[${index}]`);
    const label = requireStringField(item, "label", operation, `${path}#references[${index}]`);

    return {
      type,
      roomId,
      label
    };
  });
  const actionCandidates = requireArrayField(response, "actionCandidates", operation, path).map((candidate, index) => {
    const item = requireRecord(candidate, operation, `${path}#actionCandidates[${index}]`, "action candidate");
    const candidateId = requireStringField(item, "candidateId", operation, `${path}#actionCandidates[${index}]`);
    const type = requireOneOfField(item, "type", MATRIX_ACTION_TYPES, operation, `${path}#actionCandidates[${index}]`);
    const targetRoomId = requireStringField(item, "targetRoomId", operation, `${path}#actionCandidates[${index}]`);
    const summary = requireStringField(item, "summary", operation, `${path}#actionCandidates[${index}]`);
    const rationale = requireStringField(item, "rationale", operation, `${path}#actionCandidates[${index}]`);
    requireBooleanField(item, "requiresPromotion", operation, `${path}#actionCandidates[${index}]`, true);

    if ("payload" in item && item.payload !== undefined && !isRecord(item.payload)) {
      failMatrixParse(operation, path, "Matrix action candidate payload must be an object when present");
    }

    return {
      candidateId,
      type,
      targetRoomId,
      summary,
      rationale,
      requiresPromotion: true as const,
      ...(item.payload !== undefined ? { payload: item.payload as Record<string, unknown> } : {})
    };
  });

  return {
    ok: true,
    snapshotId,
    response: {
      role: "assistant",
      content
    },
    references,
    actionCandidates
  };
}

function validatePlanResponse(payload: unknown, operation: string, path: string): MatrixPlan {
  const response = requireRecord(payload, operation, path, "plan response");
  const planId = requireStringField(response, "planId", operation, path);
  const type = requireOneOfField(response, "type", MATRIX_ACTION_TYPES, operation, path);
  const targetRoomId = requireStringField(response, "targetRoomId", operation, path);
  const summary = requireStringField(response, "summary", operation, path);
  const rationale = requireStringField(response, "rationale", operation, path);
  requireBooleanField(response, "requiredApproval", operation, path, true);
  const stale = requireField(response, "stale", operation, path);

  if (typeof stale !== "boolean") {
    failMatrixParse(operation, path, "Matrix plan field stale must be a boolean");
  }

  const payloadDelta = requireRecord(requireField(response, "payloadDelta", operation, path), operation, path, "plan payloadDelta");
  const before = requireRecord(requireField(payloadDelta, "before", operation, path), operation, path, "plan payloadDelta.before");
  const after = requireRecord(requireField(payloadDelta, "after", operation, path), operation, path, "plan payloadDelta.after");
  const impactSummary = requireArrayField(response, "impactSummary", operation, path);

  if (!impactSummary.every((item) => typeof item === "string")) {
    failMatrixParse(operation, path, "Matrix plan impactSummary must be an array of strings");
  }

  const riskLevel = requireOneOfField(response, "riskLevel", ["low_surface", "medium_surface", "high_surface"], operation, path);
  const expectedPermissions = requireArrayField(response, "expectedPermissions", operation, path);

  if (!expectedPermissions.every((item) => typeof item === "string")) {
    failMatrixParse(operation, path, "Matrix plan expectedPermissions must be an array of strings");
  }

  const authorizationRequirements = requireArrayField(response, "authorizationRequirements", operation, path);

  if (!authorizationRequirements.every((item) => typeof item === "string")) {
    failMatrixParse(operation, path, "Matrix plan authorizationRequirements must be an array of strings");
  }

  const preflightStatus = requireOneOfField(response, "preflightStatus", ["passed", "failed", "unknown"], operation, path);
  const snapshotId = requireStringField(response, "snapshotId", operation, path);
  const scopeId = requireStringField(response, "scopeId", operation, path);

  return {
    planId,
    type,
    targetRoomId,
    summary,
    rationale,
    requiredApproval: true,
    stale,
    payloadDelta: {
      before,
      after
    },
    impactSummary: impactSummary as string[],
    riskLevel,
    expectedPermissions: expectedPermissions as string[],
    authorizationRequirements: authorizationRequirements as string[],
    preflightStatus,
    snapshotId,
    scopeId
  };
}

function validateExecutionResponse(payload: unknown, operation: string, path: string): MatrixExecuteResult {
  const response = requireRecord(payload, operation, path, "execution response");
  requireBooleanField(response, "ok", operation, path, true);
  const result = requireRecord(requireField(response, "result", operation, path), operation, path, "execution result");
  const executionId = requireStringField(result, "executionId", operation, path);
  const planId = requireStringField(result, "planId", operation, path);
  const status = requireOneOfField(result, "status", ["success", "failed"], operation, path);
  requireBooleanField(result, "verified", operation, path, true);
  const verificationSummary = requireStringField(result, "verificationSummary", operation, path);
  const before = requireRecord(requireField(result, "before", operation, path), operation, path, "execution result.before");
  const after = requireRecord(requireField(result, "after", operation, path), operation, path, "execution result.after");

  return {
    ok: true,
    result: {
      executionId,
      planId,
      status,
      verified: true,
      verificationSummary,
      before,
      after
    }
  };
}

function validateRoomTopicPlanResponse(payload: unknown, operation: string, path: string): MatrixRoomTopicPlan {
  const response = requireRecord(payload, operation, path, "room topic plan response");
  requireBooleanField(response, "ok", operation, path, true);
  const plan = requireRecord(requireField(response, "plan", operation, path), operation, path, "room topic plan");
  const planId = requireStringField(plan, "planId", operation, path);
  const type = requireStringField(plan, "type", operation, path);
  const roomId = requireStringField(plan, "roomId", operation, path);
  const status = requireOneOfField(plan, "status", ["pending_review", "executed"], operation, path);
  const createdAt = requireStringField(plan, "createdAt", operation, path);
  const expiresAt = requireStringField(plan, "expiresAt", operation, path);
  const diff = requireRecord(requireField(plan, "diff", operation, path), operation, path, "room topic diff");
  const field = requireStringField(diff, "field", operation, path);
  const before = requireNullableStringFieldAllowEmpty(diff, "before", operation, path);
  const after = requireStringFieldAllowEmpty(diff, "after", operation, path);
  requireBooleanField(plan, "requiresApproval", operation, path, true);

  if (type !== "update_room_topic" || field !== "topic") {
    failMatrixParse(operation, path, "Matrix room topic plan fields are invalid");
  }

  return {
    planId,
    type: "update_room_topic",
    roomId,
    status,
    createdAt,
    expiresAt,
    diff: {
      field: "topic",
      before,
      after
    },
    requiresApproval: true
  };
}

function validateRoomTopicExecutionResponse(payload: unknown, operation: string, path: string): MatrixRoomTopicExecutionResult {
  const response = requireRecord(payload, operation, path, "room topic execution response");
  requireBooleanField(response, "ok", operation, path, true);
  const result = requireRecord(requireField(response, "result", operation, path), operation, path, "room topic execution result");
  const planId = requireStringField(result, "planId", operation, path);
  const status = requireOneOfField(result, "status", ["executed"], operation, path);
  const executedAt = requireStringField(result, "executedAt", operation, path);
  const transactionId = requireStringField(result, "transactionId", operation, path);

  return {
    planId,
    status,
    executedAt,
    transactionId
  };
}

function validateRoomTopicVerificationResponse(payload: unknown, operation: string, path: string): MatrixRoomTopicVerificationResult {
  const response = requireRecord(payload, operation, path, "room topic verification response");
  requireBooleanField(response, "ok", operation, path, true);
  const verification = requireRecord(requireField(response, "verification", operation, path), operation, path, "room topic verification");
  const planId = requireStringField(verification, "planId", operation, path);
  const status = requireOneOfField(verification, "status", ["verified", "mismatch", "pending", "failed"], operation, path);
  const checkedAt = requireStringField(verification, "checkedAt", operation, path);
  const expected = requireStringFieldAllowEmpty(verification, "expected", operation, path);
  const actual = requireNullableStringFieldAllowEmpty(verification, "actual", operation, path);

  return {
    planId,
    status,
    checkedAt,
    expected,
    actual
  };
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Request failed";
  }

  const candidate = payload as {
    message?: unknown;
    error?: unknown;
  };

  if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
    return candidate.message;
  }

  const error = candidate.error;

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const nestedMessage = (error as { message?: unknown }).message;

    if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
      return nestedMessage;
    }
  }

  return "Request failed";
}

function extractErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    code?: unknown;
    error?: unknown;
  };

  if (typeof candidate.code === "string" && candidate.code.trim().length > 0) {
    return candidate.code;
  }

  const error = candidate.error;

  if (error && typeof error === "object") {
    const nestedCode = (error as { code?: unknown }).code;

    if (typeof nestedCode === "string" && nestedCode.trim().length > 0) {
      return nestedCode;
    }
  }

  return null;
}

async function readErrorDetails(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json() as unknown;
      return {
        message: extractErrorMessage(payload),
        code: extractErrorCode(payload)
      };
    } catch {
      return {
        message: response.statusText || "Request failed",
        code: null
      };
    }
  }

  const text = await response.text();
  return {
    message: text.trim() || response.statusText || "Request failed",
    code: null
  };
}

async function requestJson<T>(operation: string, path: string, init: RequestInit = {}, validate?: MatrixValidator<T>): Promise<T> {
  const headers = new Headers(init.headers ?? {});

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(resolveMatrixApiUrl(path), {
      ...init,
      headers
    });
  } catch (error) {
    throw new MatrixRequestError({
      kind: "network",
      operation,
      baseUrl: MATRIX_API_BASE_URL,
      path,
      message: error instanceof Error && error.message.trim().length > 0 ? error.message : "Network request failed"
    });
  }

  if (!response.ok) {
    const details = await readErrorDetails(response);

    throw new MatrixRequestError({
      kind: "http",
      operation,
      baseUrl: MATRIX_API_BASE_URL,
      path,
      status: response.status,
      code: details.code,
      message: details.message
    });
  }

  try {
    const payload = await response.json() as unknown;
    return validate ? validate(payload, operation, path) : payload as T;
  } catch (error) {
    throw new MatrixRequestError({
      kind: "parse",
      operation,
      baseUrl: MATRIX_API_BASE_URL,
      path,
      message: error instanceof Error && error.message.trim().length > 0 ? error.message : "Failed to parse Matrix response"
    });
  }
}

export async function fetchMatrixWhoAmI() {
  return requestJson<MatrixWhoAmI>("Matrix whoami", "/api/matrix/whoami", {}, validateMatrixWhoAmI);
}

export async function fetchJoinedRooms() {
  return requestJson<MatrixJoinedRoom[]>("Matrix joined rooms", "/api/matrix/joined-rooms", {}, validateJoinedRoomsResponse);
}

export async function fetchRoomHierarchy(roomId: string) {
  return requestJson<MatrixSpaceHierarchy>("Matrix hierarchy", `/api/matrix/spaces/${encodeURIComponent(roomId)}/hierarchy`, {}, validateSpaceHierarchyResponse);
}

export async function resolveScope(body: { roomIds: string[]; spaceIds: string[] }) {
  const payload = await requestJson<{ ok: true; scope: MatrixScope }>("Matrix scope resolve", "/api/matrix/scope/resolve", {
    method: "POST",
    body: JSON.stringify(body)
  }, (payload, operation, path) => {
    const response = requireRecord(payload, operation, path, "scope resolve response");
    requireBooleanField(response, "ok", operation, path, true);
    const scopePayload = requireRecord(requireField(response, "scope", operation, path), operation, path, "scope");

    return {
      ok: true as const,
      scope: validateScopeResponse(scopePayload, operation, `${path}#scope`)
    };
  });

  return payload.scope;
}

export async function fetchScopeSummary(scopeId: string) {
  return requestJson<MatrixScopeSummary>("Matrix scope summary", `/api/matrix/scope/${encodeURIComponent(scopeId)}/summary`, {}, validateScopeSummaryResponse);
}

export async function fetchProvenance(roomId: string) {
  return requestJson<MatrixProvenance>("Matrix provenance", `/api/matrix/rooms/${encodeURIComponent(roomId)}/provenance`, {}, validateProvenanceResponse);
}

export async function analyzeScope(body: { scopeId: string; prompt: string; model?: string }) {
  return requestJson<MatrixAnalysisResponse>("Matrix analysis", "/api/matrix/chat", {
    method: "POST",
    body: JSON.stringify(body)
  }, validateAnalysisResponse);
}

export async function promoteCandidate(body: { candidateId: string; scopeId: string; snapshotId: string }) {
  const payload = await requestJson<{ ok: true; plan: MatrixPlan }>("Matrix promote", "/api/matrix/actions/promote", {
    method: "POST",
    body: JSON.stringify(body)
  }, (payload, operation, path) => {
    const response = requireRecord(payload, operation, path, "promote response");
    requireBooleanField(response, "ok", operation, path, true);
    const planPayload = requireRecord(requireField(response, "plan", operation, path), operation, path, "plan");

    return {
      ok: true as const,
      plan: validatePlanResponse(planPayload, operation, `${path}#plan`)
    };
  });

  return payload.plan;
}

export async function fetchPlan(planId: string) {
  const payload = await requestJson<{ ok: true; plan: MatrixPlan }>("Matrix plan fetch", `/api/matrix/actions/${encodeURIComponent(planId)}`, {}, (payload, operation, path) => {
    const response = requireRecord(payload, operation, path, "plan fetch response");
    requireBooleanField(response, "ok", operation, path, true);
    const planPayload = requireRecord(requireField(response, "plan", operation, path), operation, path, "plan");

    return {
      ok: true as const,
      plan: validatePlanResponse(planPayload, operation, `${path}#plan`)
    };
  });
  return payload.plan;
}

export async function executePlan(body: { planId: string; approval: true }) {
  return requestJson<MatrixExecuteResult>("Matrix execute", "/api/matrix/actions/execute", {
    method: "POST",
    body: JSON.stringify(body)
  }, validateExecutionResponse);
}

export async function prepareRoomTopicUpdate(body: { type: "update_room_topic"; roomId: string; topic: string }) {
  const payload = await requestJson<{ ok: true; plan: MatrixRoomTopicPlan }>("Matrix room topic promote", "/api/matrix/actions/promote", {
    method: "POST",
    body: JSON.stringify(body)
  }, (response, operation, path) => {
    const record = requireRecord(response, operation, path, "room topic promote response");
    requireBooleanField(record, "ok", operation, path, true);
    const plan = requireRecord(requireField(record, "plan", operation, path), operation, path, "room topic plan");

    return {
      ok: true as const,
      plan: validateRoomTopicPlanResponse({ ok: true, plan }, operation, `${path}#plan`)
    };
  });

  return payload.plan;
}

export async function fetchRoomTopicUpdatePlan(planId: string) {
  const payload = await requestJson<{ ok: true; plan: MatrixRoomTopicPlan }>("Matrix room topic plan fetch", `/api/matrix/actions/${encodeURIComponent(planId)}`, {}, (response, operation, path) => {
    const record = requireRecord(response, operation, path, "room topic plan fetch response");
    requireBooleanField(record, "ok", operation, path, true);
    const plan = requireRecord(requireField(record, "plan", operation, path), operation, path, "room topic plan");

    return {
      ok: true as const,
      plan: validateRoomTopicPlanResponse({ ok: true, plan }, operation, `${path}#plan`)
    };
  });

  return payload.plan;
}

export async function executeRoomTopicUpdate(body: { planId: string; approval: true }) {
  return requestJson<MatrixRoomTopicExecutionResult>("Matrix room topic execute", `/api/matrix/actions/${encodeURIComponent(body.planId)}/execute`, {
    method: "POST",
    body: JSON.stringify({ approval: body.approval })
  }, validateRoomTopicExecutionResponse);
}

export async function verifyRoomTopicUpdate(planId: string) {
  return requestJson<MatrixRoomTopicVerificationResult>("Matrix room topic verify", `/api/matrix/actions/${encodeURIComponent(planId)}/verify`, {}, validateRoomTopicVerificationResponse);
}
