# Settings Authority Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Settings workspace into an authority-first control center that presents backend-proven status, safe access actions, and expert diagnostics without exposing secrets or bypassing backend ownership.

**Architecture:** Keep `SettingsWorkspace` as the single Settings surface and extend its existing mobile branch instead of adding a new route or demo component. Reuse `SettingsRow`, `BottomSheet`, `SystemNode`, `FlowIndicator`, and existing login adapter data. Mobile becomes a compact truth snapshot plus grouped row sections; desktop keeps the existing card surface with minor structure and resilience only where required.

**Tech Stack:** React 19, TypeScript, Vite, CSS in `web/src/critical.css`, `web/src/styles.css`, and `web/src/ui-adaptation.css`, Node test runner, Playwright browser tests.

---

## File Structure

- Modify: `web/src/components/mobile/shared/SettingsRow.tsx`
  - Responsibility: make the shared mobile row support `detail`, `tone`, and `testId` while preserving the current button/div behavior.
- Modify: `web/src/components/SettingsWorkspace.tsx`
  - Responsibility: derive mobile truth snapshot items, grouped mobile sections, sheet content, and safe actions from existing props.
- Modify: `web/src/critical.css`
  - Responsibility: first-paint mobile Settings layout, truth grid, grouped rows, and sheet structure.
- Modify: `web/src/styles.css`
  - Responsibility: deferred/full mobile Settings visual polish and desktop compatibility.
- Modify: `web/src/ui-adaptation.css`
  - Responsibility: deferred mobile stability guard for Settings after desktop CSS loads.
- Modify: `web/test/settings-workspace.test.ts`
  - Responsibility: static markup tests for mobile authority sections, safe status rows, sheet contracts, and secret redaction.
- Modify: `web/test/mobile-redesign.test.ts`
  - Responsibility: source/CSS guard tests for mobile Settings control-center primitives.
- Modify: `tests/browser/mosaicstacked.spec.ts`
  - Responsibility: rendered mobile Settings flow test with row tap, BottomSheet open, and no horizontal overflow.
- Modify: `02-wiki/log.md`
  - Responsibility: append implementation log after verification.

## Scope Boundaries

- Do not add a separate Settings route.
- Do not expose provider IDs, Matrix credentials, GitHub tokens, or OpenRouter key values.
- Do not move authority for connect, reconnect, disconnect, reverify, save, or test actions into the browser.
- Do not replace desktop Settings with the mobile list; desktop remains card-based.
- Do not introduce external dependencies.

## Task 1: Extend SettingsRow Primitive

**Files:**
- Modify: `web/src/components/mobile/shared/SettingsRow.tsx`
- Test: `web/test/mobile-redesign.test.ts`

- [ ] **Step 1: Add static test expectations for row detail and tone support**

Add this assertion block to `web/test/mobile-redesign.test.ts` after the existing `mobile chat slice uses bounded composer and inline diff primitives` test:

```ts
test("mobile settings rows support detail, tone, and stable test ids", () => {
  const source = readFileSync("web/src/components/mobile/shared/SettingsRow.tsx", "utf8");
  const css = styles();

  assert.match(source, /detail\?: ReactNode/);
  assert.match(source, /tone\?: "ready" \| "partial" \| "error" \| "muted"/);
  assert.match(source, /testId\?: string/);
  assert.match(source, /data-testid=\{testId\}/);
  assert.match(source, /mobile-settings-row-\$\{tone\}/);
  assert.match(css, /\.mobile-settings-row-detail/);
  assert.match(css, /\.mobile-settings-row-ready/);
  assert.match(css, /\.mobile-settings-row-error/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test --import tsx web/test/mobile-redesign.test.ts
```

Expected: FAIL because `SettingsRowProps` does not yet include `detail`, `tone`, or `testId`.

- [ ] **Step 3: Replace `SettingsRow.tsx` props and markup**

Replace the file content with:

