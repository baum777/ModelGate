# Server

Fastify-based backend authority for OpenRouter chat, GitHub workspace review, and Matrix workspace operations.

## Scripts

- `npm run dev` - start the server with watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm run start` - run the compiled server
- `npm run typecheck` - run the TypeScript compiler without emitting
- `npm run test` - run the backend test slice with Node's test runner

## Environment

Copy the repo-root `.env.example` to `.env`. Normal MosaicStack chat is user-key based: enter the OpenRouter API key and model ID in Settings, not in browser env and not by editing `.env` from the UI.

The workflow-routing contract is documented in [../docs/model-routing.md](../docs/model-routing.md) and backed by `config/model-capabilities.yml` at runtime.

The example env files use `default` as a backend-owned sentinel in some compatibility slots. Actual provider targets remain server-side.

Required environment variables for production user chat:

- `USER_CREDENTIALS_ENCRYPTION_KEY` - encrypts per-profile OpenRouter credentials; production fails closed when missing

Legacy/dev-only OpenRouter env slots:

- `OPENROUTER_API_KEY` - compatibility path for older backend-owned chat tests/dev setups only; it must not silently satisfy normal user-configured chat

GitHub remote flow required when enabled:

- `GITHUB_TOKEN` - required GitHub token for the backend-owned remote flow
- `GITHUB_ALLOWED_REPOS` - required comma-separated allowlist of `owner/repo` values; the GitHub remote flow stays fail-closed until at least one repository is allowed
- `GITHUB_AGENT_API_KEY` - required to approve execute requests; send it only from trusted server-side callers via `X-MosaicStack-Admin-Key`

Optional environment variables:

- `PORT` - defaults to `8787`
- `HOST` - defaults to `127.0.0.1`
- `OPENROUTER_BASE_URL` - OpenRouter API base URL, defaults to `https://openrouter.ai/api/v1`
- `OPENROUTER_MODEL` - provider execution target for the public default alias
- `OPENROUTER_MODELS` - comma-separated hidden provider fallback pool
- `OPENROUTER_REQUEST_TIMEOUT_MS` - OpenRouter request timeout in milliseconds, defaults to `15000`
- `USER_CREDENTIALS_PROFILE_SECRET` - optional signing secret for the local preview profile cookie; falls back to existing backend session/credential secret material in local preview
- `USER_CREDENTIALS_STORE_MODE` - `file` or `memory`; use `file` for durable local profiles, reserve `memory` for dev-only tests
- `USER_CREDENTIALS_STORE_PATH` - base directory for encrypted per-profile OpenRouter credential files, defaults to `.local-ai/state/users`
- `APP_NAME` - defaults to `local-openrouter-chat`
- `DEFAULT_SYSTEM_PROMPT` - injected server-side before forwarding to OpenRouter
- `CORS_ORIGINS` - comma-separated list of allowed frontend origins
- `CHAT_MODEL` - explicit backend-owned chat workflow model
- `CODE_AGENT_MODEL` - backend-owned GitHub proposal planning model
- `STRUCTURED_PLAN_MODEL` - backend-owned structured-output model for schema-critical plan objects
- `MATRIX_ANALYZE_MODEL` - parsed Matrix analyze policy input; deferred, not runtime-authoritative
- `FAST_FALLBACK_MODEL` - backend-owned non-execute fallback model
- `DIALOG_FALLBACK_MODEL` - backend-owned dialogue fallback model
- `MODEL_ROUTING_MODE` - workflow routing mode, currently only `policy`
- `ALLOW_MODEL_FALLBACK` - allows fallback on non-execute workflow phases
- `MODEL_ROUTING_FAIL_CLOSED` - keeps workflow routing fail-closed
- `MODEL_ROUTING_LOG_ENABLED` - enables local workflow routing evidence logging
- `MODEL_ROUTING_LOG_PATH` - repository-local workflow routing log path
- `LLM_ROUTER_ENABLED` - defaults to `false`; enables the deterministic rules-first router policy
- `LLM_ROUTER_MODE` - currently only `rules_first`
- `LLM_REQUIRE_FREE_MODELS` - defaults to `true`; filters router candidates to free models
- `LLM_MAX_FALLBACKS` - caps fallback attempts after the primary model
- `LLM_ROUTER_FAIL_CLOSED` - defaults to `true`; keeps routing fail-closed when no valid candidate remains
- `LLM_DEFAULT_MODEL` - backend-internal default model used by the router policy
- `LLM_FALLBACK_MODEL` - backend-internal fallback model used by the router policy
- `LLM_MODEL_*` - task-specific backend-internal model ids for the router policy
- `LLM_ROUTER_POLICY_PATH` - repo-root relative YAML policy path, defaults to `config/llm-router.yml`
- `LLM_PROMPT_CLASSIFIER_PATH` - optional override for classification rules
- `LLM_MODEL_MAP_PATH` - optional override for task-to-model mapping
- `LLM_FALLBACK_POLICY_PATH` - optional override for default/fallback policy values
- `LLM_ROUTER_LOG_ENABLED` - enables private append-only local router evidence logging under `.local-ai/`; logging failures are warning-only and do not block chat
- `LLM_ROUTER_LOG_PATH` - repository-local router decision log path, defaults to `.local-ai/logs/ROUTER_DECISIONS.log.md`
- `LLM_MODEL_RUN_LOG_PATH` - repository-local model run log path
- `LLM_PROMPT_EVIDENCE_LOG_PATH` - repository-local prompt evidence log path
- `MATRIX_ANALYZE_LLM_ENABLED` - parsed Matrix workflow policy flag; deferred, not runtime-authoritative
- `MATRIX_EXECUTE_APPROVAL_REQUIRED` - parsed Matrix workflow policy flag; deferred, not runtime-authoritative
- `MATRIX_VERIFY_AFTER_EXECUTE` - parsed Matrix workflow policy flag; deferred, not runtime-authoritative
- `MATRIX_ALLOWED_ACTION_TYPES` - parsed Matrix workflow action allowlist; deferred, not runtime-authoritative
- `MATRIX_FAIL_CLOSED` - parsed Matrix workflow policy flag; deferred, not runtime-authoritative
- `MATRIX_ENABLED` - defaults to `false`; enables the server-owned Matrix read-only routes when `true`
- `MATRIX_REQUIRED` - defaults to `false`; fails startup closed if Matrix is enabled but invalid
- `MATRIX_BASE_URL` - absolute Matrix homeserver origin used by the server when Matrix is enabled
- `MATRIX_HOMESERVER_URL` - alias for `MATRIX_BASE_URL`
- `MATRIX_ACCESS_TOKEN` - server-side Matrix access token
- `MATRIX_REFRESH_TOKEN` - optional server-side Matrix refresh token used to rotate access tokens backend-side
- `MATRIX_CLIENT_ID` - required when `MATRIX_REFRESH_TOKEN` is set; used for the refresh token grant
- `MATRIX_TOKEN_EXPIRES_AT` - optional ISO timestamp for the current access token expiry; near-expiry tokens are refreshed backend-side before the next Matrix request
- `MATRIX_EXPECTED_USER_ID` - optional Matrix user ID that must match `whoami` when set
- `MATRIX_REQUEST_TIMEOUT_MS` - upstream request timeout in milliseconds, defaults to `5000`
- `MATRIX_SMOKE_ROOM_ID` - dedicated live smoke room for the backend-owned topic-update flow
- `MATRIX_SMOKE_TOPIC_PREFIX` - optional prefix for the temporary live smoke topic
- `GITHUB_API_BASE_URL` - GitHub API base URL, defaults to `https://api.github.com`
- `GITHUB_DEFAULT_OWNER` - optional default owner used by GitHub routing helpers
- `GITHUB_BRANCH_PREFIX` - branch prefix for backend-created GitHub plans, defaults to `mosaicstack/github`
- `GITHUB_REQUEST_TIMEOUT_MS` - GitHub upstream request timeout in milliseconds, defaults to `8000`
- `GITHUB_PLAN_TTL_MS` - plan TTL in milliseconds, defaults to `720000`
- `GITHUB_MAX_CONTEXT_FILES` - max files collected for `/api/github/context`, defaults to `6`
- `GITHUB_MAX_CONTEXT_BYTES` - max context budget in bytes, defaults to `32768`
- `GITHUB_SMOKE_REPO` - optional repository used by the manual GitHub smoke path
- `GITHUB_SMOKE_BASE_BRANCH` - optional base branch for the manual GitHub smoke path
- `GITHUB_SMOKE_TARGET_BRANCH` - optional target branch for the manual GitHub smoke path
- `GITHUB_SMOKE_ENABLED` - optional boolean flag for the manual GitHub smoke path
- `GITHUB_APP_ID` - currently schema-only and not wired into the GitHub runtime path
- `GITHUB_APP_PRIVATE_KEY` - currently schema-only and not wired into the GitHub runtime path
- `GITHUB_APP_INSTALLATION_ID` - currently schema-only and not wired into the GitHub runtime path
- `MOSAIC_STACK_SESSION_TTL_SECONDS` - defaults to `86400`

