# UX Workflow Continuity Working Plan

## Scope

This plan covers the next MosaicStacked UI workflow slice after Settings connection verification.

Goals:

- let a user pin the active GitHub file or diff context into Chat without copy/paste
- warn when local GitHub review decisions are unsaved and could be lost on navigation
- show a narrow Chat routing status strip above the composer

Non-goals:

- no Matrix taxonomy provisioning
- no Matrix room or space creation
- no browser-owned GitHub or Matrix writes
- no provider IDs as browser truth
- no backend credential exposure

## Current Baseline

Relevant existing paths:

- `web/src/App.tsx`
  - owns top-level workspace state and passes props into Chat, GitHub, Matrix, Review, and Settings workspaces
  - already tracks `activeModelAlias`, `modelRegistry`, `integrationsStatus`, `githubContext`, and workspace sessions
- `web/src/components/GitHubWorkspace.tsx`
  - owns selected repo, analysis bundle, proposal plan, approval checkbox, execution, verification, and raw diff preview
  - emits status through `onContextChange` and review items through `onReviewItemsChange`
- `web/src/components/ChatWorkspace.tsx`
  - owns chat reducer state, selected model, execution mode, stream route metadata, and composer surface
  - already renders route/runtime details only in Expert mode when `chatState.activeRoute` exists
- `web/src/lib/workspace-state.ts`
  - defines persisted metadata for chat and GitHub sessions
  - derives session status from local state
- `web/src/lib/chat-workflow.ts`
  - defines chat message state, stream route metadata, proposal flow, and receipts
- `web/src/lib/github-api.ts`
  - defines `GitHubContextBundle`, `GitHubChangePlan`, and diff/file types
- `web/src/lib/localization.tsx`
  - central copy surface for EN/DE labels
- `tests/browser/mosaicstacked.spec.ts`
  - browser workflow coverage for Chat, GitHub, Matrix, Review, and Settings
- `web/test/workspace-state.test.ts`
  - persistence and normalization coverage
- `web/test/chat-workflow.test.ts`
  - chat reducer and route metadata coverage
- `web/test/github-workspace.test.ts`
  - GitHub review-item mapping coverage

## Feature 1: Pin GitHub Context Into Chat

User story:

- In the GitHub tab, a user can pin the currently relevant file or prepared diff into Chat.
- Switching to Chat preserves that context as local UI context and makes it visible near the composer.
- No backend write happens from the browser. The eventual chat request still goes through `/chat`.

Target files:

- `web/src/components/GitHubWorkspace.tsx`
  - add a secondary action near analysis files and/or proposal diff cards: `Pin to Chat context`
  - emit a bounded context object through a new prop, for example `onPinChatContext(context)`
- `web/src/App.tsx`
  - own a new local `pinnedChatContext` state
  - pass `onPinChatContext` into `GitHubWorkspace`
  - pass `pinnedChatContext` into `ChatWorkspace`
  - optionally switch `mode` to `chat` after pinning, if UX chooses direct transfer
- `web/src/components/ChatWorkspace.tsx`
  - render a compact pinned-context banner above the composer
  - include clear/remove action
  - when submitting, prepend or attach a bounded textual context block to the prompt through existing `/chat` message payload
- `web/src/lib/workspace-state.ts`
  - optional: persist pinned chat context inside `ChatSessionMetadata` if cross-refresh continuity is required
  - keep it local-state-labeled, not backend truth
- `web/src/lib/localization.tsx`
  - add EN/DE labels for pin action, pinned context banner, clear action, and local-state disclaimer
- `tests/browser/mosaicstacked.spec.ts`
  - cover GitHub analysis/proposal -> pin -> Chat banner visible -> chat request includes bounded context
- `web/test/workspace-state.test.ts`
  - add only if pinned context is persisted

Suggested context shape:

```ts
type PinnedChatContext = {
  source: "github";
  repoFullName: string;
  ref: string;
  path: string | null;
  summary: string;
  excerpt: string;
  diffPreview: string | null;
  createdAt: string;
};
```

Bounds:

- `summary`: max 240 chars
- `excerpt`: max 4,000 chars
- `diffPreview`: max 8,000 chars
- no tokens, credentials, raw headers, or full unbounded repository dumps

## Feature 2: Unsaved GitHub Review Warning

User story:

- If the user has a local pending proposal, approval checkbox, or unexecuted diff decision, the GitHub tab shows a contextual warning.
- If the user navigates away from GitHub, the app warns that local review progress is not backend-fresh truth.

Target files:

- `web/src/components/GitHubWorkspace.tsx`
  - derive local dirty-review state from:
    - `proposalPlan && !executionResult`
    - `approvalChecked`
    - `executionError` after an attempted approval
  - render a banner near the review/approval surface
  - emit dirty state through a new prop such as `onReviewDirtyChange(isDirty)`
- `web/src/App.tsx`
  - own `githubReviewDirty` state
  - intercept `handleWorkspaceTabSelect` when leaving GitHub with dirty state
  - use `window.confirm` for the smallest safe MVP, or show an inline confirmation state if avoiding blocking browser dialogs
- `web/src/lib/localization.tsx`
  - add EN/DE warning and confirm copy
- `tests/browser/mosaicstacked.spec.ts`
  - cover proposal created -> banner visible
  - cover attempted navigation -> warning path
  - cover executed/verified result -> warning cleared

MVP policy:

- The warning is local UI truth only.
- It does not claim backend persistence.
- It does not block refresh with custom state recovery unless a later slice persists review decisions explicitly.

## Feature 3: Chat Routing Status Strip

User story:

- The Chat tab shows a thin status strip directly above the composer.
- Before first prompt, it shows selected public alias, backend health, provider connectivity inferred from backend status, and fallback policy.
- After a stream starts, it updates from route metadata and highlights fallback/degraded state.

Target files:

- `web/src/App.tsx`
  - already has `backendHealthy`, `activeModelAlias`, `modelRegistry`, and `runtimeDiagnostics`
  - pass a compact routing status object into `ChatWorkspace`
- `web/src/components/ChatWorkspace.tsx`
  - render status strip above the composer area, not hidden behind Expert mode
  - show:
    - active public alias
    - backend/provider status: ready, checking, or error
    - fallback enabled/disabled from diagnostics
    - fallback used/degraded from `chatState.activeRoute` after route metadata arrives
- `web/src/lib/localization.tsx`
  - add EN/DE labels for active model, provider status, fallback enabled, fallback used, degraded
- `web/src/styles.css`
  - add stable strip layout with no text overlap on mobile
- `web/test/chat-workflow.test.ts`
  - likely no reducer change needed unless a new view-model helper is added
- `tests/browser/mosaicstacked.spec.ts`
  - cover strip renders before prompt
  - cover fallback badge updates after mocked route metadata
  - cover no provider target or secret appears in DOM

Status source policy:

- public alias from `activeModelAlias` or selected chat model
- backend status from `backendHealthy`
- fallback policy from `runtimeDiagnostics.routing.allowFallback`
- fallback used/degraded from `chatState.activeRoute`
- never show raw provider target from `config/model-capabilities.yml`

## Recommended Implementation Order

1. Chat routing status strip
   - smallest UI-only value
   - reuses existing route metadata and diagnostics
   - low risk to GitHub review flow

2. Pin GitHub context into Chat
   - requires App-level cross-workspace state
   - can remain local-only and bounded

3. Unsaved GitHub review warning
   - touches navigation behavior
   - should come after pinning clarifies intended cross-tab flow

## Validation Plan

For each implementation slice:

```bash
npm run typecheck:web
npm test
npm run test:browser -- tests/browser/mosaicstacked.spec.ts
```

Additional checks:

- verify DOM does not contain `sk-test`, access tokens, provider targets, or raw credentials
- verify pinned context is bounded and removable
- verify GitHub warning clears after execute/verify or reset
- verify Chat status strip does not overlap composer controls on mobile and desktop

## Commit Plan

Use separate commits:

1. `feat: show chat routing status`
2. `feat: pin github context into chat`
3. `feat: warn on unsaved github review state`

Keep `docs/matrix-room-taxonomy.md` untracked unless separately reviewed and promoted.