```tsx
import React from "react";
import type { ReactNode } from "react";

export type SettingsRowTone = "ready" | "partial" | "error" | "muted";

export function SettingsRow({
  label,
  value,
  detail,
  tone = "muted",
  testId,
  action,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: SettingsRowTone;
  testId?: string;
  action?: () => void;
}) {
  const content = (
    <>
      <span className="mobile-settings-row-label">{label}</span>
      <strong className="mobile-settings-row-value">{value}</strong>
      {detail ? <span className="mobile-settings-row-detail">{detail}</span> : null}
      <span className="mobile-settings-row-chevron" aria-hidden="true">⌄</span>
    </>
  );

  if (action) {
    return (
      <button
        type="button"
        className={`mobile-settings-row mobile-settings-row-${tone}`}
        onClick={action}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`mobile-settings-row mobile-settings-row-${tone}`} data-testid={testId}>
      {content}
    </div>
  );
}
```

- [ ] **Step 4: Add row CSS in all mobile CSS surfaces**

Add this block to `web/src/critical.css`, `web/src/styles.css`, and `web/src/ui-adaptation.css` near existing `.mobile-settings-row` rules:

```css
.app-shell-mobile .mobile-settings-row {
  min-height: 56px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "label value"
    "detail chevron";
  align-items: center;
  column-gap: 10px;
  row-gap: 3px;
}

.app-shell-mobile .mobile-settings-row-label {
  grid-area: label;
}

.app-shell-mobile .mobile-settings-row-value {
  grid-area: value;
}

.app-shell-mobile .mobile-settings-row-detail {
  grid-area: detail;
  min-width: 0;
  color: var(--mobile-redesign-muted, var(--ms-text2));
  font-size: 11px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell-mobile .mobile-settings-row-chevron {
  grid-area: chevron;
}

.app-shell-mobile .mobile-settings-row-ready .mobile-settings-row-value {
  color: var(--mobile-redesign-green, var(--ms-green));
}

.app-shell-mobile .mobile-settings-row-partial .mobile-settings-row-value {
  color: var(--mobile-redesign-amber, var(--ms-amber));
}

.app-shell-mobile .mobile-settings-row-error .mobile-settings-row-value {
  color: var(--mobile-redesign-red, var(--ms-red));
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test --import tsx web/test/mobile-redesign.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add web/src/components/mobile/shared/SettingsRow.tsx web/src/critical.css web/src/styles.css web/src/ui-adaptation.css web/test/mobile-redesign.test.ts
git commit -m "Refine mobile settings row primitive"
```

## Task 2: Derive Mobile Settings Sections From Existing Authority Data

**Files:**
- Modify: `web/src/components/SettingsWorkspace.tsx`
- Test: `web/test/settings-workspace.test.ts`

- [ ] **Step 1: Add static markup assertions for authority sections**

In `web/test/settings-workspace.test.ts`, inside `Settings workspace renders integration cards and keeps secrets out of the DOM`, add these assertions after `assert.match(markup, /data-testid="settings-verification-github-action"/);`:

```ts
  assert.match(markup, /data-testid="settings-mobile-truth-snapshot"/);
  assert.match(markup, /data-testid="settings-mobile-section-access"/);
  assert.match(markup, /data-testid="settings-mobile-section-operation"/);
  assert.match(markup, /data-testid="settings-mobile-section-expert"/);
  assert.match(markup, /data-testid="settings-mobile-row-openrouter"/);
  assert.match(markup, /data-testid="settings-mobile-row-github"/);
  assert.match(markup, /data-testid="settings-mobile-row-matrix"/);
  assert.match(markup, /data-testid="settings-mobile-row-backend"/);
  assert.match(markup, /data-testid="settings-mobile-row-workmode"/);
  assert.match(markup, /data-testid="settings-mobile-row-diagnostics"/);
  assert.match(markup, /data-testid="settings-mobile-row-journal"/);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test --import tsx web/test/settings-workspace.test.ts
```

Expected: FAIL because the mobile authority section test ids do not exist.

- [ ] **Step 3: Add mobile helper types inside `SettingsWorkspace.tsx`**

Add these types above `export function SettingsWorkspace`:

