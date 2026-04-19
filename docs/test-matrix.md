# ModelGate Test Matrix

This document reflects current repository truth only.

Status legend:

- `automated` - covered by repo tests or deterministic scripts that run locally
- `manual` - human-run verification only
- `implemented-but-manual` - code is present, but there is no executable automated coverage in this repo yet
- `contract-only` - surface exists only as a contract or placeholder, not as a locally wired product path
- `deferred` - intentionally postponed until a prerequisite exists
- `blocked` - cannot be executed with the current repo state or harness

Security note:

- Secrets and tokens must never be committed or logged.
- Do not copy live credentials into docs, tests, or examples.

## 1. Preflight / Repo Hygiene

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| P1 | `.env` is gitignored | implemented-but-manual | Check [.gitignore](../.gitignore) and verify `git check-ignore` against local env files | Repo hygiene; owner: backend + ops |
| P2 | `OPENROUTER_API_KEY` is set | manual | Set in local env before running chat checks; Matrix-only startup can omit it | Chat-only precondition; owner: operator |
| P3 | `MATRIX_ENABLED=true` is set | manual | Set in local env before Matrix read-only smoke tests | Matrix read-only backend precondition; owner: operator |
| P4 | `MATRIX_BASE_URL` is set | manual | Set in local env and confirm the backend resolves a Matrix origin | Matrix backend config; owner: operator |
| P5 | `MATRIX_ACCESS_TOKEN` is set | manual | Set in local env and keep server-side only | Secret handling; owner: operator |
| P6 | Optional `MATRIX_EXPECTED_USER_ID` matches `whoami` | manual | Run backend Matrix smoke and compare returned identity | Fail-closed identity guard; owner: backend |
| P7 | `npm install` succeeds | manual | Run `npm install` from repo root | Workspace bootstrap; owner: developer |
| P8 | `npm run typecheck:server` passes | automated | Run the workspace script | Defined in [package.json](../package.json) |
| P9 | `npm run typecheck:web` passes | automated | Run the workspace script | Defined in [package.json](../package.json) |
| P10 | `npm test` passes | automated | Run the workspace script | Aggregates server and web tests; owner: developer |
| P11 | `npm run build` passes | automated | Run the workspace script | Build gate; owner: developer |

## 2. Backend Health / Models

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| B1 | `GET /health` returns `ok: true` and service metadata | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Backend-owned health surface; owner: backend |
| B2 | `GET /models` returns the public alias list | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Public model alias only; owner: backend |
| B3 | Provider IDs do not become UI truth | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) and [web/src/components/ChatWorkspace.tsx](../web/src/components/ChatWorkspace.tsx) | UI renders the public alias only; owner: backend + web |
| B4 | Matrix disabled still allows chat boot | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Matrix is fail-closed when disabled; owner: backend |
| B5 | Invalid Matrix config fails closed without secrets in the error path | automated | [server/test/matrix-env.test.ts](../server/test/matrix-env.test.ts) and [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Startup and route guards; owner: backend |
| B6 | Matrix-only startup does not require an OpenRouter key | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) and [server/test/openrouter.test.ts](../server/test/openrouter.test.ts) | Chat still fails closed without a key; owner: backend |

## 3. OpenRouter Chat Non-Stream

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| C1 | Short prompt returns a response or sanitized provider error | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Non-stream chat contract; owner: backend |
| C2 | Coding prompt routes to the internal coding model | automated | [server/test/chat-router.test.ts](../server/test/chat-router.test.ts) | Rules-first router path; owner: backend |
| C3 | Review prompt routes to the internal review model | automated | [server/test/chat-router.test.ts](../server/test/chat-router.test.ts) | Rules-first router path; owner: backend |
| C4 | UI/Stitch prompt routes to the internal UI review model | automated | [server/test/llm-router.test.ts](../server/test/llm-router.test.ts) | Router classification includes `ui_review`; owner: backend |
| C5 | Unknown prompt falls back to `daily` | automated | [server/test/llm-router.test.ts](../server/test/llm-router.test.ts) | Catch-all task type; owner: backend |
| C6 | Router disabled preserves legacy provider-target behavior | automated | [server/test/chat-router.test.ts](../server/test/chat-router.test.ts) | Legacy path remains available; owner: backend |
| C7 | Free-only routing with no valid candidates fails closed | automated | [server/test/chat-router.test.ts](../server/test/chat-router.test.ts) | Sanitized backend error only; owner: backend |
| C8 | Public response stays `model: "default"` | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) and [server/test/chat-router.test.ts](../server/test/chat-router.test.ts) | Provider IDs stay hidden; owner: backend |

