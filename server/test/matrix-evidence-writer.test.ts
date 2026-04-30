import assert from "node:assert/strict";
import test from "node:test";
import { MatrixClientError } from "../src/lib/matrix-client.js";
import {
  buildMatrixEvidenceMessage,
  createMatrixEvidenceWriter
} from "../src/lib/matrix-evidence-writer.js";
import { createRuntimeJournal } from "../src/lib/runtime-journal.js";
import { createMockMatrixClient, createTestMatrixConfig } from "../test-support/helpers.js";

const baseEvent = {
  eventType: "matrix_approval_record" as const,
  planId: "plan_test",
  roomId: "!room:matrix.example",
  scopeId: "scope_test",
  snapshotId: "snapshot_test",
  actor: {
    kind: "backend",
    id: "@bot:matrix.example"
  },
  action: "matrix.topic.update",
  status: "approved",
  createdAt: "2026-04-30T00:00:00.000Z",
  executedAt: null,
  verifiedAt: null,
  transactionId: null,
  authorityDomain: "backend" as const
};

test("matrix evidence message redacts sensitive-looking fields and bounds topic previews", () => {
  const message = buildMatrixEvidenceMessage({
    ...baseEvent,
    before: {
      text: `old ${"a".repeat(400)}`,
      accessToken: "secret-token"
    },
    after: {
      text: `new ${"b".repeat(400)}`,
      refreshToken: "refresh-secret"
    },
    result: {
      ok: true,
      authorization: "Bearer secret-token"
    },
    source: {
      surface: "modelgate",
      route: "POST /api/matrix/actions/:planId/execute",
      envValue: "MATRIX_ACCESS_TOKEN=secret-token"
    }
  });

  const serialized = JSON.stringify(message);

  assert.equal(message.msgtype, "m.notice");
  assert.match(message.body, /matrix_approval_record/);
  assert.doesNotMatch(serialized, /secret-token/);
  assert.doesNotMatch(serialized, /refresh-secret/);
  assert.doesNotMatch(serialized, /MATRIX_ACCESS_TOKEN/);
  assert.ok(message["mosaicstack.evidence"].before.preview.length <= 180);
  assert.ok(message["mosaicstack.evidence"].after.preview.length <= 180);
  assert.deepEqual(message["mosaicstack.evidence"].redactionPolicy.secrets, "excluded");
});

test("matrix evidence writer records runtime journal gaps when optional evidence write fails", async () => {
  const runtimeJournal = createRuntimeJournal({
    enabled: true,
    mode: "memory",
    maxEntries: 50,
    exposeRecentLimit: 50
  });
  const writer = createMatrixEvidenceWriter({
    config: createTestMatrixConfig({
      evidenceWritesEnabled: true,
      evidenceWritesRequired: false,
      evidenceRooms: {
        approvals: "!approvals:matrix.example",
        provenance: null,
        verification: null,
        topicChanges: null
      }
    }),
    client: createMockMatrixClient({
      sendRoomMessage: async () => {
        throw new MatrixClientError({
          code: "matrix_forbidden",
          status: 403,
          operation: "Matrix room message send",
          path: "/_matrix/client/v3/rooms/!approvals%3Amatrix.example/send/m.room.message/txn",
          baseUrl: "http://matrix.example",
          message: "Matrix backend denied access"
        });
      }
    }),
    runtimeJournal
  });

  const result = await writer.write({
    ...baseEvent,
    before: { text: "old topic" },
    after: { text: "new topic" },
    result: { ok: true },
    source: {
      surface: "modelgate",
      route: "POST /api/matrix/actions/:planId/execute"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.required, false);
  assert.equal(result.warning?.eventType, "matrix_evidence_write_failed");

  const recent = runtimeJournal.listRecent({ source: "matrix", limit: 10 });
  const gap = recent.find((entry) => entry.eventType === "matrix_evidence_write_failed");

  assert.equal(gap?.outcome, "failed");
  assert.equal(gap?.planId, "plan_test");
  assert.equal(gap?.safeMetadata.phase, "matrix_approval_record");
});
