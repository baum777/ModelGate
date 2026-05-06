import { createHash } from "node:crypto";
import type { MatrixClient } from "./matrix-client.js";
import type { MatrixConfig } from "./matrix-env.js";
import type { RuntimeJournal } from "./runtime-journal.js";

export const MATRIX_EVIDENCE_EVENT_TYPES = [
  "matrix_approval_record",
  "matrix_provenance_record",
  "matrix_verification_result",
  "matrix_topic_change_record",
  "matrix_evidence_write_failed"
] as const;

export type MatrixEvidenceEventType = typeof MATRIX_EVIDENCE_EVENT_TYPES[number];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type MatrixEvidenceEndpoint = "approvals" | "provenance" | "verification" | "topicChanges";

export type MatrixEvidenceInput = {
  eventType: MatrixEvidenceEventType;
  planId: string;
  roomId: string;
  scopeId: string | null;
  snapshotId: string | null;
  actor: unknown;
  action: string;
  status: string;
  createdAt: string;
  executedAt: string | null;
  verifiedAt: string | null;
  transactionId: string | null;
  before: unknown;
  after: unknown;
  result: unknown;
  source: unknown;
  authorityDomain: "backend";
};

export type MatrixEvidenceMessage = {
  msgtype: "m.notice";
  body: string;
  "mosaicstack.evidence": {
    schemaVersion: 1;
    eventType: MatrixEvidenceEventType;
    planId: string;
    roomId: string;
    scopeId: string | null;
    snapshotId: string | null;
    actor: JsonValue;
    action: string;
    status: string;
    createdAt: string;
    executedAt: string | null;
    verifiedAt: string | null;
    transactionId: string | null;
    before: {
      hash: string | null;
      preview: string;
    };
    after: {
      hash: string | null;
      preview: string;
    };
    result: JsonValue;
    source: JsonValue;
    authorityDomain: "backend";
    redactionPolicy: {
      secrets: "excluded";
      payloadLimit: "bounded";
      fullTopic: "hash-plus-preview";
    };
  };
};

export type MatrixEvidenceWriteWarning = {
  eventType: "matrix_evidence_write_failed";
  phase: MatrixEvidenceEventType;
  code: string;
  message: string;
};

type MatrixEvidenceWriteResult =
  | { ok: true; required: boolean; transactionId: string | null }
  | { ok: false; required: boolean; warning: MatrixEvidenceWriteWarning };

type MatrixEvidenceWriterOptions = {
  config: MatrixConfig;
  client: MatrixClient;
  runtimeJournal: RuntimeJournal;
};

const MAX_FIELD_LENGTH = 180;
const FORBIDDEN_KEY_PATTERN = /(token|secret|credential|authorization|cookie|password|api[_-]?key|env)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isKnownEventType(value: string): value is MatrixEvidenceEventType {
  return MATRIX_EVIDENCE_EVENT_TYPES.includes(value as MatrixEvidenceEventType);
}

function boundString(value: string, maxLength = MAX_FIELD_LENGTH) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function hashText(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sanitizeJsonValue(value: unknown): JsonValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return boundString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((entry) => sanitizeJsonValue(entry))
      .filter((entry) => entry !== undefined) as JsonValue[];
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const output: JsonObject = {};

  for (const [key, child] of Object.entries(value).slice(0, 30)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      continue;
    }

    const sanitized = sanitizeJsonValue(child);

    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  return output;
}

function sanitizeObject(value: unknown): JsonValue {
  return sanitizeJsonValue(value) ?? {};
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.text === "string") {
    return value.text;
  }

  const sanitized = sanitizeJsonValue(value);

  if (sanitized === undefined) {
    return "";
  }

  return JSON.stringify(sanitized);
}

function buildBoundedTextRecord(value: unknown) {
  const text = extractText(value);

  return {
    hash: text ? hashText(text) : null,
    preview: text ? boundString(text) : ""
  };
}