## 4. OpenRouter Chat Streaming

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| S1 | `POST /chat` with `stream:true` emits `start -> token* -> done` | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | SSE framing owned by backend; owner: backend |
| S2 | Provider failure after stream start emits `start -> error` | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Sanitized terminal error; owner: backend |
| S3 | Stream never ends `start`-only | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Exact terminal event required; owner: backend |
| S4 | Long Markdown response stays visually stable | manual | Browser smoke in local UI | No browser automation coverage yet; owner: web |
| S5 | Code block response renders without layout breakage | manual | Browser smoke in local UI | No browser automation coverage yet; owner: web |
| S6 | Stream abort is visible as a user-facing error or cancellation | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser harness covers abort/cancel and stable recovery; owner: web |
| S7 | Provider IDs do not appear in SSE frames | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | SSE payload stays on public alias only; owner: backend |
| S8 | Exactly one assistant draft is finalized per completed stream | automated | [web/test/chat-workflow.test.ts](../web/test/chat-workflow.test.ts) | Reducer prevents duplicate finalization; owner: web |

## 5. Router and Evidence Logs

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| R1 | `LLM_ROUTER_LOG_ENABLED=false` creates no log file | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Private logging stays off by default; owner: backend |
| R2 | `LLM_ROUTER_LOG_ENABLED=true` creates `.local-ai/logs/ROUTER_DECISIONS.log.md` | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Log path is repo-local and gitignored; owner: backend |
| R3 | Router evidence appends and does not overwrite | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Append-only local audit trail; owner: backend |
| R4 | Token-like secrets are redacted | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Secret-safe markdown logging; owner: backend |
| R5 | Bearer tokens are redacted | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Secret-safe markdown logging; owner: backend |
| R6 | Full prompt is not logged verbatim | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Evidence stays summarized; owner: backend |
| R7 | Provider IDs remain local to gitignored logs | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) and [.gitignore](../.gitignore) | Operator audit only; owner: backend |
| R8 | Logging failure does not break chat | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Logging is warning-only; owner: backend |

## 6. UI Shell and Tabs

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| U1 | App shell renders | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser harness now covers the shell render; owner: web |
| U2 | Chat tab opens and is visible | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Tab switching is covered with mocked backend state; owner: web |
| U3 | Matrix Workspace tab opens and is visible | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Tab switching is covered with mocked backend state; owner: web |
| U4 | Header shows health, model alias, and status | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Header truth is verified against mocked backend responses; owner: web |
| U5 | Tab switching keeps state consistent | implemented-but-manual | Local browser run of the Vite client | State is UI-local; owner: web |
| U6 | Reload restores chat draft and active tab state | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Chat reload smoke verifies the persisted composer state and tab return; owner: web |
| U7 | `RESTORED_SESSION` badge is visible | implemented-but-manual | Local browser run of the Vite client | Badge exists in [web/src/App.tsx](../web/src/App.tsx); owner: web |
| U8 | UI shows only the public alias, not provider IDs | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Provider IDs are excluded from visible UI text; owner: web + backend |
| U9 | Beginner navigation exposes only Chat, GitHub Workspace, Matrix Workspace, Review, Settings | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Shell IA uses the beginner-safe nav contract; owner: web |
| U10 | Beginner Mode hides technical identifiers and raw details | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Guarded through `Technische Details`; owner: web |
| U11 | Expert Mode reveals technical details inside labeled disclosure blocks | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Expert disclosure path stays explicit; owner: web |
| U12 | Browser does not call `api.github.com` or `matrix.org` directly | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | ModelGate backend remains the only browser authority; owner: web + backend |

