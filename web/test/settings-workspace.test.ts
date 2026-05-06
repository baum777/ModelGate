import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsWorkspace,
  type SettingsVerificationState,
  type SettingsTruthSnapshot,
} from "../src/components/SettingsWorkspace.js";
import {
  FlowIndicator,
  GovernanceSpine,
  SystemLayerFrame,
  SystemNode,
} from "../src/components/system-visuals/index.js";
import type { IntegrationsStatusResponse, JournalEntry } from "../src/lib/api.js";
import { deriveSettingsLoginAdapters } from "../src/lib/settings-login-adapters.js";

function createIntegrationsStatusFixture(): IntegrationsStatusResponse {
  return {
    ok: true,
    generatedAt: "2026-04-27T12:00:00.000Z",
    github: {
      status: "connected",
      credentialSource: "user_connected",
      capabilities: {
        read: "available",
        propose: "available",
        execute: "approval_required",
        verify: "available",
      },
      executionMode: "approval_required",
      labels: {
        identity: "octocat",
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

function createVerificationFixture(): Record<"backend" | "github" | "matrix", SettingsVerificationState> {
  return {
    backend: {
      status: "passed",
      detail: "mosaicstack-test (local)",
      checkedAt: "2026-04-27T12:00:00.000Z",
    },
    github: {
      status: "idle",
      detail: "",
      checkedAt: null,
    },
    matrix: {
      status: "failed",
      detail: "Matrix credentials were rejected",
      checkedAt: "2026-04-27T12:01:00.000Z",
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
      buildIntegrationStartUrl: (provider: "github" | "matrix") => `/api/auth/${provider}/start?returnTo=%2Fconsole%3Fmode%3Dsettings`,
      verificationResults: createVerificationFixture(),
      onVerifyConnection: () => undefined,
    }),
  );

  assert.match(markup, /GitHub/);
  assert.match(markup, /Matrix/);
  assert.match(markup, /data-testid="settings-adapter-github"/);
  assert.match(markup, /data-system-layer="execution"/);
  assert.match(markup, /data-system-node-kind="github"/);
  assert.match(markup, /aria-label="GitHub integration node, status connected"/);
  assert.match(markup, /GitHub system status: connected/);
  assert.match(markup, /aria-label="GitHub Reverify"/);
  assert.match(markup, /data-testid="settings-adapter-matrix-action-connect"/);
  assert.match(markup, />Connect Matrix</);
  assert.match(markup, /data-system-node-kind="matrix"/);
  assert.match(markup, /aria-label="Matrix integration node, status disconnected"/);
  assert.match(markup, /Matrix system status: disconnected/);
  assert.match(markup, /data-flow-state="connected"/);
  assert.match(markup, /href="\/api\/auth\/matrix\/start\?returnTo=%2Fconsole%3Fmode%3Dsettings"/);
  assert.match(markup, /Connected as octocat/);
  assert.match(markup, /Credential source/);
  assert.match(markup, /Connect available/);
  assert.match(markup, /OpenRouter (Modelle|models)/);
  assert.match(markup, /data-system-node-kind="openrouter"/);
  assert.match(markup, /aria-label="OpenRouter integration node, status connected"/);
  assert.match(markup, /OpenRouter model 1/);
  assert.match(markup, /data-testid="openrouter-model-input"/);
  assert.match(markup, /data-testid="openrouter-model-add"/);
  assert.match(markup, /data-testid="settings-verification-backend"/);
  assert.match(markup, /data-testid="settings-verification-github-action"/);
  assert.match(markup, /mosaicstack-test \(local\)/);
  assert.match(markup, /Matrix credentials were rejected/);
  assert.doesNotMatch(markup, /name=".*token/i);
  assert.doesNotMatch(markup, /type="password"/i);
  assert.doesNotMatch(markup, /sk-test/);
});

test("System visual primitives render accessible layer, node, flow, and spine semantics", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      GovernanceSpine,
      { active: true },
      React.createElement(
        SystemLayerFrame,
        { layer: "governance", active: true },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SystemNode, {
            label: "Policy Gate",
            kind: "generic",
            status: "blocked",
          }),
          React.createElement(FlowIndicator, {
            state: "blocked",
            direction: "vertical",
            label: "Policy decision",
          }),
        ),
      ),
    ),
  );

  assert.match(markup, /data-governance-spine="true"/);
  assert.match(markup, /data-system-layer="governance"/);
  assert.match(markup, /data-system-node-kind="generic"/);
  assert.match(markup, /aria-label="Policy Gate integration node, status blocked"/);
  assert.match(markup, /Policy Gate system status: blocked/);
  assert.match(markup, /data-flow-state="blocked"/);
  assert.match(markup, /aria-label="Policy decision flow, blocked, vertical"/);
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
  assert.equal(github?.credentialSource, "user_connected");

  assert.equal(matrix?.status, "connect_available");
  assert.equal(matrix?.primaryAction, "connect");
  assert.equal(matrix?.secondaryAction, null);
});