```tsx
type MobileSettingsTone = "ready" | "partial" | "error" | "muted";
type MobileSettingsSectionId = "access" | "operation" | "expert";

type MobileSettingsTruthItem = {
  id: "backend" | "model" | "github" | "matrix";
  label: string;
  value: string;
  tone: MobileSettingsTone;
};

type MobileSettingsRowModel = {
  id: string;
  section: MobileSettingsSectionId;
  label: string;
  value: string;
  detail: string;
  tone: MobileSettingsTone;
};

function toneFromStatusText(value: string): MobileSettingsTone {
  const normalized = value.toLowerCase();

  if (normalized.includes("ready") || normalized.includes("bereit") || normalized.includes("connected") || normalized.includes("verbunden") || normalized.includes("configured") || normalized.includes("konfiguriert")) {
    return "ready";
  }

  if (normalized.includes("error") || normalized.includes("fehler") || normalized.includes("unavailable") || normalized.includes("nicht verfügbar") || normalized.includes("missing") || normalized.includes("fehlt") || normalized.includes("rejected")) {
    return "error";
  }

  return "partial";
}
```

- [ ] **Step 4: Replace mobile row derivation in `SettingsWorkspace`**

Replace the current `mobileSettingsRows` block with:

```tsx
  const mobileTruthItems: MobileSettingsTruthItem[] = [
    {
      id: "backend",
      label: "Backend",
      value: truthSnapshot.backend.label,
      tone: toneFromStatusText(truthSnapshot.backend.label),
    },
    {
      id: "model",
      label: locale === "de" ? "Modell" : "Model",
      value: openRouterCredentialStatus.configured ? (locale === "de" ? "Konfiguriert" : "Configured") : (locale === "de" ? "Fehlt" : "Missing"),
      tone: openRouterCredentialStatus.configured ? "ready" : "error",
    },
    {
      id: "github",
      label: "GitHub",
      value: truthSnapshot.github.connectionLabel,
      tone: toneFromStatusText(truthSnapshot.github.connectionLabel),
    },
    {
      id: "matrix",
      label: "Matrix",
      value: truthSnapshot.matrix.connectionLabel,
      tone: toneFromStatusText(truthSnapshot.matrix.connectionLabel),
    },
  ];

  const mobileSettingsRows: MobileSettingsRowModel[] = [
    {
      id: "openrouter",
      section: "access",
      label: openRouterCopy.title,
      value: openRouterCredentialStatus.configured ? openRouterCopy.configured : openRouterCopy.empty,
      detail: openRouterCopy.subtitle,
      tone: openRouterCredentialStatus.configured ? "ready" : "error",
    },
    {
      id: "github",
      section: "access",
      label: "GitHub",
      value: truthSnapshot.github.connectionLabel,
      detail: truthSnapshot.github.repositoryLabel,
      tone: toneFromStatusText(truthSnapshot.github.connectionLabel),
    },
    {
      id: "matrix",
      section: "access",
      label: "Matrix",
      value: truthSnapshot.matrix.connectionLabel,
      detail: truthSnapshot.matrix.scopeLabel,
      tone: toneFromStatusText(truthSnapshot.matrix.connectionLabel),
    },
    {
      id: "backend",
      section: "operation",
      label: "Backend",
      value: truthSnapshot.backend.label,
      detail: truthSnapshot.backend.detail,
      tone: toneFromStatusText(truthSnapshot.backend.label),
    },
    {
      id: "workmode",
      section: "operation",
      label: locale === "de" ? "Arbeitsdichte" : "Work mode",
      value: activeCopy.label,
      detail: activeCopy.description,
      tone: "muted",
    },
    {
      id: "diagnostics",
      section: "expert",
      label: ui.settings.diagnosticsCardTitle,
      value: ui.settings.diagnosticsSummary,
      detail: ui.settings.diagnosticsSafetyNote,
      tone: "muted",
    },
    {
      id: "journal",
      section: "expert",
      label: ui.settings.journalCardTitle,
      value: truthSnapshot.journal.status,
      detail: `${truthSnapshot.journal.mode} · ${truthSnapshot.journal.retention}`,
      tone: toneFromStatusText(truthSnapshot.journal.status),
    },
  ];

  const mobileSettingsSections: Array<{ id: MobileSettingsSectionId; title: string; rows: MobileSettingsRowModel[] }> = [
    {
      id: "access",
      title: locale === "de" ? "Zugänge" : "Access",
      rows: mobileSettingsRows.filter((row) => row.section === "access"),
    },
    {
      id: "operation",
      title: locale === "de" ? "Betrieb" : "Operation",
      rows: mobileSettingsRows.filter((row) => row.section === "operation"),
    },
    {
      id: "expert",
      title: locale === "de" ? "Expert Details" : "Expert details",
      rows: mobileSettingsRows.filter((row) => row.section === "expert"),
    },
  ];
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test --import tsx web/test/settings-workspace.test.ts
```

