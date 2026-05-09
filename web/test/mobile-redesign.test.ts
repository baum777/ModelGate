import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appSource = () => readFileSync("web/src/App.tsx", "utf8");
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

  assert.match(source, /BottomSheet/);
  assert.match(source, /approvalConfirmProposal/);
  assert.match(source, /chat-approval-confirm-sheet/);
  assert.match(source, /executeProposal\(approvalConfirmProposal\)/);
  assert.match(source, /mobile-sheet-warning/);
  assert.match(source, /mobile-error-action/);
  assert.match(source, /thread-notice-error/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(css, /\.mobile-sheet-warning/);
  assert.match(css, /\.mobile-danger-action/);
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
