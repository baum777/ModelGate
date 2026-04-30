# Matrix Evidence-Room Write Contract

Status: contract-only.

This document defines the next bounded Matrix write slice before implementation. It does not implement taxonomy provisioning, broad Matrix writes, UI hierarchy changes, token/env changes, or room creation automation.

## Purpose

Matrix evidence-room writes make the backend-visible governance trail readable in Matrix after an already-approved backend action. Matrix remains an external evidence surface, not the authority source.

Authority stays with:

- backend-owned Matrix credentials,
- backend-owned action plans,
- backend runtime journal,
- explicit user approval before execution,
- verification against Matrix state after execution.

The browser may request, preview, and approve intent. It must not hold Matrix credentials or write directly to Matrix.

## Target Rooms

The evidence writer must accept exact room IDs or canonical aliases from backend configuration. The implementation must not create rooms, discover target aliases by guessing, or auto-provision a taxonomy.

Required targets:

| Evidence target | Preferred alias | Purpose |
| --- | --- | --- |
| approvals | `#approvals:<server>` | Records explicit approval decisions for backend-owned plans. |
| provenance | `#provenance-log:<server>` | Records source/scope/provenance snapshots used to generate a plan. |
| verification | `#verification-results:<server>` | Records verification results after backend execution. |
| topic changes | `#topic-change-log:<server>` | Records topic update before/after summaries and Matrix transaction IDs. |

Configuration names should be explicit and backend-only:

```env
MATRIX_EVIDENCE_APPROVALS_ROOM_ID=
MATRIX_EVIDENCE_PROVENANCE_ROOM_ID=
MATRIX_EVIDENCE_VERIFICATION_ROOM_ID=
MATRIX_EVIDENCE_TOPIC_CHANGE_ROOM_ID=
MATRIX_EVIDENCE_WRITES_ENABLED=false
MATRIX_EVIDENCE_WRITES_REQUIRED=false
```

When `MATRIX_EVIDENCE_WRITES_ENABLED=false`, topic execution and verification must keep working with runtime journal only.

When `MATRIX_EVIDENCE_WRITES_REQUIRED=true`, execute/verify must fail closed if the required evidence room write cannot be completed for the corresponding phase.

## Event Payload Shape

The backend should send plain Matrix room messages using `m.room.message` with `msgtype: "m.notice"` by default. Messages must be human-readable and include a compact machine-readable JSON block.

Message content shape:

```json
{
  "msgtype": "m.notice",
  "body": "MosaicStack evidence: <eventType> <planId> <status>",
  "format": "org.matrix.custom.html",
  "formatted_body": "<strong>MosaicStack evidence</strong>: <code>eventType</code> <code>planId</code> <code>status</code>",
  "mosaicstack.evidence": {
    "schemaVersion": 1,
    "eventType": "approval_recorded",
    "planId": "plan_...",
    "roomId": "!target-room:server",
    "scopeId": "scope_...",
    "snapshotId": "snapshot_...",
    "actorUserId": "@bot:server",
    "status": "approved",
    "createdAt": "2026-04-30T00:00:00.000Z",
    "summary": "Operator approved Matrix topic update.",
    "safeMetadata": {}
  }
}
```

Required constraints:

- no access tokens, refresh tokens, authorization headers, cookies, secrets, raw env values, or full upstream error bodies,
- no unbounded prompt, chat, or repository content,
- no browser-local restored state as evidence truth,
- no hidden room discovery claims,
- no direct browser write payloads.

## Write Semantics

### Approval Record

Write to approvals room after the backend accepts explicit approval for a valid plan and before executing the external Matrix topic update.

Event type: `approval_recorded`

Required fields:

- `planId`
- `roomId`
- `scopeId` or `null`
- `snapshotId` or `null`
- `actorUserId`
- `status: "approved"`
- `createdAt`
- `summary`

If approval evidence write fails:

- when evidence writes are optional: continue execution, append runtime journal warning,
- when evidence writes are required: block execution before topic update and return fail-closed error.

### Provenance Record

Write to provenance room after `/api/matrix/analyze` creates a backend-owned plan.

Event type: `provenance_recorded`

Required fields:

- `planId`
- `roomId`
- `scopeId` or `null`
- `snapshotId` or `null`
- `currentValueHash`
- `proposedValueHash`
- `risk`
- `createdAt`
- `summary`

The provenance message may include short non-sensitive before/after previews, but hashes must be present so long topics can be compared without dumping full content.

### Verification Result

Write to verification room after `/api/matrix/actions/:planId/verify` compares expected and actual Matrix state.

Event type: `verification_recorded`

Required fields:

- `planId`
- `roomId`
- `status: "verified" | "mismatch" | "pending" | "failed"`
- `expectedHash`
- `actualHash` or `null`
- `checkedAt`
- `summary`

If verification write fails:

- verification result returned to the caller must remain based on Matrix state, not on evidence-room status,
- runtime journal must record the evidence-write failure separately.

### Topic Change Record

Write to topic-change room after execute succeeds and Matrix returns the topic update transaction/event ID.

Event type: `topic_change_recorded`

Required fields:

- `planId`
- `roomId`
- `transactionId`
- `beforeHash`
- `afterHash`
- `executedAt`
- `summary`

The message must never claim verification until verify has run. Use `topic_change_recorded` for execution receipt and `verification_recorded` for verified state.

## Fail-Closed Behavior

Evidence writes must fail closed only when explicitly required by backend configuration. Otherwise they are best-effort external evidence.

Always fail closed for:

- Matrix backend not configured when required,
- evidence target missing when `MATRIX_EVIDENCE_WRITES_REQUIRED=true`,
- evidence target not joined when required,
- bot lacks permission to send `m.room.message` when required,
- malformed Matrix response from evidence write when required,
- attempt to write from browser-owned credentials or browser-supplied access token,
- payload contains forbidden secret-like fields before send.

Do not fail topic execution solely because optional evidence writes are disabled or unavailable.

## Test Plan Before Implementation

Add tests before implementation in this order:

1. Contract validation tests for evidence payload builders:
   - rejects secret-like keys and raw token fields,
   - requires `schemaVersion`, `eventType`, `planId`, and timestamp,
   - permits only known event types.

2. Matrix client tests for `sendRoomMessage(roomId, content)`:
   - sends `PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}`,
   - normalizes `event_id`,
   - maps 401/403/404/timeout/malformed response into existing Matrix error codes,
   - never logs bearer token.

3. Route tests for optional evidence writes:
   - analyze still returns a plan if provenance write fails while optional,
   - execute still updates topic if evidence writes are optional and evidence room fails,
   - runtime journal records evidence write failure.

4. Route tests for required evidence writes:
   - execute blocks before topic update if approval evidence cannot be written,
   - execute blocks before topic update if required target room is missing or not joined,
   - verify returns Matrix verification state only after required verification evidence write succeeds.

5. Live smoke extension, opt-in only:
   - after existing `npm run test:matrix-live` remains green,
   - add a separate evidence-room live smoke only when dedicated evidence rooms exist,
   - never wire evidence-room live smoke into default `npm test`.

## Non-Goals

- no Matrix room creation,
- no canonical alias creation,
- no space linking,
- no power-level mutation,
- no Element onboarding automation,
- no browser-side Matrix write path,
- no UI hierarchy behavior change,
- no broad Matrix composer send feature.