## 7. Chat UI Inputs

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| UI-C1 | Typing updates the composer | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Composer input is verified in browser; owner: web |
| UI-C2 | Send button submits the prompt | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Submit path is exercised through mocked SSE; owner: web |
| UI-C3 | `Cmd/Ctrl+Enter` submits the prompt | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Keyboard shortcut is exercised in browser; owner: web |
| UI-C4 | Empty send is blocked | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Disabled-submit guard is verified; owner: web |
| UI-C5 | Send is disabled while streaming | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Deterministic browser harness checks the disabled state during an in-flight chat request; owner: web |
| UI-C6 | Backend errors surface as an error banner | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Mocked `POST /chat` error responses render visibly; owner: web |
| UI-C7 | Auto-scroll follows the stream | implemented-but-manual | Local browser run of the Vite client | Scroll behavior is UI-local; owner: web |
| UI-C8 | Manual scroll pauses auto-follow | implemented-but-manual | Local browser run of the Vite client | Scroll state is UI-local; owner: web |
| UI-C9 | Jump to latest re-enables auto-follow | implemented-but-manual | Local browser run of the Vite client | Jump control exists; owner: web |
| UI-C10 | Stream error does not create a fake final assistant message | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser harness verifies only the user message is finalized on error; owner: web |

## 8. Matrix Read-Only Backend

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| M1 | `GET /api/matrix/whoami` returns normalized identity | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) and [server/test/matrix-client.test.ts](../server/test/matrix-client.test.ts) | Matrix read-only backend is implemented; owner: backend |
| M2 | Optional `MATRIX_EXPECTED_USER_ID` match is enforced | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Fail-closed identity guard; owner: backend |
| M3 | `GET /api/matrix/joined-rooms` returns normalized rooms | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) and [server/test/matrix-client.test.ts](../server/test/matrix-client.test.ts) | Matrix read-only backend is implemented; owner: backend |
| M4 | Malformed upstream `200` becomes `matrix_malformed_response` | automated | [server/test/matrix-client.test.ts](../server/test/matrix-client.test.ts) and [web/test/matrix-api.test.ts](../web/test/matrix-api.test.ts) | Fail-closed parsing; owner: backend + web |
| M5 | Invalid token becomes `matrix_unauthorized` | automated | [server/test/matrix-client.test.ts](../server/test/matrix-client.test.ts) | Unauthorized is normalized; owner: backend |
| M6 | `GET /api/matrix/rooms/:roomId/provenance` returns normalized room provenance | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) and [web/test/matrix-api.test.ts](../web/test/matrix-api.test.ts) | Read-only room metadata is backend-owned and path-encoded; owner: backend + web |
| M7 | Homeserver down becomes `matrix_unavailable` | implemented-but-manual | Backend Matrix client path in [server/src/lib/matrix-client.ts](../server/src/lib/matrix-client.ts) | Code path exists; no direct repo test yet; owner: backend |
| M8 | Timeout becomes `matrix_timeout` | automated | [server/test/matrix-client.test.ts](../server/test/matrix-client.test.ts) | Timeout is normalized; owner: backend |
| M9 | Matrix errors do not leak secrets | implemented-but-manual | Backend route/client sanitization paths in [server/src/routes/matrix.ts](../server/src/routes/matrix.ts) and [server/src/lib/matrix-client.ts](../server/src/lib/matrix-client.ts) | No direct secret-leak assertion in repo yet; owner: backend |

