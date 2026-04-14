# ModelGate

ModelGate is a backend-first OpenRouter proxy with a thin React client.

The backend is the authority layer for:

- provider access
- env validation
- `/chat` request/response contract
- SSE framing and error shaping
- `/models` exposure of only intentionally supported consumer-selectable models
- stable public model aliases with hidden provider-target substitution

The frontend is a consumer only. It should not own provider logic, prompting policy, or transport semantics.

## Repo Layout

- `server/` - Fastify backend for `/health`, `/models`, and `/chat`
- `web/` - Vite + React client with OpenRouter chat and Matrix Workspace tabs

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure the backend env:

```bash
cp server/.env.example server/.env
```

Set `OPENROUTER_API_KEY` in `server/.env`.

3. Optionally configure the client env:

```bash
cp web/.env.example web/.env
```

Use this only if you need to override the backend base URL.
Set `VITE_MATRIX_API_BASE_URL` if the Matrix Workspace backend runs on a separate origin.

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

## Current Scope

Implemented:

- local backend proxy
- strict chat input validation
- sanitized backend error responses
- SSE streaming with backend-owned event framing
- stable public model aliasing with backend-owned provider fallback
- small backend test slice

Not in scope for this branch:

- auth
- persistence
- conversation history
- uploads
- tools / MCP
- RAG
- multi-provider orchestration
