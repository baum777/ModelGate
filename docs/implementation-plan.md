# ModelGate Console Implementation Plan

## Objective

Deliver a thin console overlay that makes backend authority visible, keeps SSE chat deterministic, and preserves a beginner-safe shell with a central expert-only disclosure path.

## Current Truth

- Chat backend authority already exists in `server/src/routes/chat.ts`
- `/health` and `/models` are implemented backend seams
- `POST /chat` streaming is locally verified with exactly one terminal event: `done` or `error`
- Matrix read-only Explore routes, provenance, topic-access, analyze, and approval-gated topic update plan/execute/verify are locally wired against backend-owned Matrix client logic
- Matrix frontend adapters validate malformed `200 OK` payloads and fail closed
- Browser navigation and visibility are now being refactored toward `Chat / GitHub Workspace / Matrix Workspace / Review / Settings`

## Integration Status

Locally verified:

- `GET /health`
- `GET /models`
- `POST /chat`
- SSE terminal lifecycle: `start -> token* -> done|error`
- Matrix read-only `/api/matrix/*` routes
- Matrix malformed-200 fail-closed behavior
- beginner/expert disclosure guard in the shell and workspaces

Partially wired / external-backend:

- Matrix hierarchy preview in the browser is advisory/mock-only and does not represent backend-verified authority
- live Matrix E2E verification against a real Matrix origin

Deferred:

- Undo
- cross-device sync
- bulk review queue
- advanced observability

## Gaps

- no live Matrix E2E verification against a real Matrix origin
- no repo-local Codex intake contract
- no browser-side persistence contract for approved writes

## Next Slices

1. Final IA and beginner-safe shell navigation
2. Central beginner/expert disclosure guard
3. Reduce repeated safety/status copy
4. Add first-class Review and Settings workspaces
5. Docs and smoke coverage for shell visibility

## Acceptance Criteria

- backend health and public model alias are visible in the header
- chat finalizes exactly one mutable assistant draft on `done` and terminates on `error` when the provider fails
- malformed SSE is visible, not auto-repaired
- Matrix review stays approval-gated and fail-closed
- Beginner Mode hides technical identifiers, raw diffs, logs, payloads, route names, request IDs, and plan IDs
