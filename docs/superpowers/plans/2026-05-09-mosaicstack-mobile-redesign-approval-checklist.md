# MosaicStack Mobile Redesign Approval Checklist

Linked plan: `docs/superpowers/plans/2026-05-09-mosaicstack-mobile-redesign-implementation.md`

Purpose: This checklist creates explicit approval gates for the mobile redesign plan. `APPROVED` means the scoped gate is complete against its evidence and risk-safe Definition of Done. It does not approve broader authority, backend execution, Matrix write capability, deployment readiness, or any runtime claim not verified by concrete files and command output.

## Approval Rules

- [x] Use this checklist gate-by-gate; do not approve a later gate to compensate for an incomplete earlier gate.
- [x] Mark `APPROVED` only after every required evidence item in that gate is present.
- [x] Mark `BLOCKED` instead of `APPROVED` when evidence is missing, the UI depends on mock data, or a repo authority boundary is ambiguous.
- [x] Preserve the three context surfaces exactly: `Context Strip` = current working context, `Command Sheet` = current system/control state, `Kontext-Browser` = context selection.
- [x] Preserve the Context Strip badge states exactly as `idle`, `streaming`, `pending`, `error`.
- [x] Treat approval here as design/implementation acceptance only; backend-owned execution and external Matrix/GitHub truth still require their own verified gates.

## Gate 0: Preflight And Scope Lock

Risk: medium. This gate prevents implementing against the wrong authority surface or dirty baseline.

Safe DoD:
- [x] Current repo is `C:\workspace\main_projects\ModelGate`.
- [x] `git status --short --untracked-files=all` is captured before edits.
- [x] Existing unrelated worktree changes are identified and preserved.
- [x] Root and repo-local authority are respected: browser owns rendering/local intent; backend owns provider calls, SSE, model routing, credentials, execution, and verification truth.
- [x] The implementation plan and this checklist are the active planning artifacts.

Evidence required:
- [x] Command output from `git status --short --untracked-files=all`.
- [x] File path of the implementation plan.
- [x] File path of this checklist.

Approval:
- [x] APPROVED: Gate 0 complete.
- [ ] BLOCKED: Missing scope, authority, or worktree evidence.

## Gate 1: Spec Lock Tests

Risk: high. This gate makes the mobile model testable before further implementation.

Safe DoD:
- [x] `web/test/mobile-redesign.test.ts` exists and is included in `npm run test:web`.
- [x] Tests assert the fourth bottom tab remains `Kontext` and routes to the context browser, not to the Command Sheet.
- [x] Tests assert the Context Strip opens the Command Sheet.
- [x] Tests assert the canonical Context Strip state labels: `idle`, `streaming`, `pending`, `error`.
- [x] Tests assert no deleted mock mobile pages or mock mobile CSS are reintroduced.
- [x] Tests assert provider IDs are not exposed as UI truth.

Evidence required:
- [x] Initial failing test run for the new tests, or a written reason if the test is added against already-existing passing behavior.
- [x] Passing `npm run test:web`.
- [x] Passing `npm run typecheck:web`.

Approval:
- [x] APPROVED: Gate 1 complete.
- [ ] BLOCKED: Missing tests for context separation or authority boundaries.

## Gate 2: Visual Tokens And Mobile Shell Texture

Risk: medium. This gate protects the quiet professional tool tone and avoids decorative drift.

Safe DoD:
- [x] Mobile tokens define dark neutral surfaces, one primary action accent, and semantic green/amber/red status colors.
- [x] No glow, neon, decorative gradients, card-in-card layout, or oversized marketing composition is introduced.
- [x] Primary mobile shell uses stable viewport sizing with `100dvh` or equivalent dynamic viewport handling.
- [x] Mobile text does not scale with viewport width.
- [x] Typography preserves semantic monospace for system values, routes, IDs, and Context Strip badges.

Evidence required:
- [x] CSS diff for `web/src/critical.css`, `web/src/styles.css`, and `web/src/ui-adaptation.css`.
- [x] Browser screenshot at `281x610`.
- [x] Browser screenshot at `390x844`.
- [x] Manual check that no horizontal overflow appears at both viewports.

Approval:
- [x] APPROVED: Gate 2 complete.
- [ ] BLOCKED: Visual language or viewport stability is unverified.

## Gate 3: Shared Mobile Primitives

Risk: medium. This gate prevents repeated local UI logic and inaccessible sheets.

