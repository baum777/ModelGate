# ModelGate Console / Guided Workspace v1

## Status Ledger

- Locally verified: backend health, public model alias, SSE chat consumption, thin shell tabs, reducer-driven chat state, Matrix malformed-200 fail-closed behavior, Matrix read-only `/api/matrix/*` routes, beginner/expert shell toggle
- Contract-only / external-backend: Matrix Analyze / Review / Execute / Verify, provenance payload shape, execution verification payload shape, Matrix write and approval surfaces
- Deferred: live Matrix E2E verification against a real Matrix origin, repository-local intake contract, browser-side write authority, Undo, cross-device sync, bulk review queue, advanced observability

## UI Boundaries

- `ModelGate Console` is the visible brand
- primary navigation is `Chat`, `GitHub Workspace`, `Matrix Workspace`, `Review`, `Settings`
- `Chat` is a consumer surface for backend-owned SSE and renders public model aliases only
- `GitHub Workspace` and `Matrix Workspace` stay backend-authoritative, with browser-side proposal intent only
- `Review` is the only approval surface
- `Settings` hosts beginner/expert mode and Expert-only diagnostics
- restored local state is visible, but it is never backend truth

## Beginner / Expert Visibility

| Field | Beginner | Expert |
| --- | --- | --- |
| request id / plan id | hidden | visible in `Technische Details` |
| repo slug / branch / commit hash | hidden | visible in `Technische Details` |
| raw diff / raw payload / raw logs / raw telemetry | hidden | visible only in `Technische Details` or `Settings > Diagnose` |
| room id / space id / event id | hidden | visible in `Technische Details` |
| route / provider / model id | hidden | visible in `Technische Details` |
| HTTP status / latency / backend route status | hidden | visible in `Technische Details` |
| SSE lifecycle / runtime event trail | hidden | visible in `Technische Details` |

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
