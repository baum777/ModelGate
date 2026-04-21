import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsWorkspace,
  type SettingsTruthSnapshot,
} from "../src/components/SettingsWorkspace.js";

test("Settings workspace renders backend, connection, and model truth without inventing authority", () => {
  const truthSnapshot: SettingsTruthSnapshot = {
    backend: {
      label: "Bereit",
      detail: "Backend reports healthy mode.",
    },
    github: {
      sessionLabel: "Angemeldet",
      connectionLabel: "Bereit",
      repositoryLabel: "acme/console",
      accessLabel: "Schreibzugriff",
    },
    matrix: {
      identityLabel: "@alice:matrix.example",
      connectionLabel: "Verbunden",
      homeserverLabel: "matrix.example",
      scopeLabel: "Bereich gewählt",
    },
    models: {
      activeAlias: "gpt-4.1",
      availableCount: 3,
      registrySourceLabel: "backend-policy",
    },
  };

  const markup = renderToStaticMarkup(
    React.createElement(SettingsWorkspace, {
      expertMode: true,
      onExpertModeChange: () => undefined,
      diagnostics: [],
      onClearDiagnostics: () => undefined,
      truthSnapshot,
    }),
  );

  assert.match(markup, /Bereit/);
  assert.match(markup, /Verbunden/);
  assert.match(markup, /Schreibzugriff/);
  assert.match(markup, /@alice:matrix\.example/);
  assert.match(markup, /gpt-4\.1/);
  assert.match(markup, /backend-policy/);
});