function targetForEvent(config: MatrixConfig, eventType: MatrixEvidenceEventType): {
  endpoint: MatrixEvidenceEndpoint | null;
  roomId: string | null;
} {
  if (eventType === "matrix_approval_record") {
    return { endpoint: "approvals", roomId: config.evidenceRooms.approvals };
  }

  if (eventType === "matrix_provenance_record") {
    return { endpoint: "provenance", roomId: config.evidenceRooms.provenance };
  }

  if (eventType === "matrix_verification_result") {
    return { endpoint: "verification", roomId: config.evidenceRooms.verification };
  }

  if (eventType === "matrix_topic_change_record") {
    return { endpoint: "topicChanges", roomId: config.evidenceRooms.topicChanges };
  }

  return { endpoint: null, roomId: null };
}

function compactMessageBody(message: MatrixEvidenceMessage) {
  return [
    message.body,
    JSON.stringify(message["mosaicstack.evidence"])
  ].join("\n");
}

function errorCode(error: unknown) {
  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }

  return "matrix_evidence_write_failed";
}

function recordEvidenceGap(
  runtimeJournal: RuntimeJournal,
  input: MatrixEvidenceInput,
  code: string,
  message: string,
  evidenceRoomKind: MatrixEvidenceEndpoint | null
) {
  runtimeJournal.append({
    source: "matrix",
    eventType: "matrix_evidence_write_failed",
    authorityDomain: "backend",
    severity: "warning",
    outcome: "failed",
    planId: input.planId,
    summary: "Matrix evidence write failed",
    safeMetadata: {
      phase: input.eventType,
      roomId: input.roomId,
      evidenceRoomKind,
      code,
      message
    }
  });
}

export function buildMatrixEvidenceMessage(input: MatrixEvidenceInput): MatrixEvidenceMessage {
  if (!isKnownEventType(input.eventType)) {
    throw new Error("Unknown Matrix evidence event type");
  }

  const safeStatus = boundString(input.status);
  const evidence = {
    schemaVersion: 1 as const,
    eventType: input.eventType,
    planId: boundString(input.planId),
    roomId: boundString(input.roomId),
    scopeId: input.scopeId ? boundString(input.scopeId) : null,
    snapshotId: input.snapshotId ? boundString(input.snapshotId) : null,
    actor: sanitizeObject(input.actor),
    action: boundString(input.action),
    status: safeStatus,
    createdAt: input.createdAt,
    executedAt: input.executedAt,
    verifiedAt: input.verifiedAt,
    transactionId: input.transactionId ? boundString(input.transactionId) : null,
    before: buildBoundedTextRecord(input.before),
    after: buildBoundedTextRecord(input.after),
    result: sanitizeObject(input.result),
    source: sanitizeObject(input.source),
    authorityDomain: "backend" as const,
    redactionPolicy: {
      secrets: "excluded" as const,
      payloadLimit: "bounded" as const,
      fullTopic: "hash-plus-preview" as const
    }
  };

  return {
    msgtype: "m.notice",
    body: `MosaicStack evidence: ${input.eventType} ${evidence.planId} ${safeStatus}`,
    "mosaicstack.evidence": evidence
  };
}

export function createMatrixEvidenceWriter(options: MatrixEvidenceWriterOptions) {
  return {
    async write(input: MatrixEvidenceInput): Promise<MatrixEvidenceWriteResult> {
      const required = options.config.evidenceWritesRequired;

      if (!options.config.evidenceWritesEnabled) {
        return {
          ok: true,
          required,
          transactionId: null
        };
      }

      const target = targetForEvent(options.config, input.eventType);

      if (!target.roomId) {
        const warning: MatrixEvidenceWriteWarning = {
          eventType: "matrix_evidence_write_failed",
          phase: input.eventType,
          code: "matrix_evidence_room_missing",
          message: "Matrix evidence room is not configured"
        };
        recordEvidenceGap(options.runtimeJournal, input, warning.code, warning.message, target.endpoint);
        return {
          ok: false,
          required,
          warning
        };
      }

      try {
        const message = buildMatrixEvidenceMessage(input);
        const transaction = await options.client.sendRoomMessage(target.roomId, compactMessageBody(message));

        return {
          ok: true,
          required,
          transactionId: transaction.transactionId
        };
      } catch (error) {
        const warning: MatrixEvidenceWriteWarning = {
          eventType: "matrix_evidence_write_failed",
          phase: input.eventType,
          code: errorCode(error),
          message: "Matrix evidence write failed"
        };
        recordEvidenceGap(options.runtimeJournal, input, warning.code, warning.message, target.endpoint);

        return {
          ok: false,
          required,
          warning
        };
      }
    }
  };
}
