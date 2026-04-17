import { createHash, randomUUID } from "node:crypto";
import type {
  MatrixJoinedRoom,
  MatrixScopeResolveRequest,
  MatrixWhoAmIResponse
} from "./matrix-contract.js";
import type { MatrixConfig } from "./matrix-env.js";
import type { MatrixResolvedRoom, MatrixScopeSnapshot } from "./matrix-scope-store.js";

export class MatrixClientError extends Error {
  readonly code:
    | "matrix_invalid_token"
    | "matrix_token_expired"
    | "matrix_not_configured"
    | "matrix_unauthorized"
    | "matrix_forbidden"
    | "matrix_room_not_found"
    | "matrix_not_joined"
    | "matrix_insufficient_power_level"
    | "matrix_wrong_room_id"
    | "matrix_write_forbidden"
    | "matrix_unavailable"
    | "matrix_homeserver_unreachable"
    | "matrix_timeout"
    | "matrix_malformed_response"
    | "matrix_scope_not_found"
    | "matrix_internal_error";

  readonly status: number;

  readonly operation: string;

  readonly path: string;

  readonly baseUrl: string;

  constructor(options: {
    code: MatrixClientError["code"];
    status: number;
    operation: string;
    path: string;
    baseUrl: string;
    message: string;
  }) {
    super(options.message);
    this.name = "MatrixClientError";
    this.code = options.code;
    this.status = options.status;
    this.operation = options.operation;
    this.path = options.path;
    this.baseUrl = options.baseUrl;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type MatrixClient = {
  whoami(): Promise<MatrixWhoAmIResponse>;
  joinedRooms(): Promise<MatrixJoinedRoom[]>;
  resolveScope(body: MatrixScopeResolveRequest): Promise<MatrixScopeSnapshot>;
  readRoomTopic(roomId: string): Promise<string | null>;
  readRoomPowerLevels(roomId: string): Promise<MatrixRoomPowerLevels>;
  updateRoomTopic(roomId: string, topic: string): Promise<{ transactionId: string }>;
};

export type MatrixRoomPowerLevels = {
  users: Record<string, number>;
  users_default: number;
  events: Record<string, number>;
  events_default: number;
  state_default: number;
};

type MatrixClientOptions = {
  config: MatrixConfig;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function createMatrixClientError(options: {
  code: MatrixClientError["code"];
  status: number;
  operation: string;
  path: string;
  baseUrl: string;
  message: string;
}) {
  return new MatrixClientError(options);
}

function requestFailureMessage(status: number) {
  if (status === 401) {
    return "Matrix credentials were rejected";
  }

  if (status === 403) {
    return "Matrix backend denied access";
  }

  if (status === 404) {
    return "Matrix resource was not found";
  }

  if (status === 408 || status === 504) {
    return "Matrix backend request timed out";
  }

  if (status >= 500) {
    return "Matrix backend is unavailable";
  }

  return "Matrix request failed";
}

function requestFailureCode(
  status: number,
  notFoundCode: MatrixClientError["code"],
  forbiddenCode: MatrixClientError["code"] = "matrix_forbidden"
): MatrixClientError["code"] {
  if (status === 401) {
    return "matrix_invalid_token";
  }

  if (status === 403) {
    return forbiddenCode;
  }

  if (status === 404) {
    return notFoundCode;
  }

  if (status === 408 || status === 504) {
    return "matrix_timeout";
  }

  if (status >= 500) {
    return "matrix_unavailable";
  }

  return "matrix_internal_error";
}

function requestFailureCodeForResponse(
  status: number,
  config: MatrixConfig,
  notFoundCode: MatrixClientError["code"],
  forbiddenCode: MatrixClientError["code"] = "matrix_forbidden"
) {
  if (status === 401) {
    return classifyUnauthorizedCode(config);
  }

  return requestFailureCode(status, notFoundCode, forbiddenCode);
}

function requestFailureMessageForResponse(status: number, config: MatrixConfig) {
  if (status === 401) {
    return classifyUnauthorizedCode(config) === "matrix_token_expired"
      ? "Matrix access token expired"
      : "Matrix credentials were rejected";
  }

  return requestFailureMessage(status);
}

function tokenIsExpired(config: MatrixConfig) {
  if (!config.tokenExpiresAt) {
    return false;
  }

  const expiresAt = new Date(config.tokenExpiresAt).getTime();

  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return expiresAt <= Date.now();
}

function classifyUnauthorizedCode(config: MatrixConfig) {
  return tokenIsExpired(config) ? "matrix_token_expired" : "matrix_invalid_token";
}

async function readErrorStatus(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

type MatrixTokenRefreshResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  token_type?: string | null;
  scope?: string | null;
};

const refreshLocks = new WeakMap<MatrixConfig, Promise<void>>();

function canRefreshMatrixCredentials(config: MatrixConfig) {
  return Boolean(config.baseUrl && config.refreshToken && config.clientId);
}

function isTokenExpiringSoon(config: MatrixConfig, thresholdMs = 60_000) {
  if (!config.tokenExpiresAt) {
    return false;
  }

  const expiresAt = new Date(config.tokenExpiresAt).getTime();

  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return expiresAt - Date.now() <= thresholdMs;
}

function matrixTokenRefreshUnavailable(operation: string, path: string, baseUrl: string) {
  return createMatrixClientError({
    code: "matrix_not_configured",
    status: 503,
    operation,
    path,
    baseUrl,
    message: "Matrix backend is not configured"
  });
}

async function refreshMatrixCredentials(
  config: MatrixConfig,
  fetchImpl: typeof fetch,
  operation: string,
  path: string
) {
  if (!canRefreshMatrixCredentials(config)) {
    throw matrixTokenRefreshUnavailable(operation, path, config.baseUrl ?? "unconfigured");
  }

  const inFlight = refreshLocks.get(config);

  if (inFlight) {
    await inFlight;
    return;
  }

  const refreshPromise = (async () => {
    const refreshPath = "/oauth2/token";
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    });
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken ?? "",
      client_id: config.clientId ?? ""
    });

    let response: Response;

    try {
      response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl ?? "")}${refreshPath}`, {
        method: "POST",
        headers,
        body
      });
    } catch {
      throw createMatrixClientError({
        code: "matrix_homeserver_unreachable",
        status: 503,
        operation,
        path: refreshPath,
        baseUrl: normalizeBaseUrl(config.baseUrl ?? ""),
        message: "Matrix homeserver is unreachable"
      });
    }

    if (!response.ok) {
      throw createMatrixClientError({
        code: response.status === 408 || response.status === 504
          ? "matrix_timeout"
          : response.status >= 500
            ? "matrix_unavailable"
            : classifyUnauthorizedCode(config),
        status: response.status === 408 || response.status === 504
          ? 504
          : response.status >= 500
            ? 503
            : 401,
        operation,
        path: refreshPath,
        baseUrl: normalizeBaseUrl(config.baseUrl ?? ""),
        message: response.status === 408 || response.status === 504
          ? "Matrix backend request timed out"
          : response.status >= 500
            ? "Matrix backend is unavailable"
            : classifyUnauthorizedCode(config) === "matrix_token_expired"
              ? "Matrix access token expired"
              : "Matrix credentials were rejected"
      });
    }

    const payload = await response.json() as Partial<MatrixTokenRefreshResponse>;

    if (typeof payload.access_token !== "string" || payload.access_token.trim().length === 0) {
      throw createMatrixClientError({
        code: "matrix_malformed_response",
        status: 502,
        operation,
        path: refreshPath,
        baseUrl: normalizeBaseUrl(config.baseUrl ?? ""),
        message: "Matrix backend returned an invalid response"
      });
    }

    config.accessToken = payload.access_token.trim();

    if (typeof payload.refresh_token === "string" && payload.refresh_token.trim().length > 0) {
      config.refreshToken = payload.refresh_token.trim();
    }

    if (typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)) {
      config.tokenExpiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString();
    }
  })().finally(() => {
    refreshLocks.delete(config);
  });

  refreshLocks.set(config, refreshPromise);
  await refreshPromise;
}

async function resolveMatrixAccessToken(
  config: MatrixConfig,
  fetchImpl: typeof fetch,
  operation: string,
  path: string
) {
  if (!config.ready || !config.baseUrl) {
    throw matrixTokenRefreshUnavailable(operation, path, config.baseUrl ?? "unconfigured");
  }

  if (!config.accessToken) {
    if (canRefreshMatrixCredentials(config)) {
      await refreshMatrixCredentials(config, fetchImpl, operation, path);
    } else {
      throw matrixTokenRefreshUnavailable(operation, path, normalizeBaseUrl(config.baseUrl));
    }
  } else if (isTokenExpiringSoon(config) && canRefreshMatrixCredentials(config)) {
    await refreshMatrixCredentials(config, fetchImpl, operation, path);
  }

  if (!config.accessToken) {
    throw matrixTokenRefreshUnavailable(operation, path, normalizeBaseUrl(config.baseUrl));
  }

  return config.accessToken;
}

async function requestJson<T>(
  config: MatrixConfig,
  operation: string,
  path: string,
  init: RequestInit | undefined,
  validate: (payload: unknown) => T,
  fetchImpl: typeof fetch,
  failureCodes: {
    notFoundCode?: MatrixClientError["code"];
    forbiddenCode?: MatrixClientError["code"];
  } = {},
  retryOnUnauthorized = true
): Promise<T> {
  if (!config.ready || !config.baseUrl) {
    throw createMatrixClientError({
      code: "matrix_not_configured",
      status: 503,
      operation,
      path,
      baseUrl: config.baseUrl ?? "unconfigured",
      message: "Matrix backend is not configured"
    });
  }

  const accessToken = await resolveMatrixAccessToken(config, fetchImpl, operation, path);
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);

  let response: Response;

  try {
    response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? controller.signal
    });
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      throw createMatrixClientError({
        code: "matrix_timeout",
        status: 504,
        operation,
        path,
        baseUrl: normalizeBaseUrl(config.baseUrl),
        message: "Matrix backend request timed out"
      });
    }

    throw createMatrixClientError({
      code: "matrix_homeserver_unreachable",
      status: 503,
      operation,
      path,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "Matrix homeserver is unreachable"
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401 && retryOnUnauthorized && canRefreshMatrixCredentials(config)) {
      await refreshMatrixCredentials(config, fetchImpl, operation, path);
      return requestJson(config, operation, path, init, validate, fetchImpl, failureCodes, false);
    }

    const bodyText = await readErrorStatus(response);
    void bodyText;
    throw createMatrixClientError({
      code: requestFailureCodeForResponse(
        response.status,
        config,
        failureCodes.notFoundCode ?? "matrix_unavailable",
        failureCodes.forbiddenCode ?? "matrix_forbidden"
      ),
      status: response.status === 401
        ? 401
        : response.status === 403
          ? 403
          : response.status === 404
            ? 404
            : response.status === 408 || response.status === 504
              ? 504
              : response.status >= 500
                ? 503
                : 500,
      operation,
      path,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: requestFailureMessageForResponse(response.status, config)
    });
  }

  try {
    const payload = await response.json() as unknown;
    return validate(payload);
  } catch {
    throw createMatrixClientError({
      code: "matrix_malformed_response",
      status: 502,
      operation,
      path,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "Matrix backend returned an invalid response"
    });
  }
}

async function requestOptionalJson<T>(
  config: MatrixConfig,
  operation: string,
  path: string,
  init: RequestInit | undefined,
  validate: (payload: unknown) => T,
  fetchImpl: typeof fetch,
  failureCodes: {
    notFoundCode?: MatrixClientError["code"];
    forbiddenCode?: MatrixClientError["code"];
  } = {},
  retryOnUnauthorized = true
): Promise<T | null> {
  if (!config.ready || !config.baseUrl) {
    throw createMatrixClientError({
      code: "matrix_not_configured",
      status: 503,
      operation,
      path,
      baseUrl: config.baseUrl ?? "unconfigured",
      message: "Matrix backend is not configured"
    });
  }

  const accessToken = await resolveMatrixAccessToken(config, fetchImpl, operation, path);
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);

  let response: Response;

  try {
    response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? controller.signal
    });
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      throw createMatrixClientError({
        code: "matrix_timeout",
        status: 504,
        operation,
        path,
        baseUrl: normalizeBaseUrl(config.baseUrl),
        message: "Matrix backend request timed out"
      });
    }

    throw createMatrixClientError({
      code: "matrix_homeserver_unreachable",
      status: 503,
      operation,
      path,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "Matrix homeserver is unreachable"
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    if (response.status === 401 && retryOnUnauthorized && canRefreshMatrixCredentials(config)) {
      await refreshMatrixCredentials(config, fetchImpl, operation, path);
      return requestOptionalJson(config, operation, path, init, validate, fetchImpl, failureCodes, false);
    }

    throw createMatrixClientError({
      code: requestFailureCodeForResponse(
        response.status,
        config,
        failureCodes.notFoundCode ?? "matrix_unavailable",
        failureCodes.forbiddenCode ?? "matrix_forbidden"
      ),
      status: response.status === 401
        ? 401
        : response.status === 403
          ? 403
          : response.status === 408 || response.status === 504
            ? 504
            : response.status >= 500
              ? 503
              : 500,
      operation,
      path,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: requestFailureMessageForResponse(response.status, config)
    });
  }

  try {
    const payload = await response.json() as unknown;
    return validate(payload);
  } catch {
    throw createMatrixClientError({
      code: "matrix_malformed_response",
      status: 502,
      operation,
      path,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "Matrix backend returned an invalid response"
    });
  }
}

function readNumberField(
  payload: Record<string, unknown>,
  field: string,
  operation: string,
  path: string,
  label: string,
  defaultValue = 0
) {
  const value = payload[field];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "undefined") {
    return defaultValue;
  }

  throw createMatrixClientError({
    code: "matrix_malformed_response",
    status: 502,
    operation,
    path,
    baseUrl: "unavailable",
    message: `Matrix ${label} field ${field} must be a number`
  });
}

function readNumberMapField(
  payload: Record<string, unknown>,
  field: string,
  operation: string,
  path: string,
  label: string
) {
  const value = payload[field];

  if (!isRecord(value)) {
    return {} as Record<string, number>;
  }

  const result: Record<string, number> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw createMatrixClientError({
        code: "matrix_malformed_response",
        status: 502,
        operation,
        path,
        baseUrl: "unavailable",
        message: `Matrix ${label} field ${field} must contain numeric values`
      });
    }

    result[key] = entry;
  }

  return result;
}

function requireRecord(payload: unknown, operation: string, path: string, label: string) {
  if (!isRecord(payload)) {
    throw createMatrixClientError({
      code: "matrix_malformed_response",
      status: 502,
      operation,
      path,
      baseUrl: "unavailable",
      message: `Matrix ${label} must be a JSON object`
    });
  }

  return payload;
}

function requireStringField(payload: Record<string, unknown>, field: string, operation: string, path: string, label: string) {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw createMatrixClientError({
      code: "matrix_malformed_response",
      status: 502,
      operation,
      path,
      baseUrl: "unavailable",
      message: `Matrix ${label} field ${field} must be a non-empty string`
    });
  }

  return value;
}

function requireStringFieldAllowEmpty(payload: Record<string, unknown>, field: string, operation: string, path: string, label: string) {
  const value = payload[field];

  if (typeof value !== "string") {
    throw createMatrixClientError({
      code: "matrix_malformed_response",
      status: 502,
      operation,
      path,
      baseUrl: "unavailable",
      message: `Matrix ${label} field ${field} must be a string`
    });
  }

  return value;
}

function requireArrayField(payload: Record<string, unknown>, field: string, operation: string, path: string, label: string) {
  const value = payload[field];

  if (!Array.isArray(value)) {
    throw createMatrixClientError({
      code: "matrix_malformed_response",
      status: 502,
      operation,
      path,
      baseUrl: "unavailable",
      message: `Matrix ${label} field ${field} must be an array`
    });
  }

  return value;
}

function optionalStringField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function normalizeRoomType(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  if (value === "m.space" || value === "space") {
    return "space";
  }

  return "room";
}

async function readMatrixRoomExists(config: MatrixConfig, fetchImpl: typeof fetch, roomId: string) {
  const roomPath = encodeURIComponent(roomId);
  const createPath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.create`;

