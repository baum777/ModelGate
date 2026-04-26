import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsWorkspace,
  type SettingsTruthSnapshot,
} from "../src/components/SettingsWorkspace.js";
import type { JournalEntry } from "../src/lib/api.js";
import { deriveSettingsLoginAdapters } from "../src/lib/settings-login-adapters.js";

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
    diagnostics: {
      runtimeMode: "local",
      defaultPublicAlias: "default",
      publicAliases: "default, coding",
      routingMode: "policy",
      fallbackEnabled: "Active",
      failClosed: "Active",
      rateLimitEnabled: "Active",
      actionStoreMode: "memory",
      githubConfigured: "Configured",
      matrixConfigured: "Not configured",
      generatedAt: "2026-04-24T10:00:00.000Z",
      uptimeMs: "1234",
      chatRequests: "4",
      chatStreamStarted: "3",
      chatStreamCompleted: "2",
      chatStreamError: "1",
      chatStreamAborted: "0",
      upstreamError: "1",
      rateLimitBlocked: "chat:1, auth:0, gh-propose:0, gh-exec:0, matrix-exec:0",
    },
    journal: {
      status: "Configured",
      mode: "memory",
      retention: "2/500",
      recentCount: "2",
      entries: [
        {
          id: "entry-1",
          timestamp: "2026-04-24T10:00:00.000Z",
          source: "chat",
          eventType: "chat_stream_completed",
          authorityDomain: "chat",
          severity: "info",
          outcome: "executed",
          summary: "Chat stream completed",
          correlationId: null,
          proposalId: null,
          planId: null,
          executionId: null,
          verificationId: null,
          modelRouteSummary: null,
          safeMetadata: {},
          redaction: {
            contentStored: false,
            secretsStored: false,
            filteredKeys: []
          }
        },
        {
          id: "entry-2",
          timestamp: "2026-04-24T10:01:00.000Z",
          source: "github",
          eventType: "github_proposal_created",
          authorityDomain: "github",
          severity: "warning",
          outcome: "blocked",
          summary: "GitHub proposal blocked",
          correlationId: null,
          proposalId: null,
          planId: "plan-1",
          executionId: null,
          verificationId: null,
          modelRouteSummary: null,
          safeMetadata: {},
          redaction: {
            contentStored: false,
            secretsStored: false,
            filteredKeys: []
          }
        }
      ] as JournalEntry[],
    },
  };
  const loginAdapters = deriveSettingsLoginAdapters({
    copy: {
      authenticated: "Unlocked",
      checking: "Checking",
      locked: "Locked",
      ready: "Ready",
      unavailable: "Unavailable",
      error: "Error",
      none: "None",
      configureBackend: "Configure server",
      connect: "Connect",
      disconnect: "Disconnect",
      open: "Open",
      retry: "Retry",
    },
    authSession: {
      status: "authenticated",
      error: null,
    },
    backend: {
      healthy: true,
      label: "Bereit",
    },
    github: {
      configured: true,
      ready: true,
      connectionLabel: "Bereit",
      repositoryLabel: "acme/console",
      accessLabel: "Schreibzugriff",
    },
    matrix: {
      configured: true,
      ready: true,
      identityLabel: "@alice:matrix.example",
      connectionLabel: "Verbunden",
      homeserverLabel: "matrix.example",
      scopeLabel: "Bereich gewählt",
    },
    chat: {
      activeAlias: "gpt-4.1",
      availableCount: 3,
    },
  });

  const markup = renderToStaticMarkup(
    React.createElement(SettingsWorkspace, {
      workMode: "expert",
      onWorkModeChange: () => undefined,
      diagnostics: [],
      onClearDiagnostics: () => undefined,
      truthSnapshot,
      loginAdapters,
      adminPassword: "",
      adminBusy: false,
      onAdminPasswordChange: () => undefined,
      onAdminLogin: () => undefined,
      onAdminLogout: () => undefined,
      onOpenWorkspace: () => undefined,
    }),
  );

  assert.match(markup, /Bereit/);
  assert.match(markup, /Verbunden/);
  assert.match(markup, /Schreibzugriff/);
  assert.match(markup, /@alice:matrix\.example/);
  assert.match(markup, /gpt-4\.1/);
  assert.match(markup, /backend-policy/);
  assert.match(markup, /default, coding/);
  assert.match(markup, /chat:1, auth:0/);
  assert.match(markup, /chat_stream_completed/);
  assert.match(markup, /github_proposal_created/);
  assert.match(markup, /Admin session/);
  assert.match(markup, /GitHub/);
  assert.match(markup, /Matrix/);
  assert.match(markup, /\/api\/matrix\/\*/);
});

test("Settings login adapters keep GitHub behind admin session and Matrix server-configured", () => {
  const adapters = deriveSettingsLoginAdapters({
    copy: {
      authenticated: "Unlocked",
      checking: "Checking",
      locked: "Locked",
      ready: "Ready",
      unavailable: "Unavailable",
      error: "Error",
      none: "None",
      configureBackend: "Configure server",
      connect: "Connect",
      disconnect: "Disconnect",
      open: "Open",
      retry: "Retry",
    },
    authSession: {
      status: "locked",
      error: null,
    },
    backend: {
      healthy: true,
      label: "Ready",
    },
    github: {
      configured: true,
      ready: true,
      connectionLabel: "Ready",
      repositoryLabel: "No repo selected",
      accessLabel: "Read only",
    },
    matrix: {
      configured: false,
      ready: false,
      identityLabel: "Checking",
      connectionLabel: "Checking",
      homeserverLabel: "n/a",
      scopeLabel: "No scope",
    },
    chat: {
      activeAlias: "default",
      availableCount: 1,
    },
  });

  const admin = adapters.find((adapter) => adapter.id === "admin");
  const github = adapters.find((adapter) => adapter.id === "github");
  const matrix = adapters.find((adapter) => adapter.id === "matrix");

  assert.equal(admin?.status, "locked");
  assert.equal(admin?.primaryAction, "connect");
  assert.equal(github?.status, "locked");
  assert.deepEqual(github?.requirements, ["Admin session"]);
  assert.equal(matrix?.status, "unavailable");
  assert.equal(matrix?.primaryAction, "configure");
  assert.ok(matrix?.requirements.includes("MATRIX_ACCESS_TOKEN"));
});
