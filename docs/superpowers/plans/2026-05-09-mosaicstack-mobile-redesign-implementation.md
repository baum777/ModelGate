# MosaicStack Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `mosaicstack-mobile-spec (1).md` mobile-first Console redesign across Shell, Chat, GitHub, Matrix, and Settings without reintroducing mock data or weakening backend-owned authority boundaries.

**Architecture:** Keep the existing React/Vite app and backend data flow. Add focused mobile primitives and panel-specific mobile layouts that reuse real workspace/session state. Treat the current partial mobile-chat redesign as the baseline, then converge it to the full spec while preserving three distinct context surfaces: `Context Strip` answers “Womit arbeite ich gerade?”, `Command Sheet` answers “Was ist der aktuelle System-/Kontrollzustand?”, and `Kontext-Browser` answers “Welchen Kontext will ich auswählen?”.

**Tech Stack:** React 19, Vite, TypeScript, CSS modules via global CSS files (`critical.css`, `styles.css`, `ui-adaptation.css`), Node test runner with `tsx`, Playwright for mobile visual checks.

**Approval Checklist:** `docs/superpowers/plans/2026-05-09-mosaicstack-mobile-redesign-approval-checklist.md`

---

## Current State Baseline

- Branch/worktree already contains a partial mobile-chat redesign and mock mobile surface removal.
- Existing app entrypoints remain `web/src/App.tsx`, `web/src/components/ChatWorkspace.tsx`, `web/src/components/GitHubWorkspace.tsx`, `web/src/components/MatrixWorkspace.tsx`, and `web/src/components/SettingsWorkspace.tsx`.
- Keep the repo rule: browser renders UI and local intent only; backend owns provider calls, SSE framing, model routing, GitHub/Matrix credentials, execution, and verification.
- Do not restore deleted mock files under `web/src/pages/*`, `web/src/components/chat/*`, `web/src/components/github/*`, `web/src/components/matrix/*`, or `web/public/*-mobile.css`.
- Preserve the mobile `Context Strip` as a permanent system line with exactly these state values: `idle`, `streaming`, `pending`, `error`.
- Keep `Kontext` as a distinct browser/selection surface. Do not replace it with `Settings`, and do not use the Context Strip and Kontext tab for the same action.

## File Structure

- Create `web/src/components/mobile/shared/BottomSheet.tsx`: generic bottom sheet with backdrop, handle, dismiss by backdrop/Escape, and ARIA dialog semantics.
- Create `web/src/components/mobile/shared/StatusPill.tsx`: dot + label state pill for `ready`, `checking`, `error`, `loading`, `pending`.
- Create `web/src/components/mobile/shared/SegmentedControl.tsx`: two-option control for execution mode and sheet tabs.
- Create `web/src/components/mobile/shared/SettingsRow.tsx`: flat 52px row with label/value/chevron.
- Create `web/src/components/mobile/layout/TopContextBar.tsx`: app identity, model alias, global health status.
- Create `web/src/components/mobile/layout/ContextStrip.tsx`: permanent repo/branch/file/status system line that opens the Command Sheet.
- Create `web/src/components/mobile/context/ContextBrowserPanel.tsx`: mobile context browser for choosing repo/branch/file context from existing GitHub-backed state.
- Create `web/src/components/mobile/chat/ComposeZone.tsx`: mobile composer with auto-grow textarea and contextual primary action.
- Create `web/src/components/mobile/chat/InlineDiff.tsx`: collapsible file summary inside assistant work blocks.
- Create `web/src/components/mobile/github/ActivityRow.tsx`: Cursor-style commit/activity row.
- Create `web/src/components/mobile/github/DiffSheet.tsx`: bottom sheet for Chat/Diff tabs and file list.
- Modify `web/src/App.tsx`: use mobile shell primitives, keep `Kontext` as the fourth bottom nav tab, and wire it to `ContextBrowserPanel`.
- Modify `web/src/components/navigation/BottomNav.tsx`: support active top border, compact labels, badges, and `touch-action`.
- Modify workspace files only where needed to render real state through the new mobile primitives.
- Modify `web/src/critical.css`, `web/src/styles.css`, `web/src/ui-adaptation.css`: move mobile tokens and final overrides into stable selectors.
- Create `web/test/mobile-redesign.test.ts` and add it to `npm run test:web`.

