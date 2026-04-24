import { z } from "zod";

export type MatrixErrorCode =
  | "matrix_not_configured"
  | "invalid_request"
  | "matrix_invalid_token"
  | "matrix_token_expired"
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
  | "matrix_plan_not_found"
  | "matrix_plan_expired"
  | "matrix_plan_already_executed"
  | "matrix_rate_limited"
  | "matrix_stale_plan"
  | "matrix_verification_failed"
  | "matrix_internal_error";

export type MatrixErrorResponse = {
  ok: false;
  error: {
    code: MatrixErrorCode;
    message: string;
  };
};

export type MatrixWhoAmIResponse = {
  ok: true;
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

export type MatrixJoinedRoomsResponse = {
  ok: true;
  rooms: MatrixJoinedRoom[];
};

export type MatrixScopeResolveRequest = {
  roomIds: string[];
  spaceIds: string[];
};

export type MatrixScopeRoom = MatrixJoinedRoom;

export type MatrixScopeResponse = {
  ok: true;
  scope: {
    scopeId: string;
    type: "space" | "room" | "mixed";
    rooms: MatrixScopeRoom[];
    createdAt: string;
  };
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

export type MatrixScopeSummaryResponse = {
  ok: true;
  scopeId: string;
  snapshotId: string;
  generatedAt: string;
  items: MatrixScopeSummaryItem[];
};

export const MatrixScopeResolveRequestSchema = z.object({
  roomIds: z.array(z.string().trim().min(1)),
  spaceIds: z.array(z.string().trim().min(1))
}).superRefine((value, ctx) => {
  if (value.roomIds.length === 0 && value.spaceIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one Matrix room or space must be selected"
    });
  }
});

const MATRIX_ERROR_MESSAGES: Record<MatrixErrorCode, string> = {
  matrix_not_configured: "Matrix backend is not configured",
  invalid_request: "Invalid Matrix request",
  matrix_invalid_token: "Matrix credentials were rejected",
  matrix_token_expired: "Matrix access token expired",
  matrix_unauthorized: "Matrix credentials were rejected",
  matrix_forbidden: "Matrix backend denied access",
  matrix_room_not_found: "Matrix room was not found",
  matrix_not_joined: "Matrix user is not joined to the room",
  matrix_insufficient_power_level: "Matrix user lacks room power level to update the topic",
  matrix_wrong_room_id: "Matrix room id does not match the joined room",
  matrix_write_forbidden: "Matrix backend denied write access",
  matrix_unavailable: "Matrix backend is unavailable",
  matrix_homeserver_unreachable: "Matrix homeserver is unreachable",
  matrix_timeout: "Matrix backend request timed out",
  matrix_malformed_response: "Matrix backend returned an invalid response",
  matrix_scope_not_found: "Matrix scope was not found",
  matrix_plan_not_found: "Matrix plan was not found",
  matrix_plan_expired: "Matrix plan expired",
  matrix_plan_already_executed: "Matrix plan was already executed",
  matrix_rate_limited: "Matrix rate limit was hit",
  matrix_stale_plan: "Matrix plan is stale and must be refreshed",
  matrix_verification_failed: "Matrix verification failed",
  matrix_internal_error: "Matrix backend failed"
};

const MATRIX_ERROR_STATUS: Record<MatrixErrorCode, number> = {
  matrix_not_configured: 503,
  invalid_request: 400,
  matrix_invalid_token: 401,
  matrix_token_expired: 401,
  matrix_unauthorized: 401,
  matrix_forbidden: 403,
  matrix_room_not_found: 404,
  matrix_not_joined: 403,
  matrix_insufficient_power_level: 403,
  matrix_wrong_room_id: 404,
  matrix_write_forbidden: 403,
  matrix_unavailable: 503,
  matrix_homeserver_unreachable: 503,
  matrix_timeout: 504,
  matrix_malformed_response: 502,
  matrix_scope_not_found: 404,
  matrix_plan_not_found: 404,
  matrix_plan_expired: 410,
  matrix_plan_already_executed: 409,
  matrix_rate_limited: 429,
  matrix_stale_plan: 409,
  matrix_verification_failed: 500,
  matrix_internal_error: 500
};

export function buildMatrixErrorResponse(code: MatrixErrorCode, message?: string): MatrixErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message: message ?? MATRIX_ERROR_MESSAGES[code]
    }
  };
}

export function matrixErrorStatus(code: MatrixErrorCode) {
  return MATRIX_ERROR_STATUS[code];
}
