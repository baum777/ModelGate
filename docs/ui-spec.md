# MosaicStack Console / Guided Workspace

## Status Ledger

- Locally verified: backend health, public model alias, SSE chat consumption, PWA shell, thin nav tabs, reducer-driven chat state, restored-session badge, beginner/expert shell toggle, GitHub repos/context/proposal/execute/verify, Matrix whoami, joined rooms, scope resolve, scope summary, provenance, topic-access, analyze, room topic plan/execute/verify, Matrix malformed-200 fail-closed behavior
- Partially covered: Matrix hierarchy preview is browser-side mock-only in this repo and is not backend-verified or write-authoritative
- Deferred: live Matrix E2E verification against a real Matrix origin, Undo, cross-device sync, bulk review queue, advanced observability

## UI Boundaries

- `MosaicStack Console` is the visible brand
- primary navigation is `Chat`, `GitHub Workspace`, `Matrix Workspace`, `Review`, `Settings`
- `Chat` is a consumer surface for backend-owned SSE and renders public model aliases only
- `GitHub Workspace` reads allowed repos, prepares proposals, and stays review-first and approval-gated
- `Matrix Workspace` covers Explore, Analyze, Review, and Verify; backend-owned write flows stay approval-gated
- Matrix hierarchy preview is an advisory browser-side mock only; it is not part of the authoritative write flow
- `Review` is the only approval surface
- `Settings` hosts beginner/expert mode and Expert-only diagnostics
- restored local state is visible, but it is never backend truth

## Beginner / Expert Mode Contract

The Beginner / Expert toggle changes the working mode, not only the amount of visible UI.

| Mode | Primary intent | Interaction posture | Risk posture |
| --- | --- | --- | --- |
| Beginner | Safely complete the task | Guided, low-noise, action-first | Reads are allowed; writes require preview and explicit approval |
| Expert | Fully control the system | Detailed, source-oriented, faster technical access | Same approval gates, with more granular scope and diagnostics |

Both modes must keep the same core capabilities: Chat, GitHub, Matrix, Review, and Settings remain reachable. The difference is presentation, guidance, and control depth. Dangerous actions remain approval-gated in both modes.

Beginner mode should foreground:

- one main goal field such as "What do you want to achieve?",
- guided suggestions such as find errors, improve README, clean up UI, check deploy,
- short repo/workspace summaries: branch, latest change, open risks,
- simple plans in the form "I will read X, check Y, change Z",
- safety levels: read allowed, changes only after preview,
- plain-language diff previews,
- approval actions: apply change, save plan only, cancel,
- error explanations as cause -> meaning -> fix.

Beginner mode should not make these prominent:

- raw logs,
- CI internals,
- token/env diagnostics,
- full test matrix,
- internal routing or provider details,
- technical provenance except as tooltip or "more details".

Expert mode should foreground:

- repo, branch, file, issue, PR, and Matrix room scope control,
- context sources read by the assistant,
- patch plan with risks and affected contracts,
- full diff or preview with file and line context,
- test selection such as `npm test`, browser tests, smoke tests, and targeted tests,
- policy/security status: secrets, env, GitHub rights, Matrix rights, approval gates,
- branch, commit, PR, and review actions,
- runtime diagnostics: API status, provider, model routing, backend errors,
- provenance explaining why a proposal was made and from which context.

Recommended placement:

- keep the toggle in the upper shell or workspace header,
- default to Beginner,
- persist the last Expert setting locally,
- collapse Expert details instead of deleting them,
- keep approval gates mandatory in both modes.

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

## Mode Behavior Matrix

| Action | Beginner | Expert |
| --- | --- | --- |
| Inspect repo | "Analyze repository" guided action | file, branch, contract, issue, and PR scope controls |
| Plan change | plain-language steps | technical patch strategy with risks |
| Apply change | only after preview and explicit approval | granular diff, commit, and approval flow |
| Understand error | cause, meaning, fix | logs, stacktrace, and root cause |
| Use GitHub | guided PR/review flow | branch, commit, PR, and review controls |
| Use Matrix | choose room plus safe action | topic, auth, provenance, and API details |

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
- treating Matrix hierarchy preview as wired backend truth or backend-verified authority
