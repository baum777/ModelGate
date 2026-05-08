# Matrix Evidence-Room Write Contract

Status: contract-only.

This document defines the next bounded Matrix write slice before implementation. It does not implement room writes, taxonomy provisioning, room creation, space creation, UI hierarchy changes, token/env changes, or Element onboarding automation.

## Purpose

Matrix evidence-room writes make backend-governed Matrix actions visible in Matrix rooms without making Matrix the source of execution authority.

The execution authority remains ModelGate's backend-owned governance flow:

```text
resolve -> analyze -> approve -> execute -> verify
```

Evidence-room messages are external operational evidence records. They are useful for users reading Matrix, but they do not replace the backend plan store, backend approval gate, runtime journal, Matrix state verification, or backend-owned credentials.

## Authority Boundary

- Browser owns room selection, plan review, and approval intent only.
- Backend owns Matrix credentials, scope snapshots, plans, execute, verify, and evidence writes.
- Runtime journal remains the internal audit surface and must record action execution, verification, and evidence write failures.
- Matrix evidence rooms are external operational evidence surfaces.
- Failed evidence writes must not fake success, mutate the original plan into verified state, or make the browser an authority source.
- Matrix access tokens, refresh tokens, authorization headers, cookies, raw env values, and credentials must never be sent to the browser or included in evidence payloads.

## Target Rooms

Evidence target rooms must be configured backend-side as exact room IDs or explicitly reviewed canonical aliases. The implementation must not create rooms, create aliases, discover aliases by guessing, link spaces, or auto-provision taxonomy.

Required target rooms:

| Evidence target | Room | Purpose |
| --- | --- | --- |
| approvals | `#approvals` | Approval decisions for backend-owned Matrix plans. |
| provenance | `#provenance-log` | Source, scope, snapshot, authority, and plan provenance records. |
| verification | `#verification-results` | Execute/verify outcomes and observed Matrix state checks. |
| topic changes | `#topic-change-log` | Verified topic update history and execution receipts. |

`#change-proposals` is deferred. It may become an optional future room for human proposal intake, but it is out of scope for the MVP evidence writer because it is not required to record backend-owned approval, provenance, verification, or topic-change evidence.

Backend-only configuration should use explicit target variables:

```env
MATRIX_EVIDENCE_ROOM_ID=
MATRIX_EVIDENCE_APPROVALS_ROOM_ID=
MATRIX_EVIDENCE_PROVENANCE_ROOM_ID=
MATRIX_EVIDENCE_VERIFICATION_ROOM_ID=
MATRIX_EVIDENCE_TOPIC_CHANGE_ROOM_ID=
MATRIX_EVIDENCE_WRITES_ENABLED=false
MATRIX_EVIDENCE_WRITES_REQUIRED=false
```

`MATRIX_EVIDENCE_ROOM_ID` is the MVP single-room configuration. When set, it routes approval, provenance, verification, and topic-change evidence to one already existing dedicated evidence room unless a more specific `MATRIX_EVIDENCE_*_ROOM_ID` target overrides it.

## Event Types

The evidence writer must support only these event categories:

- `matrix_approval_record`
- `matrix_provenance_record`
- `matrix_verification_result`
- `matrix_topic_change_record`
- `matrix_evidence_write_failed`

Unknown event categories must be rejected before sending to Matrix.

## Message Contract

Evidence messages should be sent as Matrix `m.room.message` events with `msgtype: "m.notice"` by default.

Each message must include a short human-readable `body` and a bounded machine-readable `mosaicstacked.evidence` object.

