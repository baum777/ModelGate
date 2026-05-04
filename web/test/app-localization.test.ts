import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App, { shouldConfirmGitHubReviewNavigation } from "../src/App.js";
import { LocaleProvider } from "../src/lib/localization.js";

test("app shell renders core EN labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      { initialLocale: "en" },
      React.createElement(App),
    ),
  );

  assert.match(markup, /MosaicStack Console/);
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

  assert.match(markup, /MosaicStack Konsole/);
  assert.match(markup, /Arbeitsbereiche/);
  assert.match(markup, /Sprache/);
  assert.match(markup, /Neue Session/);
  assert.doesNotMatch(markup, /Wiederaufnehmbare Sessions pro Arbeitsbereich/);
});

test("GitHub tab navigation guard only triggers when leaving GitHub with local dirty review state", () => {
  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "github",
    nextMode: "chat",
    githubReviewDirty: true,
  }), true);

  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "github",
    nextMode: "github",
    githubReviewDirty: true,
  }), false);

  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "chat",
    nextMode: "matrix",
    githubReviewDirty: true,
  }), false);

  assert.equal(shouldConfirmGitHubReviewNavigation({
    currentMode: "github",
    nextMode: "review",
    githubReviewDirty: false,
  }), false);
});