test("Settings workspace shows GitHub connect CTA when GitHub is not connected", () => {
  const fixture = createIntegrationsStatusFixture();
  const adapters = deriveSettingsLoginAdapters({
    copy: {
      checking: "Checking",
      unavailable: "Unavailable",
      none: "None",
    },
    integrations: {
      ...fixture,
      github: {
        ...fixture.github,
        status: "connect_available",
        authState: "not_connected",
        credentialSource: "not_connected",
        labels: {
          ...fixture.github.labels,
          identity: null,
        },
        lastVerifiedAt: null,
      }
    }
  });

  const markup = renderToStaticMarkup(
    React.createElement(SettingsWorkspace, {
      workMode: "expert",
      onWorkModeChange: () => undefined,
      diagnostics: [],
      onClearDiagnostics: () => undefined,
      truthSnapshot: {
        backend: { label: "Ready", detail: "Backend truth." },
        github: {
          sessionLabel: "n/a",
          connectionLabel: "n/a",
          repositoryLabel: "n/a",
          accessLabel: "n/a",
        },
        matrix: {
          identityLabel: "n/a",
          connectionLabel: "n/a",
          homeserverLabel: "n/a",
          scopeLabel: "n/a",
        },
        models: {
          activeAlias: "default",
          availableCount: 1,
          registrySourceLabel: "backend-policy",
        },
        diagnostics: {
          runtimeMode: "local",
          defaultPublicAlias: "default",
          publicAliases: "default",
          routingMode: "policy",
          fallbackEnabled: "Active",
          failClosed: "Active",
          rateLimitEnabled: "Active",
          actionStoreMode: "memory",
          githubConfigured: "Configured",
          matrixConfigured: "Configured",
          generatedAt: "2026-04-27T12:00:00.000Z",
          uptimeMs: "0",
          chatRequests: "0",
          chatStreamStarted: "0",
          chatStreamCompleted: "0",
          chatStreamError: "0",
          chatStreamAborted: "0",
          upstreamError: "0",
          rateLimitBlocked: "none",
        },
        journal: {
          status: "Configured",
          mode: "memory",
          retention: "0/500",
          recentCount: "0",
          entries: [],
        },
      },
      loginAdapters: adapters,
      onIntegrationAction: () => undefined,
      openRouterModels: [],
      openRouterModelInput: "",
      onOpenRouterModelInputChange: () => undefined,
      onAddOpenRouterModel: () => undefined,
      isAddingOpenRouterModel: false,
      buildIntegrationStartUrl: () => "/api/auth/github/start?returnTo=%2Fconsole%3Fmode%3Dsettings",
      verificationResults: createVerificationFixture(),
      onVerifyConnection: () => undefined,
    }),
  );

  assert.match(markup, /data-testid="settings-adapter-github-action-connect"/);
  assert.match(markup, />Connect GitHub</);
});

test("Settings login adapters do not treat instance credentials as a user login", () => {
  const fixture = createIntegrationsStatusFixture();
  const adapters = deriveSettingsLoginAdapters({
    copy: {
      checking: "Checking",
      unavailable: "Unavailable",
      none: "None",
    },
    integrations: {
      ...fixture,
      github: {
        ...fixture.github,
        status: "connect_available",
        authState: "not_connected",
        credentialSource: "instance_configured",
        labels: {
          ...fixture.github.labels,
          identity: "instance service credential",
        },
        lastVerifiedAt: null,
      }
    }
  });

  const github = adapters.find((adapter) => adapter.id === "github");

  assert.equal(github?.status, "connect_available");
  assert.equal(github?.primaryAction, "connect");
  assert.equal(github?.secondaryAction, null);
  assert.equal(github?.credentialSource, "instance_configured");
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
        requirements: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
      }
    }
  });

  const github = adapters.find((adapter) => adapter.id === "github");

  assert.equal(github?.status, "missing_server_config");
  assert.equal(github?.primaryAction, "reconnect");
  assert.deepEqual(github?.requirements, ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"]);
});