---

### Task 1: Lock Mobile Spec In Tests

**Files:**
- Create: `web/test/mobile-redesign.test.ts`
- Modify: `package.json`

- [x] **Step 1: Add the mobile redesign source tests**

Create `web/test/mobile-redesign.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = () => readFileSync("web/src/App.tsx", "utf8");
const styles = () => [
  readFileSync("web/src/critical.css", "utf8"),
  readFileSync("web/src/styles.css", "utf8"),
  readFileSync("web/src/ui-adaptation.css", "utf8"),
].join("\n");

test("mobile shell keeps Kontext as the fourth context-browser tab", () => {
  const source = appSource();
  assert.match(source, /key:\s*"context"/);
  assert.match(source, /testId:\s*"tab-context-browser"/);
  assert.match(source, /label:\s*locale === "de" \? "Kontext"/);
  assert.match(source, /ContextBrowserPanel/);
});

test("mobile context strip keeps canonical state labels and opens command sheet", () => {
  const source = appSource();
  assert.match(source, /mobileContextStatus/);
  for (const state of ["idle", "streaming", "pending", "error"]) {
    assert.match(source, new RegExp(`label:\\s*"${state}"|${state}`));
  }
  assert.match(source, /mobile-context-strip/);
  assert.match(source, /handleMobileContextToggle/);
  assert.match(source, /mobile-context-sheet/);
});

test("mobile redesign exposes spec color tokens and texture", () => {
  const css = styles();
  for (const token of ["--void", "--surface", "--lift", "--border-hi", "--phosphor", "--amber", "--red", "--blue"]) {
    assert.match(css, new RegExp(token.replace("-", "\\-")));
  }
  assert.match(css, /repeating-linear-gradient\(0deg/);
  assert.match(css, /rgba\(0,\s*200,\s*180,\s*0\.015\)/);
});

test("mobile composer and nav meet touch and keyboard requirements", () => {
  const css = styles();
  assert.match(css, /\.mobile-compose-zone[\s\S]*position:\s*sticky/);
  assert.match(css, /\.mobile-compose-input[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.workspace-tab-mobile[\s\S]*min-height:\s*44px/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /overscroll-behavior:\s*contain/);
});

test("bottom sheets use handle, backdrop, and capped viewport height", () => {
  const css = styles();
  assert.match(css, /\.mobile-bottom-sheet/);
  assert.match(css, /\.mobile-bottom-sheet-handle/);
  assert.match(css, /\.mobile-bottom-sheet[\s\S]*max-height:\s*90dvh/);
  assert.match(css, /\.mobile-bottom-sheet-backdrop/);
});
```

- [x] **Step 2: Add the test file to `test:web`**

Modify the root `package.json` `test:web` script by inserting `web/test/mobile-redesign.test.ts` after `web/test/chat-workflow.test.ts`.

- [x] **Step 3: Run the new test and confirm it fails**

Run:

```powershell
npm run test:web
```

Expected: FAIL on missing mobile primitives/tokens before implementation.

- [x] **Step 4: Commit checkpoint after tests are failing**

Do not commit in this workspace unless the user explicitly asks. If executing in an isolated implementation branch, commit only `package.json` and `web/test/mobile-redesign.test.ts`.

---

### Task 2: Implement Mobile Design Tokens And Shell Texture

**Files:**
- Modify: `web/src/critical.css`
- Modify: `web/src/styles.css`
- Modify: `web/src/ui-adaptation.css`

- [x] **Step 1: Add the spec tokens to `:root` and `.app-shell-mobile`**

Add this block to `web/src/styles.css` near the current mobile redesign section, then mirror the required critical subset in `critical.css` and final override subset in `ui-adaptation.css`:

```css
:root {
  --void: #050c14;
  --surface: #0d1b2a;
  --lift: #122030;
  --border: rgba(0, 200, 180, 0.12);
  --border-hi: rgba(0, 200, 180, 0.28);
  --phosphor: #00c8b4;
  --phosphor2: #00e5cf;
  --amber: #f0a832;
  --red: #ff4c4c;
  --blue: #3b9eff;
  --dim: rgba(255, 255, 255, 0.28);
  --mid: rgba(255, 255, 255, 0.55);
  --hi: rgba(255, 255, 255, 0.9);
}

.app-shell-mobile {
  background:
    repeating-linear-gradient(0deg, transparent 0 2px, rgba(0, 200, 180, 0.015) 2px 3px),
    var(--void);
  color: var(--hi);
  font-family: "IBM Plex Sans", "Inter", "Segoe UI", sans-serif;
  touch-action: manipulation;
}

.app-shell-mobile code,
.app-shell-mobile pre,
.app-shell-mobile .mobile-mono {
  font-family: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
}
```

