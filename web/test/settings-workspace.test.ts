import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsWorkspace,
  type SettingsTruthSnapshot,
} from "../src/components/SettingsWorkspace.js";
import type { IntegrationsStatusResponse, JournalEntry } from "../src/lib/api.js";
import { deriveSettingsLoginAdapters } from "../src/lib/settings-login-adapters.js";

function createIntegrationsStatusFixture(): IntegrationsStatusResponse {
  return {
    ok: true,
    generatedAt: "2026-04-27T12:00:00.000Z",
    github: {
      status: "connected",
      credentialSource: "user_connected_stub",
      capabilities: {
        read: "available",
        propose: "available",
        execute: "approval_required",
        verify: "available",
      },
      executionMode: "approval_required",
      labels: {
        identity: "stub-github-operator",
        scope: "2 allowed repos",
        allowedReposStatus: "configured",
      },
      lastVerifiedAt: "2026-04-27T12:00:00.000Z",
      lastErrorCode: null,
    },
    matrix: {
      status: "connect_available",
      credentialSource: "not_connected",
      capabilities: {
        read: "blocked",
        propose: "blocked",
        execute: "blocked",
        verify: "blocked",
      },
      executionMode: "disabled",
      labels: {
        identity: null,
        scope: "Matrix scope unavailable until backend config is ready.",
        homeserver: null,
        roomAccess: "unknown",
      },
      lastVerifiedAt: null,
      lastErrorCode: null,
    },
  };
}

test("Settings workspace renders integration cards and keeps secrets out of the DOM", () => {
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
        }
      ] as JournalEntry[],
    },
  };
  const openRouterModels = [
    {
      alias: "openrouter-1",
      label: "OpenRouter model 1",
      description: "Backend-owned OpenRouter model added in Settings.",
      capabilities: ["chat", "streaming"],
      tier: "specialized" as const,
      streaming: true,
      recommendedFor: ["configured_openrouter"],
      available: true,
    }
  ];
  const loginAdapters = deriveSettingsLoginAdapters({
    copy: {
      checking: "Checking",
      unavailable: "Unavailable",
      none: "None",
    },
    integrations: createIntegrationsStatusFixture()
  });

  const markup = renderToStaticMarkup(
    React.createElement(SettingsWorkspace, {
      workMode: "expert",
      onWorkModeChange: () => undefined,
      diagnostics: [],
      onClearDiagnostics: () => undefined,
      truthSnapshot,
      loginAdapters,
      onIntegrationAction: () => undefined,
      openRouterModels,
      openRouterModelInput: "",
      onOpenRouterModelInputChange: () => undefined,
      onAddOpenRouterModel: () => undefined,
      isAddingOpenRouterModel: false,
    }),
  );

  assert.match(markup, /GitHub/);
  assert.match(markup, /Matrix/);
  assert.match(markup, /data-testid="settings-adapter-github"/);
  assert.match(markup, /aria-label="GitHub Reverify"/);
  assert.match(markup, /data-testid="settings-adapter-matrix-action-connect"/);
  assert.match(markup, /stub-github-operator/);
  assert.match(markup, /Credential source/);
  assert.match(markup, /Connect available/);
  assert.match(markup, /OpenRouter (Modelle|models)/);
  assert.match(markup, /OpenRouter model 1/);
  assert.match(markup, /data-testid="openrouter-model-input"/);
  assert.match(markup, /data-testid="openrouter-model-add"/);
  assert.doesNotMatch(markup, /name=".*token/i);
  assert.doesNotMatch(markup, /type="password"/i);
  assert.doesNotMatch(markup, /sk-test/);
});

test("Settings login adapters map connected and reconnect states for governed CTAs", () => {
  const adapters = deriveSettingsLoginAdapters({
    copy: {
      checking: "Checking",
      unavailable: "Unavailable",
      none: "None",
    },
    integrations: createIntegrationsStatusFixture()
  });

  const github = adapters.find((adapter) => adapter.id === "github");
  const matrix = adapters.find((adapter) => adapter.id === "matrix");

  assert.equal(github?.status, "connected");
  assert.equal(github?.primaryAction, "reverify");
  assert.equal(github?.secondaryAction, "disconnect");
  assert.equal(github?.credentialSource, "user_connected_stub");

  assert.equal(matrix?.status, "connect_available");
  assert.equal(matrix?.primaryAction, "connect");
  assert.equal(matrix?.secondaryAction, null);
});

test("Settings login adapters expose missing-server-config requirements", () => {
  const adapters = deriveSettingsLoginAdapters({
    copy: {
      checking: "Checking",
      unavailable: "Unavailable",
      none: "None",
    },
    integrations: {
      ...createIntegrationsStatusFixture(),
      github: {
        ...createIntegrationsStatusFixture().github,
        status: "missing_server_config",
        credentialSource: "not_connected",
      }
    }
  });

  const github = adapters.find((adapter) => adapter.id === "github");

  assert.equal(github?.status, "missing_server_config");
  assert.equal(github?.primaryAction, "reconnect");
  assert.deepEqual(github?.requirements, ["GITHUB_TOKEN", "GITHUB_ALLOWED_REPOS"]);
});
