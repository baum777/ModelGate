export const MATRIX_API_BASE_URL = (
  import.meta.env.VITE_MATRIX_API_BASE_URL
  ?? import.meta.env.VITE_API_BASE_URL
  ?? "http://127.0.0.1:3000"
).replace(/\/+$/, "");

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

async function requestJson<T>(operation: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${MATRIX_API_BASE_URL}${path}`, {
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
    return await response.json() as T;
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
  const payload = await requestJson<{ ok: true; userId: string; deviceId: string | null; homeserver: string }>("Matrix whoami", "/api/matrix/whoami");

  return {
    userId: payload.userId,
    deviceId: payload.deviceId,
    homeserver: payload.homeserver
  } satisfies MatrixWhoAmI;
}

export async function fetchJoinedRooms() {
  const payload = await requestJson<{ ok: true; rooms: MatrixJoinedRoom[] }>("Matrix joined rooms", "/api/matrix/joined-rooms");
  return payload.rooms;
}

export async function fetchRoomHierarchy(roomId: string) {
  return requestJson<MatrixSpaceHierarchy>("Matrix hierarchy", `/api/matrix/spaces/${encodeURIComponent(roomId)}/hierarchy`);
}

export async function resolveScope(body: { roomIds: string[]; spaceIds: string[] }) {
  const payload = await requestJson<{ ok: true; scope: MatrixScope }>("Matrix scope resolve", "/api/matrix/scope/resolve", {
    method: "POST",
    body: JSON.stringify(body)
  });

  return payload.scope;
}

export async function fetchScopeSummary(scopeId: string) {
  return requestJson<MatrixScopeSummary>("Matrix scope summary", `/api/matrix/scope/${encodeURIComponent(scopeId)}/summary`);
}

export async function fetchProvenance(roomId: string) {
  return requestJson<MatrixProvenance>("Matrix provenance", `/api/matrix/rooms/${encodeURIComponent(roomId)}/provenance`);
}

export async function analyzeScope(body: { scopeId: string; prompt: string; model?: string }) {
  return requestJson<MatrixAnalysisResponse>("Matrix analysis", "/api/matrix/chat", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function promoteCandidate(body: { candidateId: string; scopeId: string; snapshotId: string }) {
  const payload = await requestJson<{ ok: true; plan: MatrixPlan }>("Matrix promote", "/api/matrix/actions/promote", {
    method: "POST",
    body: JSON.stringify(body)
  });

  return payload.plan;
}

export async function fetchPlan(planId: string) {
  const payload = await requestJson<{ ok: true; plan: MatrixPlan }>("Matrix plan fetch", `/api/matrix/actions/${encodeURIComponent(planId)}`);
  return payload.plan;
}

export async function executePlan(body: { planId: string; approval: true }) {
  return requestJson<MatrixExecuteResult>("Matrix execute", "/api/matrix/actions/execute", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