  const createResponse = await requestOptionalJson(
    config,
    "Matrix room create",
    createPath,
    undefined,
    (payload) => requireRecord(payload, "Matrix room create", createPath, "room create event"),
    fetchImpl,
    {
      notFoundCode: "matrix_room_not_found",
      forbiddenCode: "matrix_write_forbidden"
    }
  );

  return createResponse !== null;
}

async function readMatrixRoomTopic(config: MatrixConfig, fetchImpl: typeof fetch, roomId: string) {
  const roomExists = await readMatrixRoomExists(config, fetchImpl, roomId);

  if (!roomExists) {
    throw createMatrixClientError({
      code: "matrix_room_not_found",
      status: 404,
      operation: "Matrix room topic",
      path: `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.topic`,
      baseUrl: normalizeBaseUrl(config.baseUrl ?? ""),
      message: "Matrix room was not found"
    });
  }

  const roomPath = encodeURIComponent(roomId);
  const topicPath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.topic`;
  const topic = await requestOptionalJson(
    config,
    "Matrix room topic",
    topicPath,
    undefined,
    (payload) => {
      const record = requireRecord(payload, "Matrix room topic", topicPath, "room topic event");
      return requireStringFieldAllowEmpty(record, "topic", "Matrix room topic", topicPath, "room topic event");
    },
    fetchImpl,
    {
      notFoundCode: "matrix_room_not_found",
      forbiddenCode: "matrix_write_forbidden"
    }
  );

  return topic;
}

async function updateMatrixRoomTopic(config: MatrixConfig, fetchImpl: typeof fetch, roomId: string, topic: string) {
  const roomPath = encodeURIComponent(roomId);
  const topicPath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.topic`;

  return requestJson(
    config,
    "Matrix room topic update",
    topicPath,
    {
      method: "PUT",
      body: JSON.stringify({
        topic
      })
    },
    (payload) => {
      const record = requireRecord(payload, "Matrix room topic update", topicPath, "topic update response");
      const transactionId = requireStringField(record, "event_id", "Matrix room topic update", topicPath, "topic update response");

      return {
        transactionId
      };
    },
    fetchImpl,
    {
      notFoundCode: "matrix_room_not_found",
      forbiddenCode: "matrix_write_forbidden"
    }
  );
}