## 9. Matrix Explore UI

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| E1 | Opening the Matrix tab starts bootstrap | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Matrix bootstrap is exercised via mocked read-only backend state; owner: web |
| E2 | Successful `whoami` shows identity | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Identity text is rendered from mocked backend state; owner: web + backend |
| E3 | Successful joined-rooms load shows list or grid | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Joined rooms render from mocked backend state; owner: web + backend |
| E4 | Selecting a room updates the scope counter | implemented-but-manual | Local browser run of the Vite client | UI-local selection state; owner: web |
| E5 | Selecting multiple rooms is stable | implemented-but-manual | Local browser run of the Vite client | UI-local selection state; owner: web |
| E6 | Removing a selection updates the counter | implemented-but-manual | Local browser run of the Vite client | UI-local selection state; owner: web |
| E7 | Analyze is blocked without a selection | implemented-but-manual | Local browser run of the Vite client | Gate helper is tested, but browser execution is not; owner: web |
| E8 | Analyze with a selection starts scope resolve | implemented-but-manual | Local browser run of the Vite client | Backend route is implemented; owner: web + backend |
| E9 | Successful scope resolve returns a `scopeId` | implemented-but-manual | Local browser run of the Vite client | Backend route is implemented; owner: web + backend |
| E10 | Scope summary loads and renders | implemented-but-manual | Local browser run of the Vite client | Backend route is implemented; owner: web + backend |
| E11 | Backend errors surface stage-specific messages | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Fail-closed Matrix error state is exercised in browser; owner: web |
| E12 | Reload after selection shows restored or stale state | implemented-but-manual | Local browser run of the Vite client | Restored state is visible, not backend truth; owner: web |
| E13 | Provenance loads from the backend route after scope resolution | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser calls the encoded provenance route and renders the returned read-only metadata; owner: web + backend |

## 10. Matrix Scope / Summary

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| MS1 | `POST /api/matrix/scope/resolve` with rooms returns a `scopeId` | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Matrix read-only backend is implemented; owner: backend |
| MS2 | Empty selection returns `invalid_request` | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Fail-closed input validation; owner: backend |
| MS3 | Duplicate IDs are deduped | implemented-but-manual | Scope resolution logic in [server/src/lib/matrix-client.ts](../server/src/lib/matrix-client.ts) | No direct repo test for duplicate input yet; owner: backend |
| MS4 | Invalid IDs fail closed | implemented-but-manual | Scope validation and route guards in [server/src/routes/matrix.ts](../server/src/routes/matrix.ts) | Current repo does not expose a direct duplicate/invalid-ID test slice; owner: backend |
| MS5 | `GET /api/matrix/scope/:id/summary` renders items | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Summary is backend-owned and read-only; owner: backend |
| MS6 | Unknown scope ID returns `matrix_scope_not_found` | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Missing snapshot is fail-closed; owner: backend |
| MS7 | Expired scope returns `matrix_scope_not_found` | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | TTL expiry is fail-closed; owner: backend |
| MS8 | Summary contains no raw upstream events | implemented-but-manual | Summary builder in [server/src/lib/matrix-scope-store.ts](../server/src/lib/matrix-scope-store.ts) | Summary is bounded and read-only; owner: backend |

## 11. Matrix Topic / Write Tests

