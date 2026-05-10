import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appSource = () => readFileSync("web/src/App.tsx", "utf8");
const mainSource = () => readFileSync("web/src/main.tsx", "utf8");
const mobileLayoutSource = () => [
  readFileSync("web/src/App.tsx", "utf8"),
  readFileSync("web/src/components/mobile/layout/TopContextBar.tsx", "utf8"),
  readFileSync("web/src/components/mobile/layout/ContextStrip.tsx", "utf8"),
].join("\n");
const mobileChatSource = () => [
  readFileSync("web/src/components/ChatWorkspace.tsx", "utf8"),
  readFileSync("web/src/components/mobile/chat/ComposeZone.tsx", "utf8"),
  readFileSync("web/src/components/mobile/chat/InlineDiff.tsx", "utf8"),
].join("\n");
const mobileGitHubSource = () => [
  readFileSync("web/src/components/GitHubWorkspace.tsx", "utf8"),
  readFileSync("web/src/components/mobile/github/ActivityRow.tsx", "utf8"),
  readFileSync("web/src/components/mobile/github/DiffSheet.tsx", "utf8"),
].join("\n");
const styles = () => [
  readFileSync("web/src/critical.css", "utf8"),
  readFileSync("web/src/styles.css", "utf8"),
  readFileSync("web/src/ui-adaptation.css", "utf8"),
].join("\n");
const criticalSource = () => readFileSync("web/src/critical.css", "utf8");
const uiAdaptationSource = () => readFileSync("web/src/ui-adaptation.css", "utf8");

test("mobile shell keeps Kontext as the fourth context-browser tab", () => {
  const source = mobileLayoutSource();

  assert.match(source, /type WorkspaceMode = "chat" \| "github" \| "matrix" \| "review" \| "settings" \| "context"/);
  assert.match(source, /key:\s*"context"/);
  assert.match(source, /testId:\s*"tab-context-browser"/);
  assert.match(source, /label:\s*locale === "de" \? "Kontext"/);
  assert.match(source, /ContextBrowserPanel/);
  assert.match(source, /onPress:\s*\(\) => handleMobileNavSelect\("context"\)/);
});

test("mobile context strip keeps canonical state labels and opens command sheet", () => {
  const source = mobileLayoutSource();

  assert.match(source, /mobileContextStatus/);
  for (const state of ["idle", "streaming", "pending", "error"]) {
    assert.match(source, new RegExp(`label:\\s*"${state}"`));
  }
  assert.match(source, /mobile-context-strip/);
  assert.match(source, /handleMobileContextToggle/);
  assert.match(source, /mobile-context-sheet/);
});

test("mobile topbar exposes theme and locale controls", () => {
  const source = mobileLayoutSource();
  const css = styles();

  assert.match(source, /theme=\{theme\}/);
  assert.match(source, /locale=\{locale\}/);
  assert.match(source, /className="theme-toggle-button"/);
  assert.match(source, /\{theme === "dark" \? "☀" : "☾"\}/);
  assert.match(source, /className="shell-language-toggle"/);
  assert.match(source, /data-testid="locale-en"/);
  assert.match(source, /data-testid="locale-de"/);
  assert.doesNotMatch(source, /mobile-theme-toggle/);
  assert.doesNotMatch(source, /mobile-locale-/);
  assert.match(css, /\.app-shell-mobile \.theme-toggle-button/);
  assert.match(css, /\.app-shell-mobile \.shell-language-toggle/);
  assert.match(css, /\.app-shell-mobile \.shell-language-button-active/);
});

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