Safe DoD:
- [x] `BottomSheet` has handle, backdrop dismiss, Escape dismiss, focus-safe dialog semantics, and no visible close button unless a specific panel requires it.
- [x] `StatusPill`, `SegmentedControl`, and `SettingsRow` are flat primitives, not decorative cards.
- [x] Touch targets for interactive controls are at least 44px in the mobile shell.
- [x] Primitives accept real state through props and do not contain mock data.
- [x] Primitives do not own backend truth, credentials, approval results, or execution state.

Evidence required:
- [x] Source diff for all created `web/src/components/mobile/shared/*` files.
- [x] Passing `npm run typecheck:web`.
- [x] At least one rendered mobile browser check showing `BottomSheet` open and dismissible.

Approval:
- [x] APPROVED: Gate 3 complete.
- [ ] BLOCKED: Primitive accessibility, ownership, or mock-data risk remains.

## Gate 4: Context Model

Risk: high. This gate protects the user-approved information architecture.

Safe DoD:
- [x] `TopContextBar` shows workspace identity, model alias, and global health only.
- [x] `ContextStrip` permanently answers “Womit arbeite ich gerade?” and opens the Command Sheet.
- [x] `Command Sheet` answers “Was ist der aktuelle System-/Kontrollzustand?” and overlays the chat without becoming a full screen.
- [x] `Kontext-Browser` answers “Welchen Kontext will ich auswählen?” and is reachable through the `Kontext` bottom tab.
- [x] The Context Strip badge changes by state and remains monospace.
- [x] The `Kontext` bottom tab does not duplicate the Command Sheet.
- [x] Settings remain reachable without replacing the `Kontext` bottom tab.

Evidence required:
- [x] Passing source test for `tab-context-browser`.
- [x] Browser check: tapping Context Strip opens Command Sheet.
- [x] Browser check: tapping `Kontext` opens context browser/selection surface.
- [x] Screenshot or trace for each surface: Context Strip, Command Sheet, Kontext-Browser.

Approval:
- [x] APPROVED: Gate 4 complete.
- [ ] BLOCKED: Context Strip, Command Sheet, or Kontext-Browser roles are conflated.

## Gate 5: Chat Panel

Risk: high. This gate protects the primary work surface and streaming/approval behavior.

Safe DoD:
- [x] Assistant answers render as work blocks, not social chat bubbles.
- [x] Each assistant work block exposes exactly one visible primary action.
- [x] Secondary actions appear only after explicit expansion/tap.
- [x] `→ backend` badge appears only on actions that leave the browser.
- [x] Streaming uses visible text growth and a blinking `|` cursor, not a spinner.
- [x] Pending approval appears as an amber strip/block in flow, not a blocking modal.
- [x] Error appears as a chat/system block with red strip, short cause, and one concrete tappable next action.
- [x] Composer remains reachable, preserves draft state across tab switches, and does not cause layout jumps.
- [x] No mock prompts, mock sessions, mock assistant answers, or demo data remain in the mobile chat path.

Evidence required:
- [x] Passing `npm run test:web`.
- [x] Passing `npm run typecheck:web`.
- [ ] Browser screenshots or traces for empty, streaming, actions, pending approval, and error states.
- [ ] Manual scroll check on mobile viewport with keyboard-safe composer behavior where feasible.

Approval:
- [ ] APPROVED: Gate 5 complete.
- [ ] BLOCKED: Chat uses mock data, duplicate primary actions, spinner streaming, or modal approvals.

## Gate 6: GitHub Panel

Risk: medium. This gate keeps GitHub mobile dense, factual, and backend-owned.

Safe DoD:
- [x] GitHub mobile panel uses real GitHub/session state exposed by the app, not mock repository data.
- [x] Activity rows are scanable and compact.
- [x] Diff view uses a sheet/panel with file list and diff tabs as planned.
- [x] Browser does not bypass backend approval gating for write/execution actions.
- [x] Any unavailable GitHub action is rendered as unavailable/contract-only rather than implied ready.
- [x] No provider IDs, credentials, or internal route strings are exposed as UI truth.

Evidence required:
- [x] Passing GitHub-related `npm run test:web` coverage.
- [x] Browser screenshot of GitHub mobile panel.
- [ ] Browser screenshot or trace of diff sheet/panel.
- [x] Written note for any contract-only GitHub action that remains intentionally unavailable.

Note: `Diff ansehen` remains disabled until `proposalPlan` exists. The browser does not create a write path or synthetic diff to satisfy the visual state.