Expected: still FAIL until the JSX renders the new sections in Task 3.

## Task 3: Render Mobile Authority Control Center

**Files:**
- Modify: `web/src/components/SettingsWorkspace.tsx`
- Test: `web/test/settings-workspace.test.ts`

- [ ] **Step 1: Replace the mobile summary and row-list JSX**

Replace the current `settings-mobile-panel` JSX with:

```tsx
      <section className="settings-mobile-panel mobile-panel-scroll" aria-label={locale === "de" ? "Mobile Einstellungen" : "Mobile settings"}>
        <header className="settings-mobile-summary" data-testid="settings-mobile-truth-snapshot">
          <span className="mobile-mono">SETTINGS</span>
          <strong>{locale === "de" ? "Authority Control Center" : "Authority Control Center"}</strong>
          <p>{locale === "de" ? "Backend-bestätigte Wahrheit, sichere Zugänge und Expert-Diagnostik ohne Credential-Werte." : "Backend-proven truth, safe access controls, and expert diagnostics without credential values."}</p>
          <div className="settings-mobile-truth-grid" aria-label={locale === "de" ? "Systemstatus" : "System status"}>
            {mobileTruthItems.map((item) => (
              <div className={`settings-mobile-truth-item settings-mobile-truth-item-${item.tone}`} key={item.id}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </header>

        {mobileSettingsSections.map((section) => (
          <section className="settings-mobile-section" data-testid={`settings-mobile-section-${section.id}`} key={section.id}>
            <header className="settings-mobile-section-header">
              <span className="mobile-mono">{section.title}</span>
            </header>
            <div className="settings-mobile-row-list">
              {section.rows.map((row) => (
                <SettingsRow
                  key={row.id}
                  label={row.label}
                  value={row.value}
                  detail={row.detail}
                  tone={row.tone}
                  testId={`settings-mobile-row-${row.id}`}
                  action={() => setMobileSettingsSheet(row.id)}
                />
              ))}
            </div>
          </section>
        ))}

        <BottomSheet
          open={Boolean(selectedMobileSettingsRow)}
          title={selectedMobileSettingsRow?.label ?? ui.settings.title}
          onDismiss={() => setMobileSettingsSheet(null)}
          maxHeight="large"
        >
          <div className="settings-mobile-sheet-body" data-testid="settings-mobile-sheet-body">
            <span className={`status-pill status-${selectedMobileSettingsRow?.tone === "error" ? "error" : selectedMobileSettingsRow?.tone === "ready" ? "ready" : "partial"}`}>
              {selectedMobileSettingsRow?.value}
            </span>
            <strong>{selectedMobileSettingsRow?.label}</strong>
            <p>{selectedMobileSettingsRow?.detail}</p>
            <p className="muted-copy">
              {locale === "de"
                ? "Aktionen bleiben backend-owned. Der Browser zeigt nur Status, Intent und sichere Zusammenfassungen."
                : "Actions stay backend-owned. The browser only shows status, intent, and safe summaries."}
            </p>
          </div>
        </BottomSheet>
      </section>
```

- [ ] **Step 2: Remove obsolete mobile row variables**

Delete the old `selectedMobileSettingsRow` derivation only if it points at the old row shape. Keep this replacement:

```tsx
  const selectedMobileSettingsRow = mobileSettingsRows.find((row) => row.id === mobileSettingsSheet) ?? null;
```

- [ ] **Step 3: Run the Settings test**

Run:

```bash
node --test --import tsx web/test/settings-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run TypeScript**

Run:

```bash
npm run typecheck --workspace web
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2 and Task 3**

Run:

```bash
git add web/src/components/SettingsWorkspace.tsx web/test/settings-workspace.test.ts
git commit -m "Structure settings as authority control center"
```

## Task 4: Polish Mobile Settings CSS