```json
{
  "msgtype": "m.notice",
  "body": "MosaicStacked evidence: matrix_approval_record plan_123 approved",
  "mosaicstacked.evidence": {
    "schemaVersion": 1,
    "eventType": "matrix_approval_record",
    "planId": "plan_123",
    "roomId": "!target-room:server",
    "scopeId": "scope_123",
    "snapshotId": "snapshot_123",
    "actor": {
      "kind": "backend",
      "id": "@mosaicstacked-bot:server"
    },
    "action": "matrix.topic.update",
    "status": "approved",
    "createdAt": "2026-04-30T00:00:00.000Z",
    "executedAt": null,
    "verifiedAt": null,
    "transactionId": null,
    "before": {
      "hash": "sha256:...",
      "preview": "Previous bounded topic preview"
    },
    "after": {
      "hash": "sha256:...",
      "preview": "Proposed bounded topic preview"
    },
    "result": {
      "ok": true,
      "code": "approved"
    },
    "source": {
      "surface": "modelgate",
      "route": "POST /api/matrix/actions/:planId/execute"
    },
    "authorityDomain": "backend",
    "redactionPolicy": {
      "secrets": "excluded",
      "payloadLimit": "bounded",
      "fullTopic": "hash-plus-preview"
    }
  }
}
```

Required fields for every evidence payload:

- `eventType`
- `planId`
- `roomId`
- `scopeId`
- `snapshotId`
- `actor`
- `action`
- `status`
- `createdAt`
- `executedAt`
- `verifiedAt`
- `transactionId`
- `before`
- `after`
- `result`
- `source`
- `authorityDomain`
- `redactionPolicy`

Field rules:

- `eventType` must be one of the exact event types in this contract.
- `planId` must identify a backend-owned plan; browser-supplied ad hoc plan IDs are not evidence authority.
- `roomId` is the Matrix room affected by the governed action, not necessarily the evidence room receiving the message.
- `scopeId` and `snapshotId` may be `null` only when the action has no scope snapshot.
- `actor` must identify the backend authority or approved user intent without exposing credentials.
- `action` must be bounded, for example `matrix.topic.update`, `matrix.approval.record`, or `matrix.verify`.
- `status` must describe the event state, for example `approved`, `executed`, `verified`, `mismatch`, `failed`, or `blocked`.
- `createdAt`, `executedAt`, and `verifiedAt` must be ISO-8601 strings or `null` when not applicable.
- `transactionId` must contain the Matrix send response transaction/event identifier only when available.
- `before` and `after` must use hashes plus bounded previews, not unbounded room content.
- `result` must be structured and sanitized.
- `source` must identify the backend surface that produced the evidence.
- `authorityDomain` must be `backend` for writes produced by ModelGate.
- `redactionPolicy` must state how secrets and large content were excluded.

Forbidden payload content:

- access tokens, refresh tokens, authorization headers, cookies, secrets, raw env values, or credentials,
- raw `.env` contents,
- unbounded prompts, chat transcripts, repository contents, Matrix event dumps, or full upstream error bodies,
- browser-local restored state as evidence truth,
- browser-owned Matrix write payloads.

## Event Semantics

### `matrix_approval_record`

Target: `#approvals`

Records that the backend accepted explicit user approval intent for a valid backend-owned plan.

This record should be written before execute when evidence writes are enabled. It must not itself execute the plan.

### `matrix_provenance_record`

Target: `#provenance-log`

Records the scope, snapshot, source, authority context, risk, and sanitized before/after plan basis used to create a Matrix action plan.

This record is normally produced after analyze creates the backend-owned plan.

### `matrix_verification_result`

Target: `#verification-results`

Records verification after the backend compares expected Matrix state with observed Matrix state.

It must distinguish `verified`, `mismatch`, `failed`, and `blocked`. It must not claim success unless observed Matrix state matches expected state.

### `matrix_topic_change_record`

Target: `#topic-change-log`

Records a topic update execution receipt after Matrix accepts the topic write.

It may include the Matrix transaction/event identifier, bounded before/after previews, and hashes. It must not claim verification until the verify step has completed.

### `matrix_evidence_write_failed`

Target: runtime journal first; Matrix evidence room only if safely possible.

Records evidence write failure details with sanitized error code, phase, plan ID, target evidence room, and retry posture. It must never include tokens, raw headers, or full upstream error bodies.

If the evidence writer cannot write this failure event to Matrix, the runtime journal remains the required record.

## Append-Only Semantics

