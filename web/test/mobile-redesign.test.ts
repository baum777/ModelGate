import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appSource = () => readFileSync("web/src/App.tsx", "utf8");
const hapticsSource = () => existsSync("web/src/hooks/useHapticFeedback.ts")
  ? readFileSync("web/src/hooks/useHapticFeedback.ts", "utf8")
  : "";
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
const bottomSheetSource = () => readFileSync("web/src/components/mobile/shared/BottomSheet.tsx", "utf8");
const localFontsSource = () => readFileSync("web/public/local-fonts.css", "utf8");
const indexMarkup = () => readFileSync("web/index.html", "utf8");

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

  for (const token of [
    "--void",
    "--surface",
    "--lift",
    "--border-hi",
    "--phosphor",
    "--phosphor2",
    "--amber",
    "--red",
    "--blue",
    "--text-display",
    "--text-body",
    "--text-caption",
    "--text-action",
    "--safe-top",
    "--safe-bottom",
    "--nav-height",
    "--context-bar-height",
    "--repo-strip-height",
    "--ease-out",
    "--duration-fast",
    "--duration-normal",
  ]) {
    assert.match(css, new RegExp(token.replace("-", "\\-")));
  }
  assert.match(css, /repeating-linear-gradient\(0deg/);
  assert.match(css, /rgba\(0,\s*200,\s*180,\s*0\.015\)/);
});

test("mobile fonts stay local while exposing IBM Plex aliases", () => {
  const fonts = localFontsSource();
  const markup = indexMarkup();

  assert.match(fonts, /font-family:\s*"IBM Plex Sans"/);
  assert.match(fonts, /font-family:\s*"IBM Plex Mono"/);
  assert.doesNotMatch(markup, /fonts\.googleapis\.com/);
  assert.doesNotMatch(markup, /fonts\.gstatic\.com/);
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
  assert.match(source, /InlineDiff/);
  assert.match(source, /Math\.min\(textarea\.scrollHeight,\s*96\)/);
  assert.match(source, /extractInlineDiffFiles/);
  assert.match(css, /\.governed-chat-card[\s\S]*display:\s*flex/);
  assert.match(css, /\.governed-thread[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.mobile-inline-diff/);
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
  const source = bottomSheetSource();

  assert.match(css, /\.mobile-bottom-sheet/);
  assert.match(css, /\.mobile-bottom-sheet-handle/);
  assert.match(css, /\.mobile-bottom-sheet[\s\S]*max-height:\s*90dvh/);
  assert.match(css, /\.mobile-bottom-sheet-backdrop/);
  assert.match(css, /backdrop-filter:\s*blur\(20px\)/);
  assert.match(source, /height\?:\s*"content" \| "75vh" \| "90vh"/);
  assert.match(source, /touchstart/);
  assert.match(source, /touchmove/);
  assert.match(source, /dragY > 80/);
});

test("mobile haptic feedback is optional and wired to mobile interactions", () => {
  const hook = hapticsSource();
  const app = appSource();

  assert.ok(hook.length > 0, "useHapticFeedback hook should exist");
  assert.match(hook, /navigator\.vibrate\?\.\(10\)/);
  assert.match(hook, /navigator\.vibrate\?\.\(\[10,\s*20,\s*10\]\)/);
  assert.match(hook, /navigator\.vibrate\?\.\(\[20,\s*10,\s*20,\s*10,\s*20\]\)/);
  assert.match(app, /useHapticFeedback/);
  assert.match(app, /haptic\.light\(\)/);
  assert.match(app, /haptic\.medium\(\)/);
});

test("mobile shell shows aliases, not provider IDs, in top-level chrome", () => {
  const source = mobileLayoutSource();

  assert.match(source, /activeModelAlias/);
  assert.doesNotMatch(source, /mobile-model-badge[\s\S]*(providerId|providerTarget|modelId)/);
});

test("mobile GitHub activity rows use right-aligned diff stats and 56px targets", () => {
  const source = readFileSync("web/src/components/mobile/github/ActivityRow.tsx", "utf8");
  const css = styles();

  assert.match(source, /mobile-activity-stats/);
  assert.match(source, /mobile-activity-meta/);
  assert.match(css, /\.app-shell-mobile \.mobile-activity-row[\s\S]*min-height:\s*56px/);
  assert.match(css, /\.app-shell-mobile \.mobile-activity-stats[\s\S]*font:\s*500 12px\/1\.2 var\(--ms-mono\)/);
});

test("mobile Matrix keeps read-only rows visible with inline disabled hint", () => {
  const source = readFileSync("web/src/components/MatrixWorkspace.tsx", "utf8");
  const css = styles();

  assert.match(source, /matrix-mobile-row-disabled/);
  assert.match(source, /matrix-mobile-inline-hint/);
  assert.match(source, /Matrix write not configured|Matrix-Schreiben nicht konfiguriert/);
  assert.match(css, /\.app-shell-mobile \.matrix-mobile-row-disabled[\s\S]*cursor:\s*not-allowed/);
  assert.match(css, /\.app-shell-mobile \.matrix-mobile-inline-hint[\s\S]*color:\s*var\(--amber\)/);
});