**Files:**
- Modify: `web/src/critical.css`
- Modify: `web/src/styles.css`
- Modify: `web/src/ui-adaptation.css`
- Test: `web/test/mobile-redesign.test.ts`

- [ ] **Step 1: Add CSS source assertions**

Add this test to `web/test/mobile-redesign.test.ts` after `mobile topbar exposes theme and locale controls`:

```ts
test("mobile settings control center has truth grid and grouped sections", () => {
  const css = styles();
  const source = readFileSync("web/src/components/SettingsWorkspace.tsx", "utf8");

  assert.match(source, /settings-mobile-truth-snapshot/);
  assert.match(source, /settings-mobile-section-access/);
  assert.match(source, /settings-mobile-section-operation/);
  assert.match(source, /settings-mobile-section-expert/);
  assert.match(css, /\.settings-mobile-truth-grid/);
  assert.match(css, /\.settings-mobile-section/);
  assert.match(css, /\.settings-mobile-truth-item-ready/);
  assert.match(css, /\.settings-mobile-truth-item-error/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test --import tsx web/test/mobile-redesign.test.ts
```

Expected: FAIL because CSS classes are not fully defined.

- [ ] **Step 3: Add CSS block to all mobile CSS surfaces**

Add this block to `web/src/critical.css`, `web/src/styles.css`, and `web/src/ui-adaptation.css` near the existing Settings mobile rules:

```css
.app-shell-mobile .settings-mobile-summary {
  padding-bottom: 14px;
}

.app-shell-mobile .settings-mobile-truth-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 4px;
}

.app-shell-mobile .settings-mobile-truth-item {
  min-height: 54px;
  padding: 9px 10px;
  display: grid;
  align-content: center;
  gap: 4px;
  border: 1px solid rgba(158, 168, 190, 0.14);
  border-radius: 12px;
  background: rgba(17, 18, 26, 0.88);
}

.app-shell-mobile .settings-mobile-truth-item span {
  color: var(--mobile-redesign-muted, var(--ms-text2));
  font-size: 10px;
}

.app-shell-mobile .settings-mobile-truth-item strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ms-mono);
  font-size: 11px;
}

.app-shell-mobile .settings-mobile-truth-item-ready strong {
  color: var(--mobile-redesign-green, var(--ms-green));
}

.app-shell-mobile .settings-mobile-truth-item-partial strong {
  color: var(--mobile-redesign-amber, var(--ms-amber));
}

.app-shell-mobile .settings-mobile-truth-item-error strong {
  color: var(--mobile-redesign-red, var(--ms-red));
}

.app-shell-mobile .settings-mobile-section {
  display: grid;
  gap: 0;
  border-block-start: 1px solid rgba(158, 168, 190, 0.12);
}

.app-shell-mobile .settings-mobile-section-header {
  min-height: 34px;
  display: flex;
  align-items: end;
  padding: 10px 0 7px;
  color: var(--mobile-redesign-muted, var(--ms-text2));
}

.app-shell-mobile .settings-mobile-section .settings-mobile-row-list {
  border-block: 1px solid rgba(158, 168, 190, 0.12);
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test --import tsx web/test/mobile-redesign.test.ts
node --test --import tsx web/test/settings-workspace.test.ts
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add web/src/critical.css web/src/styles.css web/src/ui-adaptation.css web/test/mobile-redesign.test.ts
git commit -m "Polish mobile settings control center"
```

## Task 5: Add Rendered Mobile Browser Coverage

**Files:**
- Modify: `tests/browser/mosaicstacked.spec.ts`

- [ ] **Step 1: Add browser test for mobile Settings flow**

Add this test after the existing mobile chat viewport test:

```ts
test("mobile settings renders authority control center and opens detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installBaseMocks(page, { matrixStatus: "ok" });

  await page.goto("/console?mode=settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("settings-workspace")).toBeVisible();
  await expect(page.getByTestId("settings-mobile-truth-snapshot")).toBeVisible();
  await expect(page.getByTestId("settings-mobile-section-access")).toBeVisible();
  await expect(page.getByTestId("settings-mobile-section-operation")).toBeVisible();
  await expect(page.getByTestId("settings-mobile-section-expert")).toBeVisible();

  const layout = await page.evaluate(() => ({
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    visibleDesktopSettingsCards: Array.from(document.querySelectorAll(".settings-workspace > :not(.settings-mobile-panel)")).filter((element) => getComputedStyle(element as HTMLElement).display !== "none").length,
    truthItemCount: document.querySelectorAll(".settings-mobile-truth-item").length,
  }));

  expect(layout.htmlScrollWidth).toBeLessThanOrEqual(layout.htmlClientWidth);
  expect(layout.visibleDesktopSettingsCards).toBe(0);
  expect(layout.truthItemCount).toBe(4);

  await page.getByTestId("settings-mobile-row-openrouter").click();
  await expect(page.getByRole("dialog", { name: "OpenRouter models" })).toBeVisible();
  await expect(page.getByTestId("settings-mobile-sheet-body")).toContainText("backend-owned");
});
```

- [ ] **Step 2: Run browser test**

Run:

```bash
node scripts/run-browser-tests.mjs tests/browser/mosaicstacked.spec.ts --grep "mobile settings renders authority control center"
```

Expected: PASS. If sandbox blocks local port binding with `EPERM`, rerun with approved escalation for `node scripts/run-browser-tests.mjs`.

- [ ] **Step 3: Run full browser suite**

Run:

```bash
node scripts/run-browser-tests.mjs tests/browser/mosaicstacked.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 5**

Run:

```bash
git add tests/browser/mosaicstacked.spec.ts
git commit -m "Cover mobile settings authority center"
```

## Task 6: Final Verification And Governance Log

**Files:**
- Modify: `02-wiki/log.md`
- Optional Modify: `02-wiki/index.md` only if a durable settings implementation doc is added later

- [ ] **Step 1: Run web verification**

Run:

```bash
npm run typecheck --workspace web
npm run test:web
npm run build:web
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Capture a rendered mobile screenshot**

Run:

```bash
node - <<'NODE'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true });
  await page.goto('http://127.0.0.1:5173/console?mode=settings', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('[data-testid="settings-mobile-truth-snapshot"]', { timeout: 15000 });
  await page.screenshot({ path: '/tmp/mosaic-settings-authority-center.png', fullPage: false });
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    truthItems: document.querySelectorAll('.settings-mobile-truth-item').length,
    accessRows: document.querySelectorAll('[data-testid^="settings-mobile-row-"]').length,
  }));
  console.log(JSON.stringify(metrics, null, 2));
  await browser.close();
})();
NODE
```

Expected output includes:

```json
{
  "width": 375,
  "overflow": 0,
  "truthItems": 4
}
```

If Chromium launch is blocked by the sandbox, rerun with approved escalation for `node`.

- [ ] **Step 3: Append log entry**

Append this to `02-wiki/log.md`:

```md
## [2026-05-10] settings-authority-control-center | reworked mobile Settings into a backend-authority control center with truth snapshot, grouped access/operation/expert rows, safe BottomSheet details, and browser coverage [[../web/src/components/SettingsWorkspace.tsx]] [[../web/src/components/mobile/shared/SettingsRow.tsx]] [[../tests/browser/mosaicstacked.spec.ts]]
```

- [ ] **Step 4: Commit final verification log**

Run:

```bash
git add 02-wiki/log.md
git commit -m "Log settings authority center implementation"
```

- [ ] **Step 5: Report final status**

Include these exact verification lines in the final response if they pass:

```text
Verified: npm run typecheck --workspace web
Verified: npm run test:web
Verified: npm run build:web
Verified: node scripts/run-browser-tests.mjs tests/browser/mosaicstacked.spec.ts
Verified: screenshot /tmp/mosaic-settings-authority-center.png
```

## Self-Review

- Spec coverage: The plan covers the confirmed concept: authority snapshot, access rows, operation rows, expert rows, BottomSheet detail isolation, backend-owned actions, no secret exposure, mobile-first layout, desktop preservation, tests, browser verification, and governance log.
- Placeholder scan: No task contains unresolved placeholder wording; each step names concrete files, behavior, tests, and expected proof.
- Type consistency: `MobileSettingsTone`, `MobileSettingsSectionId`, `MobileSettingsTruthItem`, and `MobileSettingsRowModel` are defined before use. Test ids match browser and source tests.