Backend-owned room topic analyze, plan refresh, execute, and verify are locally wired, and the Matrix Workspace room-topic review flow is browser-tested. Provenance is a backend-owned read-only route with derived metadata and browser coverage. Hierarchy preview remains separate because the server route is still unwired here.

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| T1 | Analyze produces a candidate for changing room topic | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Backend Matrix analyze route is wired; owner: backend |
| T2 | Analyze creates a plan with `planId` | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Legacy promote wording is dead; the active path is analyze -> stored plan fetch; owner: backend |
| T3 | Review shows before/after topic diff | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Diff comes from the backend plan store; owner: backend |
| T4 | Without approval, no topic change occurs | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Approval-gated execution fails closed; owner: backend |
| T5 | Approve and Execute runs backend-owned write | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Backend-owned write helper is exercised; owner: backend |
| T6 | Verify reads back the topic from Matrix | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Verification readback is backend-owned; owner: backend |
| T7 | UI shows verified result | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Room topic review shows verified backend readback; owner: web |
| T8 | Reload leaves old analysis stale | implemented-but-manual | Local browser run of the Vite client | Staleness is a UI concern and the browser flow exists; owner: web |
| T9 | Wrong power level yields normalized failure | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Backend normalizes write-forbidden failures; owner: backend |
| T10 | Stale plan execution is blocked | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Backend re-reads before write and fails stale plans; owner: backend |
| T11 | Dismiss does not change the room topic | implemented-but-manual | Local browser run of the Vite client | Dismiss remains a UI intent only; browser automation does not cover it yet; owner: web |
| T12 | Tokens or secrets do not appear in logs | implemented-but-manual | Route error-shaping paths in [server/src/routes/matrix.ts](../server/src/routes/matrix.ts) and [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Responses are secret-safe; log-path coverage is still limited; owner: backend |
| T13 | Refresh plan reloads canonical topic state | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Refresh uses only `GET /api/matrix/actions/:planId` and re-renders canonical plan fields; owner: web |
| T14 | Expired or missing plan refresh fails closed | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Refresh clears executable state and blocks approval/execution on backend error; owner: web |

## 12. Analyze / Review / Execute / Verify

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| A1 | Analyze with scope returns a deterministic topic plan | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) and [web/test/matrix-api.test.ts](../web/test/matrix-api.test.ts) | Matrix analyze is backend-owned, deterministic, and client-validated; owner: backend + web |
| A2 | Provenance markers are backend-issued only | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) and [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Read-only provenance is backend-owned, derived, and browser-rendered; owner: backend + web |
| A3 | Plan transitions stay backend-owned | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Legacy promote wording is dead; backend analyze still creates the reviewable transition; owner: backend |
| R1 | Review plan shows a structured diff | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Diff is returned by the backend plan fetch route; owner: backend |
| R2 | Approve sends approval intent only | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Execute requires an explicit approval intent; owner: backend + web |
| X1 | Execute is backend-owned | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Write execution stays server-side; owner: backend |
| V1 | Verify is backend readback | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Verification reads Matrix back from the backend; owner: backend |
| V2 | Verification failures are visible and not faked | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Backend verify route returns pending/mismatch/failed states; owner: backend |

## 13. Security / Negative Tests

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| N1 | Provider IDs do not appear in the UI | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Visible DOM text excludes provider IDs; owner: web |
| N2 | Matrix token does not appear in the browser | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Visible DOM text excludes Matrix and OpenRouter secrets; owner: web + backend |
| N3 | `.env` does not land in Git | implemented-but-manual | Check [.gitignore](../.gitignore) and local `git status` | Never commit secrets; owner: developer |
| N4 | `.local-ai/` does not land in Git | implemented-but-manual | Check [.gitignore](../.gitignore) and local `git status` | Router evidence logs stay local; owner: developer |
| N5 | Errors with tokens are redacted | automated | [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts) | Secret-safe failure paths; owner: backend |
| N6 | Malformed Matrix `200 OK` fails closed | automated | [web/test/matrix-api.test.ts](../web/test/matrix-api.test.ts) | Client rejects unreadable upstream payloads; owner: web |
| N7 | Restored review approval is blocked | blocked | No executable backend write flow yet | Depends on a local write endpoint plus browser automation; owner: web + backend |
| N8 | Stale plan execution is blocked | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) and [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Browser UI fails closed on stale Matrix plans and the backend rejects stale writes; owner: backend + web |
| N9 | Double-click approve does not trigger duplicate execution | implemented-but-manual | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) | Backend rejects repeat execute requests; browser double-click behavior is not yet automated; owner: web + backend |
| N10 | Backend restart during scope load expires or invalidates the scope | blocked | No executable end-to-end harness for this path yet | Needs a live backend restart harness and browser automation; owner: backend + web |