## Local Run

```bash
npm install
npm run dev
```

Run the UI separately in another terminal if you are still using the local Vite client.

## HTTP Contract

The backend owns request validation, provider translation, and streaming semantics.

Matrix read-only routes are disabled by default. When disabled, they return
`matrix_not_configured` and leave the chat backend unaffected.

When refresh credentials are present, Matrix requests stay backend-only and the
server may rotate the access token on `M_UNKNOWN_TOKEN`/401 or when the current
token is near its expiry. The browser never receives the token material.

The router decision log is private, local, and gitignored. It is intended for
operator audit only and is not a canonical source of truth for model selection.

### `GET /health`

Returns backend status and the public default model alias.

### `GET /models`

Returns the backend-owned consumer-selectable model list.
The current branch exposes a single stable alias (`default`) rather than a provider catalog.
The hidden provider fallback pool stays behind the backend contract and is not exposed here.

### `GET /settings/openrouter/status`

Returns the local preview profile's safe OpenRouter credential status. The response includes only `configured` and safe model alias metadata. It never returns the API key.

### `POST /settings/openrouter/credentials`

Stores `{ "apiKey": "...", "modelId": "provider/model[:variant]" }` for the backend-created signed/httpOnly local preview profile cookie. The route rejects body-supplied profile/user/tenant authority, encrypts stored credentials, and returns only masked configured status.