async function fetchRoomDescriptor(
  config: MatrixConfig,
  fetchImpl: typeof fetch,
  roomId: string,
  includeMembers: boolean
): Promise<MatrixResolvedRoom> {
  const roomPath = encodeURIComponent(roomId);
  const createPath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.create`;
  const namePath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.name`;
  const aliasPath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.canonical_alias`;
  const membersPath = `/_matrix/client/v3/rooms/${roomPath}/joined_members`;

  const createResponse = await requestOptionalJson(
    config,
    "Matrix room create",
    createPath,
    undefined,
    (payload) => requireRecord(payload, "Matrix room create", createPath, "room create event"),
    fetchImpl
  );

  const nameResponse = await requestOptionalJson(
    config,
    "Matrix room name",
    namePath,
    undefined,
    (payload) => requireRecord(payload, "Matrix room name", namePath, "room name event"),
    fetchImpl
  );

  const aliasResponse = await requestOptionalJson(
    config,
    "Matrix room alias",
    aliasPath,
    undefined,
    (payload) => requireRecord(payload, "Matrix room alias", aliasPath, "room alias event"),
    fetchImpl
  );

  let members = 0;

  if (includeMembers) {
    members = await requestJson(
      config,
      "Matrix room members",
      membersPath,
      undefined,
      (payload) => {
        const record = requireRecord(payload, "Matrix room members", membersPath, "joined members response");
        const joined = requireRecord(
          record.joined,
          "Matrix room members",
          membersPath,
          "joined members response"
        );

        return Object.keys(joined).length;
      },
      fetchImpl,
      {
        notFoundCode: "matrix_scope_not_found"
      }
    );
  }

  const createRecord = createResponse ? requireRecord(createResponse, "Matrix room create", createPath, "room create event") : null;
  const nameRecord = nameResponse ? requireRecord(nameResponse, "Matrix room name", namePath, "room name event") : null;
  const aliasRecord = aliasResponse ? requireRecord(aliasResponse, "Matrix room alias", aliasPath, "room alias event") : null;

  const roomType = normalizeRoomType(createRecord ? (createRecord.room_type ?? createRecord.roomType) : null) ?? "room";

  return {
    roomId,
    name: nameRecord ? optionalStringField(nameRecord, "name") : null,
    canonicalAlias: aliasRecord ? optionalStringField(aliasRecord, "alias") : null,
    roomType,
    members,
    lastEventSummary: includeMembers
      ? `Room metadata snapshot with ${members} joined members`
      : "Room metadata snapshot"
  };
}

function normalizeSelectionIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildScopeId(baseUrl: string, roomIds: string[], spaceIds: string[]) {
  const payload = JSON.stringify({
    baseUrl,
    roomIds: normalizeSelectionIds(roomIds).sort(),
    spaceIds: normalizeSelectionIds(spaceIds).sort()
  });

  return `scope_${createHash("sha256").update(payload).digest("base64url").slice(0, 24)}`;
}

export function createMatrixClient(options: MatrixClientOptions): MatrixClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async whoami() {
      return requestJson(
        options.config,
        "Matrix whoami",
        "/_matrix/client/v3/account/whoami",
        undefined,
        (payload) => {
          const record = requireRecord(payload, "Matrix whoami", "/_matrix/client/v3/account/whoami", "whoami response");
          const userId = requireStringField(record, "user_id", "Matrix whoami", "/_matrix/client/v3/account/whoami", "whoami response");

          return {
            ok: true as const,
            userId,
            deviceId: optionalStringField(record, "device_id"),
            homeserver: normalizeBaseUrl(options.config.baseUrl ?? "")
          };
        },
        fetchImpl
      );
    },

    async joinedRooms() {
      const joinedRoomIds = await requestJson(
        options.config,
        "Matrix joined rooms",
        "/_matrix/client/v3/joined_rooms",
        undefined,
        (payload) => {
          const record = requireRecord(payload, "Matrix joined rooms", "/_matrix/client/v3/joined_rooms", "joined rooms response");
          const joinedRooms = requireArrayField(record, "joined_rooms", "Matrix joined rooms", "/_matrix/client/v3/joined_rooms", "joined rooms response");

          if (!joinedRooms.every((value) => typeof value === "string" && value.trim().length > 0)) {
            throw createMatrixClientError({
              code: "matrix_malformed_response",
              status: 502,
              operation: "Matrix joined rooms",
              path: "/_matrix/client/v3/joined_rooms",
              baseUrl: normalizeBaseUrl(options.config.baseUrl ?? ""),
              message: "Matrix joined rooms response must include a joined_rooms array"
            });
          }

          return joinedRooms as string[];
        },
        fetchImpl
      );

      const rooms = await Promise.all(
        joinedRoomIds.map(async (roomId) => {
          const room = await fetchRoomDescriptor(options.config, fetchImpl, roomId, false);

          return {
            roomId: room.roomId,
            name: room.name,
            canonicalAlias: room.canonicalAlias,
            roomType: room.roomType
          };
        })
      );

      return rooms;
    },

    async resolveScope(body) {
      const roomIds = normalizeSelectionIds(body.roomIds);
      const spaceIds = normalizeSelectionIds(body.spaceIds);
      const requestedIds = normalizeSelectionIds([...roomIds, ...spaceIds]);
      const joinedRoomIds = await requestJson(
        options.config,
        "Matrix joined rooms",
        "/_matrix/client/v3/joined_rooms",
        undefined,
        (payload) => {
          const record = requireRecord(payload, "Matrix joined rooms", "/_matrix/client/v3/joined_rooms", "joined rooms response");
          const joinedRooms = requireArrayField(record, "joined_rooms", "Matrix joined rooms", "/_matrix/client/v3/joined_rooms", "joined rooms response");

          if (!joinedRooms.every((value) => typeof value === "string" && value.trim().length > 0)) {
            throw createMatrixClientError({
              code: "matrix_malformed_response",
              status: 502,
              operation: "Matrix joined rooms",
              path: "/_matrix/client/v3/joined_rooms",
              baseUrl: normalizeBaseUrl(options.config.baseUrl ?? ""),
              message: "Matrix joined rooms response must include a joined_rooms array"
            });
          }

          return new Set(joinedRooms as string[]);
        },
        fetchImpl
      );

      for (const roomId of requestedIds) {
        if (!joinedRoomIds.has(roomId)) {
          throw createMatrixClientError({
            code: "matrix_scope_not_found",
            status: 404,
            operation: "Matrix scope resolve",
            path: "/api/matrix/scope/resolve",
            baseUrl: normalizeBaseUrl(options.config.baseUrl ?? ""),
            message: "Selected Matrix room or space is not joined"
          });
        }
      }

      const selectedRooms = await Promise.all(
        requestedIds.map(async (roomId) => fetchRoomDescriptor(options.config, fetchImpl, roomId, true))
      );
      const createdAtMs = Date.now();

      return {
        scopeId: buildScopeId(normalizeBaseUrl(options.config.baseUrl ?? ""), roomIds, spaceIds),
        snapshotId: `snapshot_${randomUUID()}`,
        type: roomIds.length > 0 && spaceIds.length > 0
          ? "mixed"
          : spaceIds.length > 0
            ? "space"
            : "room",
        createdAt: new Date(createdAtMs).toISOString(),
        createdAtMs,
        expiresAtMs: createdAtMs + options.config.requestTimeoutMs * 3,
        rooms: selectedRooms
      };
    },

    async readRoomTopic(roomId) {
      return readMatrixRoomTopic(options.config, fetchImpl, roomId);
    },

    async readRoomPowerLevels(roomId) {
      const roomPath = encodeURIComponent(roomId);
      const powerLevelsPath = `/_matrix/client/v3/rooms/${roomPath}/state/m.room.power_levels`;

      const powerLevels = await requestOptionalJson(
        options.config,
        "Matrix room power levels",
        powerLevelsPath,
        undefined,
        (payload) => {
          const record = requireRecord(payload, "Matrix room power levels", powerLevelsPath, "room power levels event");

          return {
            users: readNumberMapField(record, "users", "Matrix room power levels", powerLevelsPath, "room power levels event"),
            users_default: readNumberField(record, "users_default", "Matrix room power levels", powerLevelsPath, "room power levels event", 0),
            events: readNumberMapField(record, "events", "Matrix room power levels", powerLevelsPath, "room power levels event"),
            events_default: readNumberField(record, "events_default", "Matrix room power levels", powerLevelsPath, "room power levels event", 0),
            state_default: readNumberField(record, "state_default", "Matrix room power levels", powerLevelsPath, "room power levels event", 50)
          };
        },
        fetchImpl,
        {
          notFoundCode: "matrix_room_not_found",
          forbiddenCode: "matrix_write_forbidden"
        }
      );

      if (!powerLevels) {
        return {
          users: {},
          users_default: 0,
          events: {},
          events_default: 0,
          state_default: 50
        };
      }

      return powerLevels;
    },

    async updateRoomTopic(roomId, topic) {
      return updateMatrixRoomTopic(options.config, fetchImpl, roomId, topic);
    }
  };
}
