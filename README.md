# MosaicStack

MosaicStack is a community-first, model-agnostic interface for working with your own repository, your own setup, and a shared Matrix-based knowledge space.

It is meant to be read first as a GitHub project viewer: what the project is for, what it connects, what is implemented, and what still remains contract-only.

## What It Is

MosaicStack is an individualized multi-layer interface for people who want to use AI models without turning one provider, one UI, or one private workflow into the source of truth.

The project connects three layers:

- your repository as the local working and review surface,
- model-agnostic chat and planning through backend-owned routing,
- a Matrix server as an exchange and interaction space for concepts, ideas, setups, skills, decisions, and reusable knowledge.

The long-term direction is a community-first workspace where individuals can preserve their own operating context while making useful patterns understandable for other users.

## Why It Exists

Most AI tooling is either provider-first, chat-first, or too developer-centered. MosaicStack starts from a different assumption:

- users should be able to connect their own repo and inspect work in GitHub terms,
- model choice should stay behind a stable public interface instead of becoming UI truth,
- shared knowledge should have a durable home outside one browser session,
- community documentation should grow from real workflows, not from detached examples.

## Current Product Shape

MosaicStack is currently a backend-first console overlay with a browser UI.

The browser renders results, keeps local UI state, and sends approval intent. The backend owns provider calls, model routing, GitHub reads/writes, Matrix credentials, SSE framing, and execution truth.

### GitHub Viewer And Review Surface

The GitHub layer is the main viewer-facing path:

- browse allowed repositories,
- read selected repo context,
- ask for review or proposal plans,
- inspect generated diffs before execution,
- execute only through backend approval gates,
- verify the result against GitHub state.

This keeps the browser review-first and prevents direct browser writes from becoming the authority path.

### Matrix Knowledge Space

The Matrix layer is the planned exchange and interaction space for documenting:

- concepts and project ideas,
- setup notes and operating patterns,
- reusable skills and workflows,
- room/topic context,
- provenance and review discussions.

Read-only Matrix routes and several planning surfaces exist in this repo. Matrix write, approval, provenance, hierarchy, and live end-to-end verification remain bounded by the status notes below.

## Status

### Locally Verified

- `GET /health`
- `GET /models`
- `POST /chat`
- SSE lifecycle: `start -> token* -> done|error`
- Matrix malformed-200 fail-closed behavior
- Matrix read-only `/api/matrix/*` routes

### Implemented When Configured

| Area | Surface |
| --- | --- |
| Chat | Health, public model aliases, non-stream chat, SSE chat |
| GitHub | Allowed repo listing, context reads, proposal plans, approval-gated execute, verification, tree/file reads |
| Matrix | Identity, joined rooms, scope summaries, room provenance, topic access, analyze/action plan routes |

### Contract-Only Or Deferred

- Matrix Analyze, Review, Execute, Verify, and Matrix write flows remain external-backend or contract-bound until verified against a real Matrix origin.
- Matrix hierarchy preview is browser-side advisory/mock-only in this repo.
- Undo, cross-device sync, bulk review queue, and advanced observability are deferred.
- `GITHUB_APP_*` fields are reserved placeholders and are not wired into the current runtime path.

## Trust Boundaries

- Provider IDs are not UI truth.
- Matrix credentials never belong in the browser.
- Restored browser state is local UI state, not backend-fresh truth.
- Malformed SSE or Matrix responses fail closed instead of being silently repaired.
- Browser writes cannot bypass backend approval gating.

## Repository Map

- `web/` - Vite + React browser interface.
- `server/` - Fastify authority layer for chat, GitHub, Matrix, and shared serverless reuse.
- `api/[...path].ts` - Vercel serverless entrypoint.
- `config/model-capabilities.yml` - runtime-loaded workflow routing contract.
- `docs/model-routing.md` - model routing behavior and policy notes.
- `docs/integration-auth-rotation-live-smoke.md` - opt-in live smoke setup.

## Running Locally

Install dependencies:

```bash
npm install
```

Create local env files:

```bash
cp .env.example .env
cp web/.env.example web/.env
```

Set `USER_CREDENTIALS_ENCRYPTION_KEY` in `.env`, then enter your OpenRouter API key and model ID in Settings. The Settings flow stores the key backend-side for the local preview profile and never returns the key to the browser.

`OPENROUTER_API_KEY` is a legacy/dev compatibility slot only; it is not the normal shared runtime authority for user chat.

Optional integrations:

- GitHub routes require `GITHUB_TOKEN` and `GITHUB_ALLOWED_REPOS`.
- Approval-gated GitHub execute also requires `GITHUB_AGENT_API_KEY`, sent only as `X-MosaicStack-Admin-Key` from trusted server-side callers.
- Matrix routes require `MATRIX_ENABLED=true`, `MATRIX_BASE_URL`, and `MATRIX_ACCESS_TOKEN`.

Run backend and browser:

```bash
npm run dev:server
npm run dev:web
```

The backend reads the repo-root `.env`. The browser reads `web/.env` only for browser-side origin overrides.

## Deployment

MosaicStack is deployed as a Vite frontend plus a single Node serverless entrypoint.

- Vercel project root: repository root
- Build command: `npm run build`
- Output directory: `web/dist`
- API entrypoint: `api/[...path].ts`
- Shared backend implementation: `server/src/app.ts`

Keep secrets server-side in Vercel project env settings.

## Verification

Suggested local checks:

```bash
npm run typecheck
npm test
npm run build
```

More focused checks:

```bash
npm run typecheck:server
npm run test:server
npm run typecheck:web
npm run test:web
npm run test:browser
```

Opt-in live checks:

```bash
npm run test:matrix-live
npm run test:matrix-evidence-live
npm run test:integration-auth-rotation-live
npm run test:integration-auth-rotation-live:matrix
npm run test:integration-auth-rotation-live:both
```