### `POST /settings/openrouter/test`

Tests a provided `{ "apiKey": "...", "modelId": "provider/model[:variant]" }` pair without saving it. Responses are sanitized and do not include request headers, API keys, or raw provider payloads.

### `POST /chat`

Request body:

- `messages` required array of message objects
- each message must have `role` of `user` or `assistant`
- each message must have non-empty `content`
- `modelAlias` optional stable public alias override of the backend default model
- `model` legacy alias compatibility only; browser chat sends `modelAlias`
- `temperature` optional number between `0` and `2`
- `stream` optional boolean, defaults to `false`

The backend injects its own system prompt and rejects unknown top-level fields.
`messages` with `role: "system"` are rejected, so there is no merge behavior to infer.
The server-owned `DEFAULT_SYSTEM_PROMPT` is the sole system instruction used for a request.
The backend maps the public alias to an internal logical model and provider target set before calling OpenRouter.
For `user_openrouter_default`, the backend resolves signed profile cookie -> encrypted credential store -> API key + model ID. Missing credentials, unknown aliases, raw provider IDs, or decrypt/config failures fail closed before upstream calls.

Non-stream response:

```json
{
  "ok": true,
  "model": "default",
  "text": "Hello from the model"
}
```

Invalid request response:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Invalid chat request"
  }
}
```

Upstream/provider failure response:

```json
{
  "ok": false,
  "error": {
    "code": "upstream_error",
    "message": "Chat provider request failed"
  }
}
```

## SSE Contract

When `stream=true`, the backend returns `Content-Type: text/event-stream; charset=utf-8` and frames events in this order:

```text
event: start
data: {"ok":true,"model":"default"}

event: token
data: {"delta":"Hello"}

event: token
data: {"delta":" world"}

