import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App, { resolveAppSurface, shouldConfirmGitHubReviewNavigation } from "../src/App.js";
import { LocaleProvider } from "../src/lib/localization.js";

test("app shell renders core EN labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      { initialLocale: "en" },
      React.createElement(App),
    ),
  );

  assert.match(markup, /MosaicStacked Console/);
  assert.match(markup, /Workspaces/);
  assert.match(markup, /Language/);
});

test("app shell renders core DE labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      { initialLocale: "de" },
      React.createElement(App),
    ),
  );

  assert.match(markup, /MosaicStacked Konsole/);
  assert.match(markup, /Arbeitsbereiche/);
  assert.match(markup, /Sprache/);
  assert.match(markup, /Neue Session/);
  assert.doesNotMatch(markup, /Wiederaufnehmbare Sessions pro Arbeitsbereich/);
});

test("app route resolver separates preview, README landing, and console", () => {
  assert.equal(resolveAppSurface("https://example.test/"), "preview");
  assert.equal(resolveAppSurface("https://example.test/readme"), "readme");
  assert.equal(resolveAppSurface("https://example.test/handbook"), "readme");
  assert.equal(resolveAppSurface("https://example.test/console?mode=chat"), "console");
  assert.equal(resolveAppSurface("https://example.test/?console=1"), "console");
});

test("Workbench navigation guard only triggers when leaving Workbench with local dirty review state", () => {
  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "workbench",
    nextMode: "chat",
    githubReviewDirty: true,
  }), true);

  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "workbench",
    nextMode: "workbench",
    githubReviewDirty: true,
  }), false);

  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "chat",
    nextMode: "matrix",
    githubReviewDirty: true,
  }), false);

  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "workbench",
    nextMode: "settings",
    githubReviewDirty: false,
  }), false);
});

test("legacy workspace URL modes normalize to workbench and shell tabs are four-only", () => {
  const source = readFileSync("web/src/App.tsx", "utf8");

  assert.match(source, /if \(value === "github" \|\| value === "review" \|\| value === "context"\) \{\s*return "workbench";\s*\}/);
  assert.match(source, /const WORKSPACE_MODES: WorkspaceMode\[\] = \["chat", "workbench", "matrix", "settings"\]/);
  assert.match(source, /const MOBILE_NAV_MODES: WorkspaceMode\[\] = \["chat", "workbench", "matrix", "settings"\]/);
});
