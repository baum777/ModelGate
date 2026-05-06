# MosaicStack Operating Contract

This repo is a backend-first console overlay.

## Authority

- Backend owns provider calls, SSE framing, model routing, and execution truth
- Browser owns rendering, local UI state, stream consumption, and approval intent
- Matrix is an external contract surface unless the server explicitly implements it here

## Hard Rules

- Never expose provider IDs as UI truth
- Never hold Matrix credentials in the browser
- Never treat restored local state as backend-fresh truth
- Never silently repair malformed SSE or Matrix responses
- Never allow browser writes to bypass backend approval gating

## Working Rules

- Prefer small, reviewable slices
- Keep consumer UI thin and deterministic
- Record when a surface is implemented, contract-only, or missing
- Fail closed on ambiguous or partial state

## Current Integration Ledger

- Locally verified: `GET /health`, `GET /models`, `POST /chat`, SSE terminal lifecycle `start -> token* -> done|error`, Matrix malformed-200 fail-closed behavior, Matrix read-only `/api/matrix/*` routes
- Contract-only / external-backend: Matrix Analyze, Review, Execute, Verify, and Matrix write / approval / provenance / hierarchy endpoints
- Deferred: live Matrix E2E verification against a real Matrix origin, Undo, cross-device sync, bulk review queue, advanced observability
- Approval-gated Matrix execution remains a contract posture until a real Matrix origin exists and is exercised end-to-end