event: done
data: {"ok":true,"model":"default","text":"Hello world"}
```

Successful streams emit `start` exactly once, then zero or more `token` events, then exactly one terminal `done`.
`done` and `error` are mutually exclusive terminal events.

On provider failure after the stream has started, the backend emits a sanitized terminal error event:

```text
event: error
data: {"ok":false,"error":{"code":"upstream_error","message":"Chat provider request failed"}}
```

## GitHub Workspace Contract

These routes are backend-owned and review-first. The browser may read allowed repositories, build read context, prepare a proposal plan, and submit approval intent only. GitHub account authority comes from the backend-owned `GITHUB_TOKEN` and `GITHUB_ALLOWED_REPOS` configuration. Execution stays server-side and fails closed until `GITHUB_AGENT_API_KEY` is configured for trusted callers.

GitHub read and proposal routes do not require the legacy global admin session. The browser never sees the GitHub token, provider key, or execute key.

### `GET /api/github/repos`

Returns normalized allowed repository summaries.

### `POST /api/github/context`

Reads repository context for an allowed repo and returns a bounded backend-owned context bundle.

### `POST /api/github/actions/propose`

Creates a backend-owned proposal plan with a reviewable diff and returns an opaque `planId`.

### `GET /api/github/actions/:planId`

Returns the stored GitHub plan while it is still active.

### `POST /api/github/actions/:planId/execute`

Requires `{ "approval": true }`, re-checks the plan freshness, and creates the backend-owned execution result. The request must also include `X-MosaicStack-Admin-Key` matching `GITHUB_AGENT_API_KEY`; otherwise the route fails closed with 401 or 403. This execution gate is independent of the legacy session routes.

### `GET /api/github/actions/:planId/verify`

Re-reads the repository state and returns `verified`, `mismatch`, `pending`, or `failed`.

### `GET /api/github/repos/:owner/:repo/tree`

Returns a read-only file tree for an allowed repository.

### `GET /api/github/repos/:owner/:repo/file`

Returns a read-only file body for an allowed repository.

## Matrix Read-Only Contract

These routes are server-owned and fail closed. They do not expose Matrix credentials or raw upstream payloads.

### `GET /api/matrix/whoami`

Returns normalized identity information:

```json
{
  "ok": true,
  "userId": "@user:matrix.org",
  "deviceId": "DEVICEID_OR_NULL",
  "homeserver": "https://matrix.org"
}
```

### `GET /api/matrix/joined-rooms`

Returns normalized joined room metadata:

```json
{
  "ok": true,
  "rooms": [
    {
      "roomId": "!abc:matrix.org",
      "name": "Room name",
      "canonicalAlias": "#room:matrix.org",
      "roomType": "room"
    }
  ]
}
```

### `POST /api/matrix/scope/resolve`

Accepts normalized room and space selections and returns an opaque scope snapshot:

```json
{
  "roomIds": ["!abc:matrix.org"],
  "spaceIds": []
}
```

```json
{
  "ok": true,
  "scope": {
    "scopeId": "opaque-stable-scope-id",
    "type": "room",
    "rooms": [
      {
        "roomId": "!abc:matrix.org",
        "name": "Room name",
        "canonicalAlias": "#room:matrix.org",
        "roomType": "room"
      }
    ],
    "createdAt": "ISO_TIMESTAMP"
  }
}
```

### `GET /api/matrix/scope/:scopeId/summary`

Returns a bounded read-only summary for a cached scope snapshot:

```json
{
  "ok": true,
  "scopeId": "opaque-stable-scope-id",
  "snapshotId": "snapshot-id",
  "generatedAt": "ISO_TIMESTAMP",
  "items": [
    {
      "roomId": "!abc:matrix.org",
      "name": "Room name",
      "canonicalAlias": "#room:matrix.org",
      "members": 1,
      "freshnessMs": 42,
      "lastEventSummary": "Room metadata snapshot with 1 joined members",
      "selected": true
    }
  ]
}
```

### `GET /api/matrix/rooms/:roomId/provenance`

Returns normalized read-only room provenance derived from the joined-rooms backend path.

### `GET /api/matrix/rooms/:roomId/topic-access`

Returns Matrix topic power-level access details for a room and fails closed on identity or access mismatches.

### `POST /api/matrix/analyze`

Creates a backend-owned room topic analysis plan with a single `set_room_topic` action, `pending_review` status, and approval required.

### Matrix Error Response

All Matrix errors are normalized as:

```json
{
  "ok": false,
  "error": {
    "code": "matrix_not_configured",
    "message": "Matrix backend is not configured"
  }
}
```

Supported error codes:

- `matrix_not_configured`
- `invalid_request`
- `matrix_unauthorized`
- `matrix_forbidden`
- `matrix_room_not_found`
- `matrix_unavailable`
- `matrix_timeout`
- `matrix_malformed_response`
- `matrix_scope_not_found`
- `matrix_internal_error`

## Matrix Topic Write Contract

These routes are backend-owned and approval-gated. The browser may submit only a room id, proposed topic text, and approval intent for a backend-created plan id. The browser does not send raw Matrix write payloads or credentials.

Plans are stored in memory with a short TTL and are not persisted across restarts.

### `POST /api/matrix/analyze`

Request:

```json
{
  "type": "update_room_topic",
  "roomId": "!room:matrix.org",
  "topic": "New topic"
}
```

Behavior:

- validates the request shape
- reads the current room topic from Matrix
- creates a backend-owned plan with a reviewable before/after diff
- returns an opaque `planId`

Response:

```json
{
  "ok": true,
  "plan": {
    "planId": "opaque-plan-id",
    "type": "update_room_topic",
    "roomId": "!room:matrix.org",
    "status": "pending_review",
    "createdAt": "ISO_TIMESTAMP",
    "expiresAt": "ISO_TIMESTAMP",
    "diff": {
      "field": "topic",
      "before": "Old topic",
      "after": "New topic"
    },
    "requiresApproval": true
  }
}
```

### `GET /api/matrix/actions/:planId`

Returns the stored plan if it is still active.

### `POST /api/matrix/actions/:planId/execute`

Request:

```json
{
  "approval": true
}
```

Behavior:

- fails closed unless approval is exactly `true`
- fails if the plan is expired
- fails if the plan was already executed
- re-reads the current room topic before writing
- fails with `matrix_stale_plan` if the room topic changed out of band
- writes the new topic server-side with the Matrix access token
- stores the execution result without inventing verification

Response:

```json
{
  "ok": true,
  "result": {
    "planId": "opaque-plan-id",
    "status": "executed",
    "executedAt": "ISO_TIMESTAMP",
    "transactionId": "opaque-transaction-id"
  }
}
```

### `GET /api/matrix/actions/:planId/verify`

Behavior:

- re-reads the room topic from Matrix
- compares the current topic with the planned after-topic
- returns `verified`, `mismatch`, `pending`, or `failed`

Response:

```json
{
  "ok": true,
  "verification": {
    "planId": "opaque-plan-id",
    "status": "verified",
    "checkedAt": "ISO_TIMESTAMP",
    "expected": "New topic",
    "actual": "New topic"
  }
}
```

### Matrix Write Error Response

All Matrix write errors are normalized as:

```json
{
  "ok": false,
  "error": {
    "code": "matrix_stale_plan",
    "message": "Matrix plan is stale and must be refreshed"
  }
}
```

Supported write error codes:

- `invalid_request`
- `matrix_not_configured`
- `matrix_unauthorized`
- `matrix_forbidden`
- `matrix_room_not_found`
- `matrix_write_forbidden`
- `matrix_plan_not_found`
- `matrix_plan_expired`
- `matrix_plan_already_executed`
- `matrix_stale_plan`
- `matrix_verification_failed`
- `matrix_unavailable`
- `matrix_timeout`
- `matrix_malformed_response`
- `matrix_internal_error`

## Live GitHub Smoke

Use this only with a repository and target branch that are safe for smoke PRs.
The smoke script calls the backend-owned `propose -> execute -> verify` lifecycle
with deterministic `mode: "smoke"` and never sends GitHub credentials to the
browser.

Required live smoke environment:

- `GITHUB_SMOKE_ENABLED=true`
- `GITHUB_TOKEN`
- `GITHUB_ALLOWED_REPOS`
- `GITHUB_AGENT_API_KEY`
- `GITHUB_SMOKE_REPO`
- `GITHUB_SMOKE_BASE_BRANCH`
- `GITHUB_SMOKE_TARGET_BRANCH`

Run the manual smoke from the repository root:

```bash
npm run smoke:github
```

Behavior:

- skips cleanly when the live smoke env is missing
- uses backend-owned routes only
- creates a deterministic smoke plan for `docs/mosaicstack-smoke.md`
- requires backend admin approval via `GITHUB_AGENT_API_KEY`
- fails closed if verification does not return `verified`

## Live Matrix Smoke

Use this only with a dedicated Matrix test room that is safe to retarget temporarily.
The smoke script updates the room topic, verifies the change through the backend-owned
`analyze -> fetch -> execute -> verify` lifecycle, and then tries to restore the
previous topic when possible.

Required live smoke environment:

- `MATRIX_ENABLED=true`
- `MATRIX_BASE_URL`
- `MATRIX_ACCESS_TOKEN`
- `MATRIX_SMOKE_ROOM_ID`
- `MATRIX_SMOKE_TOPIC_PREFIX` is optional and defaults to `MosaicStack smoke`

The server reads the repo-root `.env` file. Copy `.env.example` to `.env`
before running the backend or the smoke.

Run the manual smoke from the repository root:

```bash
npm run smoke:matrix
```

Behavior:

- skips cleanly when the live smoke env is missing
- never exposes Matrix credentials to the browser
- uses backend-owned routes only
- fails closed if verification does not return `verified`
- attempts to restore the previous room topic after verification
- prints the room id and restore target if cleanup cannot be completed

CI remains unaffected because `npm run smoke:matrix` is manual-only and is not wired
into `test`, `build`, or browser automation. The repository also exposes the
opt-in `npm run test:matrix-live` wrapper, and the separate `Matrix live smoke`
workflow is dispatch-only.

## Current Limitations

- No persistence or conversation history storage
- No auth or multi-tenant routing
- No tools/MCP support
- No file upload or RAG
- No multi-provider orchestration
- Stream framing is backend-owned only; the client must treat the SSE response as authoritative
