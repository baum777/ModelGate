# ModelGate

ModelGate is a backend-first OpenRouter proxy with a thin React client.

The current console overlay is the Sovereign Console / Stitch v1 surface:

- `Chat` consumes backend-owned SSE streams and only renders a public model alias
- `Matrix Workspace` now has locally wired read-only backend routes for Explore (`whoami`, `joined-rooms`, `scope resolve`, `scope summary`) plus a backend-owned, approval-gated room topic plan/execute/verify slice
- the remaining Matrix analysis/provenance/hierarchy surfaces stay backend-owned and fail-closed
- the browser owns UI state only; provider calls, Matrix truth, and execution truth stay backend-owned

The backend is the authority layer for:

- provider access
- env validation
- `/chat` request/response contract
- SSE framing and error shaping
- `/models` exposure of only intentionally supported consumer-selectable models
- stable public model aliases with hidden provider-target substitution

The frontend is a consumer only. It should not own provider logic, prompting policy, or transport semantics.

## Integration Status

Locally verified:

- `GET /health`
- `GET /models`
- `POST /chat`
- SSE lifecycle: `start -> token* -> done|error`
- Matrix read-only backend routes against a local mock Matrix origin
- Matrix approval-gated room topic update flow:
  - `POST /api/matrix/actions/promote`
  - `GET /api/matrix/actions/:planId`
  - `POST /api/matrix/actions/:planId/execute`
  - `GET /api/matrix/actions/:planId/verify`
- Matrix malformed-200 fail-closed behavior in the frontend adapter

Contract-only / external-backend:

- Matrix Analyze
- Matrix Review
- Matrix provenance / hierarchy endpoints that are not locally wired yet

Locally wired but read-only:

- `GET /api/matrix/whoami`
- `GET /api/matrix/joined-rooms`
- `POST /api/matrix/scope/resolve`
- `GET /api/matrix/scope/:scopeId/summary`

Deferred:

- live Matrix E2E verification against a real Matrix origin
- Undo
- cross-device sync
- bulk review queue
- advanced observability

Live smoke note:

- the local chat backend was reachable on `http://127.0.0.1:8787/chat` during the repair session
- streamed `POST /chat` emitted `start -> error` in that environment because the upstream provider returned `upstream_error`
- the Matrix read-only backend slice was smoke-tested against a local mock Matrix origin; real Matrix origin integration is still deferred

## Repo Layout

- `server/` - Fastify backend for `/health`, `/models`, `/chat`, read-only `/api/matrix/*` routes, and the approval-gated Matrix topic plan flow
- `web/` - Vite + React client with Sovereign Console tabs and Matrix Workspace overlays

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure the backend env:

```bash
cp server/.env.example .env
```

Set `OPENROUTER_API_KEY` in `.env`.

3. Optionally configure the client env:

```bash
cp web/.env.example web/.env
```

Use this only if you need to override the backend base URL.
Set `VITE_MATRIX_API_BASE_URL` if you need to point the client at a different backend origin.
The default local origin is `http://127.0.0.1:8787`.

## Run Locally

Start the backend:

```bash
npm run dev:server
```

Start the client in a second terminal:

```bash
npm run dev:web
```

## Backend Contract

Use [`server/README.md`](server/README.md) as the authoritative contract reference for:

- required env vars
- `GET /health`
- `GET /models`
- `POST /chat`
- non-stream response shape
- SSE event model
- known limitations

## Verification

Backend checks:

```bash
npm run typecheck:server
npm run test:server
```

Full workspace checks:

```bash
npm run typecheck
npm run build
```

Vercel deployment notes:

- [`docs/vercel-deployment.md`](docs/vercel-deployment.md)

## Current Scope

Implemented:

- local backend proxy
- strict chat input validation
- sanitized backend error responses
- SSE streaming with backend-owned event framing
- stable public model aliasing with backend-owned provider fallback
- rules-first LLM router with private append-only local evidence logs under `.local-ai/`
- thin console shell with backend health, model alias, and restored-session signaling
- reducer-driven chat draft handling with malformed-stream visibility
- locally wired Matrix read-only routes with fail-closed snapshot storage
- backend-owned Matrix topic update plan / execute / verify flow with in-memory TTL plans
- Matrix contract overlay for the remaining Analyze / Review / provenance / hierarchy surfaces
- small deterministic test slice for chat and Matrix gating helpers

Not in scope for this branch:

- auth
- persistence
- conversation history
- uploads
- tools / MCP
- RAG
- multi-provider orchestration

Current gap:

- Matrix Analyze / Review / provenance / hierarchy surfaces are still external to this repo and must remain fail-closed when unavailable or malformed