- [x] **Step 2: Normalize mobile touch/scroll**

Add:

```css
.app-shell-mobile button,
.app-shell-mobile [role="button"] {
  touch-action: manipulation;
}

.app-shell-mobile .mobile-panel-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.app-shell-mobile .mobile-panel-scroll::-webkit-scrollbar {
  display: none;
}
```

- [x] **Step 3: Run tests**

Run:

```powershell
npm run test:web
npm run typecheck:web
```

Expected: mobile token tests progress; TypeScript remains green.

---

### Task 3: Build Shared Mobile Primitives

**Files:**
- Create: `web/src/components/mobile/shared/BottomSheet.tsx`
- Create: `web/src/components/mobile/shared/StatusPill.tsx`
- Create: `web/src/components/mobile/shared/SegmentedControl.tsx`
- Create: `web/src/components/mobile/shared/SettingsRow.tsx`
- Modify: `web/src/styles.css`

- [x] **Step 1: Create `BottomSheet.tsx`**

```tsx
import React, { useEffect } from "react";

export type BottomSheetProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  maxHeight?: "content" | "large";
  onDismiss: () => void;
};

export function BottomSheet({ open, title, children, maxHeight = "content", onDismiss }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="mobile-bottom-sheet-backdrop" aria-label="Close sheet" onClick={onDismiss} />
      <section
        className={`mobile-bottom-sheet mobile-bottom-sheet-${maxHeight}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <span className="mobile-bottom-sheet-handle" aria-hidden="true" />
        <header className="mobile-bottom-sheet-header">
          <h2>{title}</h2>
        </header>
        <div className="mobile-bottom-sheet-body">{children}</div>
      </section>
    </>
  );
}
```

- [x] **Step 2: Create `StatusPill.tsx`**

```tsx
import React from "react";

export type StatusPillTone = "ready" | "checking" | "error" | "loading" | "pending" | "muted";