Approval:
- [ ] APPROVED: Gate 6 complete.
- [ ] BLOCKED: GitHub UI implies unverified write capability or uses mock state.

## Gate 7: Matrix And Settings Panels

Risk: high. Matrix capability boundaries are contract-sensitive.

Safe DoD:
- [x] Matrix mobile panel only renders verified read-only or contract-only surfaces already supported by repo authority.
- [x] Matrix write, approval, provenance, hierarchy, execute, verify, and live E2E claims are not presented as implemented unless local backend evidence proves them.
- [x] Matrix credentials are never stored or rendered in the browser.
- [x] Settings surface is reachable without replacing the `Kontext` bottom tab.
- [x] Settings rows are compact, factual, and do not overclaim runtime readiness.
- [x] Empty/error states distinguish `implemented`, `contract-only`, `missing`, and `offline` where relevant.

Evidence required:
- [x] Passing Matrix-related `npm run test:web` coverage.
- [x] Browser screenshot of Matrix mobile panel.
- [x] Browser screenshot of Settings access path.
- [x] Written ledger note for any Matrix capability shown as contract-only.

Ledger note: Matrix mobile renders the existing browser-owned read and intent surfaces only. Write, approval, provenance, hierarchy, execute, verify, and live Matrix E2E remain backend/external-contract capabilities unless separately proven by local backend evidence; the mobile panel presents unavailable write flow as fail-closed instead of ready.

Approval:
- [x] APPROVED: Gate 7 complete.
- [ ] BLOCKED: Matrix UI overclaims backend/runtime/write readiness.

## Gate 8: Approval, Error, And PWA Polish

Risk: medium. This gate catches interaction debt after the main panels exist.

Safe DoD:
- [x] Approval state is visible as a deliberate handoff moment, not a spinner or silent wait.
- [x] Backend-owned actions show clear but quiet ownership signaling.
- [x] Error blocks include what happened, why if known, and a concrete next action.
- [x] Touch behavior uses `touch-action` where needed and does not break vertical scroll.
- [ ] Bottom nav preserves each panel state and composer draft.
- [x] Sheet open/close animation is 200ms or less unless a semantic transition needs longer.
- [x] Mobile shell remains usable offline/degraded without implying backend freshness.

Evidence required:
- [ ] Browser trace or screenshots for approval, backend-owned action, and error.
- [ ] Manual scroll check in Chat, GitHub, Matrix, and Kontext panels.
- [x] Passing `npm run test:web`.
- [x] Passing `npm run typecheck:web`.

Evidence note: Approval/backend-owned handoff screenshot exists at `output/mobile-redesign/slice8-approval-sheet-live.png`. Error rendering is covered by source tests and implementation, but a real backend error screenshot was not produced because this slice did not fabricate backend failure state. Playwright viewport screenshots exist under `output/playwright/mobile-redesign/` for Chat, GitHub, Matrix, and Settings at `281x610` and `390x844`.

Approval:
- [ ] APPROVED: Gate 8 complete.
- [ ] BLOCKED: Approval/error/backend-owned states are ambiguous or scroll is broken.

## Gate 9: Final Readiness Review

Risk: high. This gate is the final implementation acceptance for the plan, not a deployment claim.

Safe DoD:
- [ ] All prior gates are either `APPROVED` or explicitly `BLOCKED` with a bounded follow-up.
- [x] Final diff is reviewed for unintended mock data, authority expansion, provider ID exposure, Matrix credential risk, and duplicated context surfaces.
- [x] `npm run typecheck:web` passes.
- [x] `npm run test:web` passes.
- [x] `npm run build:web` passes, or skipped with a concrete repo-declared reason.
- [x] Browser smoke check passes at `281x610` and `390x844`.
- [ ] Changed files are listed exactly.
- [x] Unrelated worktree changes are not staged or reverted.

Evidence required:
- [x] Final `git status --short --untracked-files=all`.
- [x] Final validation command output summary.
- [x] Final browser screenshots or trace paths.
- [ ] Final changed-file list.

Evidence note: final grep review found only expected test/checklist wording plus existing settings/API credential labels and model input type names; no new top-level provider IDs or browser credential values were introduced. Gate 9 remains unapproved until Gate 5, Gate 6, and Gate 8 evidence gaps are closed or explicitly marked blocked with follow-ups.

Approval:
- [ ] APPROVED: Gate 9 complete; implementation is ready for the next requested integration step.
- [ ] BLOCKED: Final readiness cannot be claimed; list the missing evidence before continuing.