test("mobile settings sheet scopes text padding and openrouter form spacing", () => {
  const css = styles();

  assert.match(css, /\.app-shell-mobile \.mobile-bottom-sheet[\s\S]*box-sizing:\s*border-box/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-sheet-body[\s\S]*padding:\s*0 16px calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-sheet-body \.status-pill[\s\S]*width:\s*100%/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-sheet-body \.status-pill[\s\S]*font-size:\s*12px/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-sheet-body \.status-pill[\s\S]*white-space:\s*normal/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-sheet-body > strong[\s\S]*font-size:\s*14px/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-dropdown \.muted-copy[\s\S]*font-size:\s*13px/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-openrouter-form input[\s\S]*box-sizing:\s*border-box/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-openrouter-form input[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.app-shell-mobile \.settings-mobile-openrouter-form button[\s\S]*width:\s*100%/);
});

test("mobile redesign does not restore deleted mock mobile surfaces", () => {
  const removedPaths = [
    "web/src/pages/ChatPage.tsx",
    "web/src/pages/GitHubPage.tsx",
    "web/src/pages/MatrixPage.tsx",
    "web/src/components/chat/ChatSurface.tsx",
    "web/src/components/github/FileTree.tsx",
    "web/src/components/matrix/KnowledgeMap.tsx",
    "web/public/github-mobile.css",
    "web/public/matrix-mobile.css",
  ];

  for (const path of removedPaths) {
    assert.equal(existsSync(path), false, `${path} should stay removed`);
  }
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
  assert.match(css, /\.mobile-compose-input[\s\S]*resize:\s*none/);
  assert.match(css, /\.workspace-tab-mobile[\s\S]*min-height:\s*44px/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /overscroll-behavior:\s*contain/);
});

test("mobile chat slice uses bounded composer and inline diff primitives", () => {
  const source = mobileChatSource();
  const css = styles();

  assert.match(source, /ComposeZone/);
  assert.match(source, /MobileChatTipRail/);
  assert.match(source, /InlineDiff/);
  assert.match(source, /mobile-compose-field/);
  assert.match(source, /mobile-compose-submit/);
  assert.match(source, /Math\.min\(textarea\.scrollHeight,\s*96\)/);
  assert.match(source, /extractInlineDiffFiles/);
  assert.match(css, /--mobile-chat-golden-ratio:\s*1\.618/);
  assert.match(css, /\.mobile-compose-field[\s\S]*position:\s*relative/);
  assert.match(css, /\.mobile-compose-submit[\s\S]*position:\s*absolute/);
  assert.match(css, /\.governed-composer textarea[\s\S]*scrollbar-width:\s*none/);
  assert.match(css, /\.mobile-chat-input-stack[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.mobile-chat-tip-rail[\s\S]*animation:\s*mobile-tip-cycle/);
  assert.match(css, /\.governed-chat-card[\s\S]*display:\s*flex/);
  assert.match(css, /\.governed-thread[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.mobile-inline-diff/);
});

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

test("mobile GitHub slice uses real workspace state and bottom sheet diff primitives", () => {
  const source = mobileGitHubSource();
  const css = styles();

  assert.match(source, /github-mobile-panel/);
  assert.match(source, /ActivityRow/);
  assert.match(source, /DiffSheet/);
  assert.match(source, /selectedRepo/);
  assert.match(source, /analysisBundle/);
  assert.match(source, /proposalPlan/);
  assert.doesNotMatch(source, /mock|demo/i);
  assert.match(css, /\.github-mobile-panel/);
  assert.match(css, /\.mobile-activity-row[\s\S]*min-height:\s*52px/);
});

test("mobile chat approval and error polish stays inline and backend-owned", () => {
  const source = mobileChatSource();
  const css = styles();

  assert.match(source, /void executeProposal\(pendingProposal\)/);
  assert.doesNotMatch(source, /approvalConfirmProposal/);
  assert.doesNotMatch(source, /chat-approval-confirm-sheet/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /mobile-error-action/);
  assert.match(source, /thread-notice-error/);
  assert.match(css, /\.app-shell-mobile \.thread-notice-error[\s\S]*border-left/);
});

test("bottom sheets use handle, backdrop, and capped viewport height", () => {
  const css = styles();

  assert.match(css, /\.mobile-bottom-sheet/);
  assert.match(css, /\.mobile-bottom-sheet-handle/);
  assert.match(css, /\.mobile-bottom-sheet[\s\S]*max-height:\s*90dvh/);
  assert.match(css, /\.mobile-bottom-sheet-backdrop/);
});

test("mobile shell shows aliases, not provider IDs, in top-level chrome", () => {
  const source = mobileLayoutSource();

  assert.match(source, /activeModelAlias/);
  assert.doesNotMatch(source, /mobile-model-badge[\s\S]*(providerId|providerTarget|modelId)/);
});

test("deferred CSS keeps restored mobile shell chrome stable", () => {
  const source = uiAdaptationSource();
  const guardIndex = source.indexOf("Deferred mobile stability guard");

  assert.ok(guardIndex > source.indexOf("Legacy hard overrides"));

  const guard = source.slice(guardIndex);
  assert.ok((source.match(/:not\(\.mobile-context-strip\)/g) ?? []).length >= 3);
  assert.match(guard, /\.app-shell-mobile \.mobile-brand-button\s*{[\s\S]*background:\s*transparent !important/);
  assert.match(guard, /\.app-shell-mobile \.mobile-brand-button \.mosaicstacked-mark\s*{[\s\S]*display:\s*inline-flex !important/);
  assert.match(guard, /\.app-shell-mobile \.mobile-context-strip\s*{[\s\S]*display:\s*grid !important[\s\S]*background:\s*rgba\(9,\s*11,\s*16,\s*0\.98\) !important/);
  assert.match(guard, /\.app-shell-mobile \.mobile-context-path span:not\(:first-child\)::before,[\s\S]*\.app-shell-mobile \.mobile-context-live::before\s*{[\s\S]*content:\s*none !important/);
  assert.match(guard, /\.app-shell-mobile \.mobile-context-live\s*{[\s\S]*background:\s*transparent !important/);
  assert.match(guard, /\.app-shell-mobile \.workspace-tab-mobile\.workspace-tab-active\s*{[\s\S]*background:\s*rgba\(108,\s*92,\s*231,\s*0\.16\) !important/);
  assert.match(guard, /\.app-shell-mobile \.workspace-tab-mobile\.workspace-tab-active::after\s*{[\s\S]*display:\s*none !important/);
});

test("mobile viewport does not import deferred desktop CSS after idle timeout", () => {
  const source = mainSource();

  assert.match(source, /DESKTOP_DEFERRED_CSS_QUERY = "\(min-width: 761px\)"/);
  assert.match(source, /function loadDeferredCssForViewport\(\)/);
  assert.match(source, /window\.matchMedia\(DESKTOP_DEFERRED_CSS_QUERY\)/);
  assert.match(source, /if \(desktopQuery\.matches\) \{[\s\S]*loadDeferredCssOnce\(\)/);
  assert.match(source, /loadStylesheetOnce\("mosaicstacked-local-fonts", "\/local-fonts\.css"\);\s*loadDeferredCssForViewport\(\);\s*scheduleNonCriticalWork/);
  assert.doesNotMatch(source, /scheduleNonCriticalWork\(\(\) => \{[\s\S]*import\("\.\/deferred\.css"\)/);
  assert.doesNotMatch(source, /scheduleNonCriticalWork\(\(\) => \{[\s\S]*loadDeferredCssForViewport\(\)/);
});

test("desktop shell has critical and deferred responsive guards", () => {
  const critical = criticalSource();
  const ui = uiAdaptationSource();

  assert.match(critical, /Desktop shell critical layout/);
  assert.match(critical, /@media \(min-width:\s*761px\)[\s\S]*\.app-shell-console:not\(\.app-shell-mobile\) \.console-layout\s*{[\s\S]*grid-template-columns:\s*220px minmax\(0,\s*1fr\) minmax\(280px,\s*320px\)/);
  assert.match(ui, /Desktop shell responsive stability guard/);
  assert.match(ui, /@media \(min-width:\s*1024px\)[\s\S]*\.app-shell-console:not\(\.app-shell-mobile\) \.console-layout\s*{[\s\S]*grid-template-columns:\s*220px minmax\(0,\s*1fr\) minmax\(280px,\s*320px\) !important/);
  assert.match(ui, /@media \(min-width:\s*1024px\) and \(max-width:\s*1279px\)[\s\S]*grid-template-columns:\s*220px minmax\(0,\s*1fr\) 280px !important/);
  assert.match(ui, /\.app-shell-console:not\(\.app-shell-mobile\) \.workspace-tab-vertical span,[\s\S]*\.app-shell-console:not\(\.app-shell-mobile\) \.workspace-tab-vertical strong,[\s\S]*\.app-shell-console:not\(\.app-shell-mobile\) \.workspace-tab-vertical small,[\s\S]*overflow:\s*hidden/);
});