export function StatusPill({ tone, children }: { tone: StatusPillTone; children: React.ReactNode }) {
  return (
    <span className={`mobile-status-pill mobile-status-pill-${tone}`}>
      <span className="mobile-status-pill-dot" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
```

- [x] **Step 3: Create `SegmentedControl.tsx`**

```tsx
import React from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<SegmentedOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mobile-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "mobile-segmented-option mobile-segmented-option-active" : "mobile-segmented-option"}
          disabled={disabled}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [x] **Step 4: Create `SettingsRow.tsx`**

```tsx
import React from "react";

export function SettingsRow({
  label,
  value,
  tone = "default",
  onPress,
}: {
  label: string;
  value: string;
  tone?: "default" | "ready" | "warning" | "error";
  onPress?: () => void;
}) {
  return (
    <button type="button" className={`mobile-settings-row mobile-settings-row-${tone}`} onClick={onPress}>
      <span className="mobile-settings-row-label">{label}</span>
      <span className="mobile-settings-row-value">{value}</span>
      <span className="mobile-settings-row-chevron" aria-hidden="true">›</span>
    </button>
  );
}
```

- [x] **Step 5: Add CSS for primitives**

Add selectors for `.mobile-bottom-sheet`, `.mobile-status-pill`, `.mobile-segmented-control`, and `.mobile-settings-row` using spec colors. Keep all touch targets `min-height: 44px`.

- [x] **Step 6: Run validation**

Run:

```powershell
npm run typecheck:web
npm run test:web
```

Expected: all tests pass.

---

### Task 4: Replace Mobile Shell With Top Context Bar, Context Strip, And Context Browser Tab

**Files:**
- Create: `web/src/components/mobile/layout/TopContextBar.tsx`
- Create: `web/src/components/mobile/layout/ContextStrip.tsx`
- Create: `web/src/components/mobile/context/ContextBrowserPanel.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/navigation/BottomNav.tsx`

- [x] **Step 1: Create `TopContextBar.tsx`**

```tsx
import React from "react";
import { StatusPill, type StatusPillTone } from "../shared/StatusPill.js";

export function TopContextBar({
  modelAlias,
  statusTone,
  statusLabel,
  onModelPress,
}: {
  modelAlias: string;
  statusTone: StatusPillTone;
  statusLabel: string;
  onModelPress: () => void;
}) {
  return (
    <header className="mobile-top-context-bar">
      <span className="mobile-app-mark" aria-hidden="true">◈</span>
      <strong className="mobile-app-title">MosaicStack</strong>
      <button type="button" className="mobile-model-switch" onClick={onModelPress}>
        {modelAlias}
      </button>
      <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
    </header>
  );
}
```

- [x] **Step 2: Create `ContextStrip.tsx`**

```tsx
import React from "react";

export type MobileContextStatus = "idle" | "streaming" | "pending" | "error";

export function ContextStrip({
  repo,
  branch,
  fileLabel,
  status,
  onPress,
}: {
  repo: string;
  branch: string;
  fileLabel: string;
  status: MobileContextStatus;
  onPress: () => void;
}) {
  return (
    <button type="button" className="mobile-repo-strip" onClick={onPress}>
      <span className="mobile-repo-name">⎇ {repo}</span>
      <span className="mobile-repo-separator">·</span>
      <span>{branch}</span>
      <span className="mobile-repo-separator">·</span>
      <span>{fileLabel}</span>
      <span className={`mobile-repo-status mobile-repo-status-${status}`}>{status}</span>
    </button>
  );
}
```

- [x] **Step 3: Create `ContextBrowserPanel.tsx`**

```tsx
import React from "react";

export type ContextBrowserOption = {
  id: string;
  title: string;
  detail: string;
  status?: string;
};

export function ContextBrowserPanel({
  repoLabel,
  branchLabel,
  fileLabel,
  options,
  onOpenGitHub,
  onSelectOption,
}: {
  repoLabel: string;
  branchLabel: string;
  fileLabel: string;
  options: ContextBrowserOption[];
  onOpenGitHub: () => void;
  onSelectOption: (id: string) => void;
}) {
  return (
    <section className="mobile-context-browser mobile-panel-scroll" aria-label="Kontext-Browser">
      <header className="mobile-panel-header">
        <span className="mobile-mono">KONTEXT-BROWSER</span>
        <strong>Welchen Kontext willst du auswählen?</strong>
      </header>
      <div className="mobile-context-browser-current">
        <span>{repoLabel}</span>
        <span>{branchLabel}</span>
        <span>{fileLabel}</span>
      </div>
      <div className="mobile-context-browser-list">
        {options.length > 0 ? options.map((option) => (
          <button type="button" className="mobile-context-browser-row" key={option.id} onClick={() => onSelectOption(option.id)}>
            <strong>{option.title}</strong>
            <span>{option.detail}</span>
            {option.status ? <small>{option.status}</small> : null}
          </button>
        )) : (
          <button type="button" className="mobile-context-browser-row" onClick={onOpenGitHub}>
            <strong>GitHub-Kontext öffnen</strong>
            <span>Repo, Branch oder Datei auswählen</span>
          </button>
        )}
      </div>
    </section>
  );
}
```

- [x] **Step 4: Wire the components into `App.tsx`**

Replace the current mobile topbar/context strip JSX with `TopContextBar` plus `ContextStrip`. The strip must remain visible on every mobile workspace and open the Command Sheet, not the Kontext-Browser:

```tsx
<TopContextBar
  modelAlias={activeModelAlias ?? ui.common.na}
  statusTone={healthState.tone === "ready" ? "ready" : healthState.tone === "error" ? "error" : "checking"}
  statusLabel={healthState.label}
  onModelPress={() => handleWorkspaceTabSelect("settings")}
/>
<ContextStrip
  repo={hasRepoContext ? (githubSession?.metadata.selectedRepoFullName ?? ui.common.na) : (locale === "de" ? "Kein Kontext" : "No context")}
  branch={hasRepoContext ? (githubContext.expertDetails.branchName ?? ui.common.na) : (locale === "de" ? "Repo wählen" : "Choose repo")}
  fileLabel={commitChipLabel}
  status={mobileContextStatus.tone as "idle" | "streaming" | "pending" | "error"}
  onPress={handleMobileContextToggle}
/>
```

- [x] **Step 5: Keep the fourth bottom nav item as Kontext-Browser**

Use Kontext as the fourth tab. It must not open the Command Sheet; it switches to the context-selection surface:

```tsx
{
  key: "context",
  label: locale === "de" ? "Kontext" : "Context",
  icon: <MobileContextIcon />,
  active: mobileSurface === "context",
  onPress: () => setMobileSurface("context"),
  testId: "tab-context-browser",
}
```

Add a mobile-only surface state in `App.tsx` so the `Kontext` tab is a real fourth panel without changing desktop workspace routing:

```tsx
type MobileSurfaceMode = "chat" | "github" | "matrix" | "context";

const [mobileSurface, setMobileSurface] = useState<MobileSurfaceMode>(() => {
  if (mode === "github" || mode === "matrix") {
    return mode;
  }

  return "chat";
});

useEffect(() => {
  if (mode === "chat" || mode === "github" || mode === "matrix") {
    setMobileSurface(mode);
  }
}, [mode]);

const mobileWorkspaceSurface = mobileSurface === "context" ? (
  <ContextBrowserPanel
    repoLabel={repoChipLabel}
    branchLabel={branchChipLabel}
    fileLabel={commitChipLabel}
    options={contextBrowserOptions}
    onOpenGitHub={() => handleWorkspaceTabSelect("github")}
    onSelectOption={handleContextBrowserSelect}
  />
) : mobileSurface === "chat" ? chatWorkspaceSurface : mobileSurface === "github" ? githubWorkspaceSurface : matrixWorkspaceSurface;
```

Settings remains reachable through the model badge in `TopContextBar` and the Command Sheet. Do not add a Settings bottom tab in this mobile redesign slice, and do not alias the `Kontext` tab to the Command Sheet.

- [x] **Step 6: Run tests and browser check**

Run:

```powershell
npm run typecheck:web
npm run test:web
```

Then run Playwright mobile smoke at `281x610` and `390x844`:

```ts
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
for (const viewport of [{ width: 281, height: 610 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport, isMobile: true });
  await page.goto("http://127.0.0.1:5173/console?mode=chat", { waitUntil: "networkidle" });
  await page.screenshot({ path: `output/mobile-shell-${viewport.width}.png`, fullPage: false });
  await page.close();
}
await browser.close();
```

Expected: `Context Strip` always visible and showing one of `idle`, `streaming`, `pending`, `error`; tapping it opens the Command Sheet. Bottom `Kontext` tab opens/selects the Kontext-Browser surface and never opens the Command Sheet.

---

### Task 5: Complete Chat Panel To Spec

**Files:**
- Create: `web/src/components/mobile/chat/ComposeZone.tsx`
- Create: `web/src/components/mobile/chat/InlineDiff.tsx`
- Modify: `web/src/components/ChatWorkspace.tsx`
- Modify: `web/src/styles.css`

- [x] **Step 1: Extract mobile composer to `ComposeZone.tsx`**

```tsx
import React, { useLayoutEffect, useRef } from "react";

export function ComposeZone({
  value,
  placeholder,
  disabled,
  primaryLabel,
  modelAlias,
  onChange,
  onSubmit,
  onModelPress,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  primaryLabel: string;
  modelAlias: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onModelPress: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  }, [value]);

  return (
    <form
      className="mobile-compose-zone"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        ref={ref}
        className="mobile-compose-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="mobile-compose-footer">
        <button type="button" className="mobile-compose-model" onClick={onModelPress}>
          Model: {modelAlias} ▾
        </button>
        <button type="submit" className="mobile-compose-submit" disabled={disabled || value.trim().length === 0}>
          {primaryLabel}
        </button>
      </div>
    </form>
  );
}
```

- [x] **Step 2: Add inline diff parser and renderer**

Create `InlineDiff.tsx`:

```tsx
import React, { useMemo, useState } from "react";

export type InlineDiffFile = {
  path: string;
  additions: number;
  deletions: number;
  isNew?: boolean;
};

export function extractInlineDiffFiles(content: string): InlineDiffFile[] {
  const rows: InlineDiffFile[] = [];
  const pattern = /^\s*[-*]?\s*([\w./-]+\.(?:ts|tsx|js|jsx|md|json|yml|yaml))\s+\+(\d+)(?:\s+-(\d+))?(?:\s+(New))?/gim;
  for (const match of content.matchAll(pattern)) {
    rows.push({
      path: match[1],
      additions: Number(match[2]),
      deletions: Number(match[3] ?? 0),
      isNew: Boolean(match[4]),
    });
  }
  return rows.slice(0, 12);
}

export function InlineDiff({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const files = useMemo(() => extractInlineDiffFiles(content), [content]);
  if (files.length === 0) return null;
  const visible = expanded ? files : files.slice(0, 3);
  return (
    <section className="mobile-inline-diff" aria-label="Changed files">
      <button type="button" className="mobile-inline-diff-summary" onClick={() => setExpanded((value) => !value)}>
        {files.length} Files Changed
      </button>
      {visible.map((file) => (
        <div className="mobile-inline-diff-row" key={file.path}>
          <span>{file.path}</span>
          <strong>+{file.additions}</strong>
          {file.deletions > 0 ? <em>-{file.deletions}</em> : null}
          {file.isNew ? <small>New</small> : null}
        </div>
      ))}
      {files.length > 3 && !expanded ? <button type="button" className="mobile-inline-diff-more" onClick={() => setExpanded(true)}>▸ {files.length - 3} more</button> : null}
    </section>
  );
}
```

- [x] **Step 3: Wire `ComposeZone` and `InlineDiff` into `ChatWorkspace.tsx`**

In mobile-only markup/classes, replace the form rendering with `ComposeZone`, and render `<InlineDiff content={message.content} />` under assistant messages.

- [x] **Step 4: Preserve governed/direct semantics**

Use:

```ts
const mobilePrimaryLabel = executionMode === "direct"
  ? (locale === "de" ? "Run" : "Run")
  : (locale === "de" ? "Prepare proposal" : "Prepare proposal");
```

Do not expose provider IDs; pass public alias only.

- [x] **Step 5: Run validation**

Run:

```powershell
npm run typecheck:web
npm run test:web
```

Expected: Chat tests pass; mobile visual smoke shows compact composer, stream cursor, one visible primary action per assistant block.

---

### Task 6: Implement GitHub Mobile Panel Slice

**Files:**
- Create: `web/src/components/mobile/github/ActivityRow.tsx`
- Create: `web/src/components/mobile/github/DiffSheet.tsx`
- Modify: `web/src/components/GitHubWorkspace.tsx`
- Modify: `web/src/styles.css`

- [x] **Step 1: Create `ActivityRow.tsx`**

```tsx
import React from "react";

export function ActivityRow({
  title,
  additions,
  deletions,
  age,
  onPress,
}: {
  title: string;
  additions: number;
  deletions: number;
  age: string;
  onPress: () => void;
}) {
  return (
    <button type="button" className="mobile-activity-row" onClick={onPress}>
      <span className="mobile-activity-dot" aria-hidden="true">◉</span>
      <span className="mobile-activity-copy">
        <strong>{title}</strong>
        <small><span className="mobile-additions">+{additions}</span> <span className="mobile-deletions">-{deletions}</span> · {age}</small>
      </span>
    </button>
  );
}
```

- [x] **Step 2: Create `DiffSheet.tsx`**

Use `BottomSheet` and `SegmentedControl` with tabs `chat` and `diff`. Render existing GitHub analysis/proposal summary in Chat tab and existing file/diff list in Diff tab.

- [x] **Step 3: Replace mobile GitHub default guide**

In `GitHubWorkspace.tsx`, when viewport is mobile and a repo is already selected, show:

- repo summary row
- `ACTIONS` flat list: Analyze context, Prepare proposal, Review open PRs
- `RECENT ACTIVITY` list using `ActivityRow`

Keep the existing guide behind the existing Guide button, not as default content.

- [x] **Step 4: Run validation**

Run:

```powershell
npm run typecheck:web
npm run test:web
```

Expected: no mock GitHub page imports; GitHub workspace still maps review items and preserves backend-owned approvals.

---

### Task 7: Implement Matrix And Settings Mobile Panels

**Files:**
- Modify: `web/src/components/MatrixWorkspace.tsx`
- Modify: `web/src/components/SettingsWorkspace.tsx`
- Modify: `web/src/styles.css`

- [x] **Step 1: Matrix mobile rooms/topics**

Render a mobile-only flat panel with:

- heading `MATRIX KNOWLEDGE`
- read-only/write status row
- rooms sorted by available activity metadata
- recent topics limited to five visible rows
- disabled write flows with inline `Matrix write not configured` when write contract is absent

- [x] **Step 2: Settings mobile flat list**

Replace mobile settings card stacks with `SettingsRow` rows:

```tsx
<SettingsRow label="Model" value={activeAliasLabel} onPress={() => setOpenSheet("model")} />
<SettingsRow label="Provider" value={providerStatusLabel} tone={providerReady ? "ready" : "error"} onPress={() => setOpenSheet("provider")} />
<SettingsRow label="Execution Mode" value={executionModeLabel} onPress={() => setOpenSheet("execution")} />
<SettingsRow label="Fallback Policy" value={fallbackPolicyLabel} onPress={() => setOpenSheet("fallback")} />
<SettingsRow label="GitHub Token" value={githubStatusLabel} tone={githubReady ? "ready" : "warning"} onPress={() => setOpenSheet("github")} />
<SettingsRow label="Matrix" value={matrixStatusLabel} tone={matrixReady ? "ready" : "warning"} onPress={() => setOpenSheet("matrix")} />
```

Each row opens `BottomSheet`; never put credentials in browser-visible values.

- [x] **Step 3: Run validation**

Run:

```powershell
npm run typecheck:web
npm run test:web
```

Expected: Settings tests still confirm secrets are not in DOM; Matrix tests still confirm fail-closed gates.

---

### Task 8: Approval, Error, And PWA Polish

**Files:**
- Modify: `web/src/components/ChatWorkspace.tsx`
- Modify: `web/src/components/ApprovalPrimitives.tsx`
- Modify: `web/src/pwa.ts`
- Modify: `web/index.html`
- Modify: `web/test/pwa.test.ts`

- [x] **Step 1: Approval confirmation sheet**

For governed approval, keep inline proposal visible and add a confirmation `BottomSheet` before backend execution:

```tsx
<BottomSheet open={approvalConfirmOpen} title="Execute on backend?" onDismiss={() => setApprovalConfirmOpen(false)}>
  <p className="mobile-sheet-warning">This sends the approved proposal to backend-owned execution.</p>
  <div className="mobile-sheet-actions">
    <button type="button" className="secondary-button" onClick={() => setApprovalConfirmOpen(false)}>Cancel</button>
    <button type="button" className="mobile-danger-action" onClick={executeConfirmedProposal}>Execute</button>
  </div>
</BottomSheet>
```

- [x] **Step 2: Inline error representation**

Ensure stream and provider errors render as inline chat/system blocks with:

- short what happened
- known reason if present
- retry/settings action

Do not introduce full-screen error views.

- [x] **Step 3: PWA theme color**

Set mobile theme color to `#050c14` and keep manifest icons unchanged.

- [x] **Step 4: Run validation and visual device checks**

Run:

```powershell
npm run typecheck:web
npm run test:web
npm run build:web
```

Browser checks:

- `http://127.0.0.1:5173/console?mode=chat` at `281x610`
- `http://127.0.0.1:5173/console?mode=github` at `390x844`
- `http://127.0.0.1:5173/console?mode=matrix` at `390x844`
- `http://127.0.0.1:5173/console?mode=settings` at `390x844`

Acceptance:

- no horizontal overflow
- no card-in-card nesting deeper than two levels
- all primary touch targets at least `44px`
- context/model/status visible without opening a sheet
- no provider IDs exposed as UI truth
- no Matrix/GitHub credentials in browser DOM

---

## Self-Review

- Spec coverage: Shell, Chat, GitHub, Matrix, Settings, Bottom Sheets, Approval, Error, Performance, and PWA polish are covered by Tasks 1-8.
- Scope decision: This remains one plan because the spec depends on shared mobile primitives and a single mobile shell. Execution should still happen in task order with checkpoints.
- Existing partial work: Task 4 and Task 5 intentionally refine the current mobile-chat implementation instead of reverting it.
- Gaps intentionally not included: real GitHub commit history fetching is not invented here; the plan uses existing backend/session data. If live recent-activity API is missing, rows render from available analysis/proposal/session metadata until a backend route is explicitly added.
