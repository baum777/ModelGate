import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App.js";
import { LocaleProvider } from "../src/lib/localization.js";

test("app shell renders core EN labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      { initialLocale: "en" },
      React.createElement(App),
    ),
  );

  assert.match(markup, /ModelGate Console/);
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

  assert.match(markup, /ModelGate Konsole/);
  assert.match(markup, /Arbeitsbereiche/);
  assert.match(markup, /Sprache/);
  assert.match(markup, /Wiederaufnehmbare Sessions pro Arbeitsbereich/);
});
