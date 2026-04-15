import { z } from "zod";

export type MatrixErrorCode =
  | "matrix_not_configured"
  | "invalid_request"
  | "matrix_unauthorized"
  | "matrix_forbidden"
  | "matrix_unavailable"
  | "matrix_timeout"
  | "matrix_malformed_response"
  | "matrix_scope_not_found"
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
  matrix_unauthorized: "Matrix credentials were rejected",
  matrix_forbidden: "Matrix backend denied access",
  matrix_unavailable: "Matrix backend is unavailable",
  matrix_timeout: "Matrix backend request timed out",
  matrix_malformed_response: "Matrix backend returned an invalid response",
  matrix_scope_not_found: "Matrix scope was not found",
  matrix_internal_error: "Matrix backend failed"
};

const MATRIX_ERROR_STATUS: Record<MatrixErrorCode, number> = {
  matrix_not_configured: 503,
  invalid_request: 400,
  matrix_unauthorized: 401,
  matrix_forbidden: 403,
  matrix_unavailable: 503,
  matrix_timeout: 504,
  matrix_malformed_response: 502,
  matrix_scope_not_found: 404,
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