- Evidence messages are append-only records.
- Do not edit or overwrite previous evidence messages.
- Corrections must be new follow-up records that reference the prior `planId`, `transactionId`, or Matrix event ID when available.
- A later verification mismatch must not rewrite an earlier execute receipt.
- Failed evidence writes must be recorded internally in the runtime journal and surfaced as `matrix_evidence_write_failed` if Matrix can be written safely.

## Fail-Closed Rules

- If approval evidence write fails before execute and `MATRIX_EVIDENCE_WRITES_REQUIRED=true`, execute must be blocked before the topic update.
- If approval evidence write fails before execute and evidence writes are optional, execute may continue, but the runtime journal must record the evidence gap.
- If execute succeeds but any evidence write fails, the runtime journal must record the gap with sanitized phase, target, and error code.
- Verification must not claim success unless observed Matrix state matches expected Matrix state.
- Evidence-room write failure must never mutate the original plan into verified success.
- Evidence write success must not compensate for failed execute or failed verification.
- Evidence target misconfiguration, missing joined room, insufficient send permission, timeout, malformed Matrix response, or forbidden payload fields must fail closed when evidence writes are required.
- Browser-supplied credentials, browser-originated Matrix writes, or secret-bearing payloads must always be rejected.

## MVP Policy Decision

MVP policy: Option B.

Execute can succeed when evidence writes are optional, but evidence write failure creates a blocking launch warning and a runtime journal gap record.

Rationale:

- It is the smallest safe launch policy because the existing topic governance flow has already been live-smoked and should not be blocked by a new external audit room dependency during initial rollout.
- It keeps execution authority in the backend and verification tied to observed Matrix state.
- It makes evidence gaps operationally visible and prevents launch readiness from being claimed while evidence writes are failing.
- It preserves a clear upgrade path: set `MATRIX_EVIDENCE_WRITES_REQUIRED=true` after dedicated evidence rooms are provisioned, joined, permission-checked, and live-smoked.

Launch readiness must remain blocked while evidence writes are required by launch criteria but failing in practice.

## Implementation Plan

Docs-only outline for the later backend slice:

1. Add Matrix client method:
   - `sendRoomMessage(roomId, content)`
   - use Matrix `PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}`
   - return normalized Matrix event/transaction identifier
   - sanitize error mapping and never log bearer tokens

2. Add evidence writer module:
   - build and validate evidence payloads,
   - enforce allowed event types,
   - enforce payload redaction and size limits,
   - route event categories to configured evidence target room IDs,
   - support optional and required evidence-write modes.

3. Add route integration points:
   - after analyze: optional `matrix_provenance_record`,
   - after approval accepted and before execute: `matrix_approval_record`,
   - after execute success: `matrix_topic_change_record`,
   - after verify completes: `matrix_verification_result`,
   - on evidence write failure: runtime journal record and possible `matrix_evidence_write_failed`.

4. Add tests before implementation:
   - payload builder tests,
   - Matrix client send message tests,
   - optional evidence failure route tests,
   - required evidence failure route tests,
   - runtime journal gap tests.

5. Add live smoke extension:
   - keep existing `npm run test:matrix-live` unchanged,
   - add a separate opt-in evidence smoke only after a dedicated evidence room exists,
   - never send broad room messages outside the configured smoke/evidence target.

## Validation Plan

Required validation after implementation:

- `npm run typecheck`
- `npm test`
- `npm run test:matrix-live`
- unit tests for evidence writer redaction and failure behavior
- route tests for approval/evidence failure cases
- optional live smoke against a dedicated evidence room

Validation expectations:

- no secrets printed,
- no env values logged,
- no browser-owned Matrix writes,
- no room or space creation,
- no taxonomy provisioning,
- no UI hierarchy change,
- existing topic governance live smoke remains green before evidence smoke is considered.

## Scope Exclusions

- no taxonomy provisioning,
- no room creation,
- no space creation,
- no canonical alias creation,
- no hierarchy linking,
- no onboarding taxonomy,
- no power-level provisioning,
- no Matrix hierarchy preview behavior change,
- no browser-side Matrix credentials,
- no browser-side Matrix writes,
- no broad Matrix room composer feature,
- no writes to `#change-proposals` in MVP.
