# ModelGate Console / Guided Workspace

## Status Ledger

- Locally verified: backend health, public model alias, SSE chat consumption, PWA shell, thin nav tabs, reducer-driven chat state, restored-session badge, beginner/expert shell toggle, GitHub repos/context/proposal/execute/verify, Matrix whoami, joined rooms, scope resolve, scope summary, provenance, topic-access, analyze, room topic plan/execute/verify, Matrix malformed-200 fail-closed behavior
- Partially covered: Matrix hierarchy preview still depends on a browser-side mock in this repo because the server route is not wired here
- Deferred: live Matrix E2E verification against a real Matrix origin, Undo, cross-device sync, bulk review queue, advanced observability

## UI Boundaries

- `ModelGate Console` is the visible brand
- primary navigation is `Chat`, `GitHub Workspace`, `Matrix Workspace`, `Review`, `Settings`
- `Chat` is a consumer surface for backend-owned SSE and renders public model aliases only
- `GitHub Workspace` reads allowed repos, prepares proposals, and stays review-first and approval-gated
- `Matrix Workspace` covers Explore, Analyze, Review, and Verify; backend-owned write flows stay approval-gated
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
- treating Matrix hierarchy preview as wired backend truth

