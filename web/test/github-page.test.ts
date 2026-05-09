import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockGitHubReview, GitHubPage } from "../src/pages/GitHubPage.js";
import { FileTree } from "../src/components/github/FileTree.js";
import { DiffViewer } from "../src/components/github/DiffViewer.js";
import { GitHubSkeleton } from "../src/components/github/Skeletons/GitHubSkeleton.js";

test("mobile GitHub page renders a bounded review matrix with file context", () => {
  const markup = renderToStaticMarkup(
    React.createElement(GitHubPage, {
      locale: "en",
      initialReview: createMockGitHubReview(),
    }),
  );

  assert.match(markup, /GitHub Review/);
  assert.match(markup, /Ask about this file/);
  assert.match(markup, /web\/src\/App\.tsx/);
  assert.match(markup, /Approval gate/);
  assert.match(markup, /aria-label="GitHub mobile review surface"/);
});

test("file tree exposes selected file state without loading backend data", () => {
  const markup = renderToStaticMarkup(
    React.createElement(FileTree, {
      files: [
        {
          path: "web/src/App.tsx",
          status: "modified",
          risk: "medium",
          additions: 18,
          deletions: 4,
        },
        {
          path: "server/src/app.ts",
          status: "added",
          risk: "low",
          additions: 9,
          deletions: 0,
        },
      ],
      selectedPath: "web/src/App.tsx",
      onSelect: () => undefined,
    }),
  );

  assert.match(markup, /role="tree"/);
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /web\/src\/App\.tsx/);
  assert.match(markup, /18\+/);
});

test("diff viewer renders risk markers and accessible diff lines", () => {
  const markup = renderToStaticMarkup(
    React.createElement(DiffViewer, {
      file: {
        path: "web/src/App.tsx",
        status: "modified",
        risk: "medium",
        additions: 18,
        deletions: 4,
      },
      hunks: [
        {
          header: "@@ -12,6 +12,8 @@",
          lines: [
            { kind: "context", content: "const mode = readMode();" },
            { kind: "added", content: "const selectedFile = file.path;" },
            { kind: "removed", content: "const stale = true;" },
          ],
        },
      ],
      riskMarkers: [
        {
          label: "Approval gate",
          tone: "medium",
          detail: "Execution remains backend-owned.",
        },
      ],
    }),
  );

  assert.match(markup, /aria-label="Diff preview for web\/src\/App\.tsx"/);
  assert.match(markup, /data-line-kind="added"/);
  assert.match(markup, /data-line-kind="removed"/);
  assert.match(markup, /Approval gate/);
});

test("GitHub skeleton has semantic loading status", () => {
  const markup = renderToStaticMarkup(React.createElement(GitHubSkeleton));

  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-label="Loading GitHub review surface"/);
});

test("mobile GitHub surface stays out of the synchronous App import path", () => {
  const appSource = readFileSync("web/src/App.tsx", "utf8");
  const topLevelImports = appSource
    .split("\n")
    .filter((line) => line.startsWith("import "));

  assert.ok(
    topLevelImports.every((line) => !line.includes("./pages/GitHubPage")),
    "GitHubPage must remain a lazy mobile route, not a top-level App import",
  );
  assert.match(appSource, /const loadMobileGitHubPage = async \(\) =>/);
  assert.match(appSource, /import\("\.\/pages\/GitHubPage\.js"\)/);
  assert.match(appSource, /link\.href = "\/github-mobile\.css"/);
  assert.doesNotMatch(appSource, /import\("\.\/components\/github\/github\.css"\)/);
  assert.match(appSource, /isMobileViewport && mode === "github"/);
});