## 14. Accessibility / Keyboard

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| A11 | Tab navigation works | implemented-but-manual | Local browser run of the Vite client | No a11y automation coverage yet; owner: web |
| A12 | Composer remains focusable after send | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser harness confirms the composer can be refocused after submit; owner: web |
| A13 | Composer remains focusable after error | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser harness confirms the composer can be refocused after a backend error; owner: web |
| A14 | Live region is present during streaming | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Chat message list exposes an `aria-live="polite"` region; owner: web |
| A15 | Approval cannot be triggered accidentally with Enter | implemented-but-manual | Local browser run of the Vite client | Backend gating remains authoritative; owner: web + backend |
| A16 | Buttons have accessible labels | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Browser harness queries primary controls by accessible name; owner: web |
| A17 | Status is not color-only | automated | [tests/browser/modelgate.spec.ts](../tests/browser/modelgate.spec.ts) | Status pills and alerts expose explicit text, not just color; owner: web |

## 15. Browser / Responsive

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| BR1 | Chrome desktop passes | manual | Open the local client in Chrome desktop | No browser automation coverage yet; owner: web |
| BR2 | Firefox desktop passes | manual | Open the local client in Firefox desktop | No browser automation coverage yet; owner: web |
| BR3 | Narrow viewport does not break main navigation | manual | Resize the local client to a small viewport | No browser automation coverage yet; owner: web |
| BR4 | Long room list remains usable | manual | Use a seeded local Matrix room list in the browser | No browser automation coverage yet; owner: web + backend |
| BR5 | Long chat answer does not break layout | manual | Submit or mock a long response in the browser | No browser automation coverage yet; owner: web |
| BR6 | Open logs do not dominate the workflow | manual | Open log-related UI or local evidence output while keeping the main flow visible | Logs are local and advisory only; owner: web |

## 16. Release Gate

| Test ID | Description | Current status | Verification method | Notes / owner |
| --- | --- | --- | --- | --- |
| RG1 | `npm run typecheck:server` passes | automated | Run the workspace script | Required release gate; owner: developer |
| RG2 | `npm run typecheck:web` passes | automated | Run the workspace script | Required release gate; owner: developer |
| RG3 | `npm test` passes | automated | Run the workspace script | Required release gate; owner: developer |
| RG4 | `npm run build` passes | automated | Run the workspace script | Required release gate; owner: developer |
| RG5 | Chat non-stream smoke passes | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Backend chat path is locally verified; owner: backend |
| RG6 | Chat stream success is green or explicitly documented | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) and [README.md](../README.md) | Stream contract is locally verified; owner: backend |
| RG7 | Chat stream error path is green | automated | [server/test/backend.test.ts](../server/test/backend.test.ts) | Sanitized `error` frame required; owner: backend |
| RG8 | Matrix `whoami` passes | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Matrix read-only backend is implemented; owner: backend |
| RG9 | Matrix joined-rooms passes | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Matrix read-only backend is implemented; owner: backend |
| RG10 | Matrix scope resolve passes | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Matrix read-only backend is implemented; owner: backend |
| RG11 | Matrix summary passes | automated | [server/test/matrix-routes.test.ts](../server/test/matrix-routes.test.ts) | Matrix read-only backend is implemented; owner: backend |
| RG12 | No secrets appear in browser, Git, or logs | implemented-but-manual | [.gitignore](../.gitignore), [server/test/router-evidence-log.test.ts](../server/test/router-evidence-log.test.ts), and manual browser checks | Never commit or log secrets; owner: backend + web + developer |
| RG13 | Matrix writes stay backend-owned and approval-gated | automated | [server/test/matrix-actions.test.ts](../server/test/matrix-actions.test.ts) and [server/README.md](../server/README.md) | Approval-gated write ownership is now locally verified; owner: backend |
| RG14 | `npm run test:browser` passes | automated | Run the workspace script | Browser harness gate for the new UI coverage slice; owner: developer |
