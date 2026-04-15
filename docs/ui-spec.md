# Sovereign Console / Stitch v1

## Status Ledger

- Locally verified: backend health, public model alias, SSE chat consumption, thin shell tabs, reducer-driven chat state, Matrix malformed-200 fail-closed behavior, Matrix read-only `/api/matrix/*` routes
- Contract-only / external-backend: Matrix Analyze / Review / Execute / Verify, provenance payload shape, execution verification payload shape, Matrix write and approval surfaces
- Deferred: live Matrix E2E verification against a real Matrix origin, repository-local intake contract, browser-side write authority, Undo, cross-device sync, bulk review queue, advanced observability

## UI Boundaries

- `Chat` is a consumer surface for backend-owned SSE and renders public model aliases only
- `Matrix Workspace` is a fail-closed overlay with locally wired read-only Explore routes and contract-only analysis/write stages
- restored local state is visible, but it is never backend truth

## Verified Streaming Contract

- `start`
- zero or more `token`
- exactly one terminal `done` or `error`
- start-only, truncated, or otherwise malformed streams fail closed instead of being auto-repaired

## Non-Goals

- multi-device sync
- bulk queues
- provider routing in the browser
- direct Matrix writes from the frontend
- silent repair of malformed streams
