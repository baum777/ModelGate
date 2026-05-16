# Agentic Helpdesk Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first guarded agentic Helpdesk Companion slice with app-manual answers, redacted context, allowlisted UI intents, visible blocked intents, and safe UI execution.

**Architecture:** Keep authority in the browser shell for UI effects and in the backend for chat/model routing. Add small browser-only libraries for companion context and intents, let `FloatingCompanion` render suggestions, and let `App.tsx` execute only validated allowlist intents.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner with `tsx`, existing MosaicStacked workspace/session hooks.

---

## File Structure

- Create: `web/src/lib/companion-intents.ts` for typed allowlist, blocklist, validation, and simple local suggestion rules.
- Create: `web/src/lib/companion-context.ts` for redacted browser context snapshots.
- Modify: `web/src/components/FloatingCompanion.tsx` to render answer history, suggested actions, and blocked actions.
- Modify: `web/src/App.tsx` to build context and execute validated UI intents.
- Modify: `web/src/lib/cross-tab-commands.ts` to allow companion-origin chat drafts.
- Modify: `web/src/critical.css` for compact action buttons and scroll-safe companion responses.
- Modify: `web/test/floating-companion.test.ts` with TDD coverage for context redaction, intent guardrails, and shell wiring.
- Modify: `02-wiki/index.md` and `02-wiki/log.md` to route the plan and implemented surfaces.

### Task 1: Companion Intent Guardrails

**Files:**
- Create: `web/src/lib/companion-intents.ts`
- Test: `web/test/floating-companion.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that import `validateCompanionIntent`, `buildCompanionSuggestions`, and assert:

```ts
assert.equal(validateCompanionIntent({ kind: "github_execute" }).state, "blocked");
assert.equal(validateCompanionIntent({ kind: "unknown" }).state, "blocked");
assert.equal(validateCompanionIntent({ kind: "navigate_tab", target: "settings" }).state, "allowed");
assert.equal(buildCompanionSuggestions({ question: "GitHub ausführen", locale: "de" }).blockedIntents.some((intent) => intent.kind === "github_execute"), true);
```

- [x] **Step 2: Run red test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: FAIL because `web/src/lib/companion-intents.ts` does not exist.

- [x] **Step 3: Implement minimal intent library**

Create the allowlist/blocklist types and pure functions needed by the tests. Unknown input returns `blocked`.

- [x] **Step 4: Run green test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: PASS for the new intent tests.

### Task 2: Redacted Companion Context

**Files:**
- Create: `web/src/lib/companion-context.ts`
- Test: `web/test/floating-companion.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that call `buildCompanionContext()` with secret-shaped fields nearby and assert serialized output does not contain forbidden keys such as `token`, `secret`, `apiKey`, `cookie`, `provider`, or `target`.

- [x] **Step 2: Run red test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: FAIL because `buildCompanionContext` is missing.

- [x] **Step 3: Implement minimal context builder**

Build a typed snapshot from safe fields only: workspace, work mode, freshness, backend health, public model alias, integrations summaries, session summaries, and journal summaries.

- [x] **Step 4: Run green test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: PASS.

### Task 3: Companion UI Suggestions

**Files:**
- Modify: `web/src/components/FloatingCompanion.tsx`
- Modify: `web/src/critical.css`
- Test: `web/test/floating-companion.test.ts`

- [x] **Step 1: Write failing source/rendering tests**

Assert `FloatingCompanion` accepts `context` and `onIntent`, renders `floating-companion-action`, and renders blocked intent copy.

- [x] **Step 2: Run red test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: FAIL because the UI has no action rendering yet.

- [x] **Step 3: Implement UI rendering**

Store response entries with `answer`, `suggestedIntents`, and `blockedIntents`. Render allowed intents as buttons and blocked intents as non-clickable warnings.

- [x] **Step 4: Run green test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: PASS.

### Task 4: Shell Intent Execution

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/lib/cross-tab-commands.ts`
- Test: `web/test/floating-companion.test.ts`

- [x] **Step 1: Write failing shell wiring tests**

Assert `App.tsx` imports `buildCompanionContext`, passes `context={companionContext}`, passes `onIntent={handleCompanionIntent}`, and handles `start_safe_check` with safe refresh calls.

- [x] **Step 2: Run red test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: FAIL because shell wiring is missing.

- [x] **Step 3: Implement shell wiring**

Build `companionContext` with safe fields. Implement `handleCompanionIntent()` with a `validateCompanionIntent()` switch that only supports `navigate_tab`, `open_panel`, `prefill_chat`, `prefill_matrix_draft`, `start_safe_check`, `explain_status`, and `show_step_guide`.

- [x] **Step 4: Run focused green test**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: PASS.

### Task 5: Verification and Governance Route

**Files:**
- Modify: `02-wiki/index.md`
- Modify: `02-wiki/log.md`

- [x] **Step 1: Run focused tests**

Run: `node --test --import tsx web/test/floating-companion.test.ts`

Expected: PASS.

- [x] **Step 2: Run web tests**

Run: `npm run test:web`

Expected: PASS.

- [x] **Step 3: Run typecheck**

Run: `npm run typecheck:web`

Expected: PASS.

- [x] **Step 4: Append governance log and index rows**

Record the new plan, `companion-intents`, `companion-context`, and implemented Companion UI changes in `02-wiki/index.md` and `02-wiki/log.md`.
