import React from "react";
import { useLocalization } from "../lib/localization.js";
import type { JournalEntry } from "../lib/api.js";
import { GuideOverlay, getWorkspaceGuide } from "./GuideOverlay.js";
import {
  getWorkModeCopy,
  isExpertMode,
  type WorkMode,
} from "../lib/work-mode.js";
import type { SettingsLoginAdapter } from "../lib/settings-login-adapters.js";

export type DiagnosticEntry = {
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

export type SettingsTruthSnapshot = {
  backend: {
    label: string;
    detail: string;
  };
  github: {
    sessionLabel: string;
    connectionLabel: string;
    repositoryLabel: string;
    accessLabel: string;
  };
  matrix: {
    identityLabel: string;
    connectionLabel: string;
    homeserverLabel: string;
    scopeLabel: string;
  };
  models: {
    activeAlias: string;
    availableCount: number;
    registrySourceLabel: string;
  };
  diagnostics: {
    runtimeMode: string;
    defaultPublicAlias: string;
    publicAliases: string;
    routingMode: string;
    fallbackEnabled: string;
    failClosed: string;
    rateLimitEnabled: string;
    actionStoreMode: string;
    githubConfigured: string;
    matrixConfigured: string;
    generatedAt: string;
    uptimeMs: string;
    chatRequests: string;
    chatStreamStarted: string;
    chatStreamCompleted: string;
    chatStreamError: string;
    chatStreamAborted: string;
    upstreamError: string;
    rateLimitBlocked: string;
  };
  journal: {
    status: string;
    mode: string;
    retention: string;
    recentCount: string;
    entries: JournalEntry[];
  };
};

type SettingsWorkspaceProps = {
  workMode: WorkMode;
  onWorkModeChange: (value: WorkMode) => void;
  diagnostics: DiagnosticEntry[];
  onClearDiagnostics: () => void;
  truthSnapshot: SettingsTruthSnapshot;
  loginAdapters: SettingsLoginAdapter[];
  openRouterModels: Array<{
    alias: string;
    label: string;
    description: string;
  }>;
  openRouterModelInput: string;
  onOpenRouterModelInputChange: (value: string) => void;
  onAddOpenRouterModel: () => void;
  isAddingOpenRouterModel: boolean;
  buildIntegrationStartUrl: (provider: "github" | "matrix") => string;
  onIntegrationAction: (
    provider: "github" | "matrix",
    action: "connect" | "reconnect" | "disconnect" | "reverify"
  ) => void;
};

export function SettingsWorkspace({
  workMode,
  onWorkModeChange,
  diagnostics,
  onClearDiagnostics,
  truthSnapshot,
  loginAdapters,
  openRouterModels,
  openRouterModelInput,
  onOpenRouterModelInputChange,
  onAddOpenRouterModel,
  isAddingOpenRouterModel,
  buildIntegrationStartUrl,
  onIntegrationAction,
}: SettingsWorkspaceProps) {
  const { locale, copy: ui } = useLocalization();
  const expertMode = isExpertMode(workMode);
  const beginnerCopy = getWorkModeCopy(locale, "beginner");
  const expertCopy = getWorkModeCopy(locale, "expert");
  const activeCopy = getWorkModeCopy(locale, workMode);
  const adapterCopy = locale === "de"
    ? {
        accessTitle: "Zugänge",
        actionLabel: "Aktion",
        requirementsLabel: "Voraussetzungen",
        noRequirements: "Keine offenen Voraussetzungen",
        credentialSourceLabel: "Credential Source",
        capabilitiesLabel: "Capabilities",
        lastVerifiedLabel: "Last verified",
        lastErrorLabel: "Last error",
        status: {
          not_connected: "Nicht verbunden",
          connect_available: "Verbinden verfügbar",
          connected: "Verbunden",
          auth_expired: "Auth abgelaufen",
          missing_server_config: "Server-Konfig fehlt",
          scope_denied: "Scope verweigert",
          upstream_unreachable: "Upstream nicht erreichbar",
          disabled_by_policy: "Policy deaktiviert",
          checking: "Wird geprüft",
          error: "Fehler",
        },
        source: {
          instance_configured: "Instance configured",
          user_connected: "User connected",
          user_connected_stub: "User connected (stub)",
          not_connected: "Not connected",
        },
        action: {
          connect: "Verbinden",
          reconnect: "Neu verbinden",
          disconnect: "Trennen",
          reverify: "Erneut prüfen",
        },
      }
    : {
        accessTitle: "Access",
        actionLabel: "Action",
        requirementsLabel: "Requirements",
        noRequirements: "No open requirements",
        credentialSourceLabel: "Credential source",
        capabilitiesLabel: "Capabilities",
        lastVerifiedLabel: "Last verified",
        lastErrorLabel: "Last error",
        status: {
          not_connected: "Not connected",
          connect_available: "Connect available",
          connected: "Connected",
          auth_expired: "Auth expired",
          missing_server_config: "Missing server config",
          scope_denied: "Scope denied",
          upstream_unreachable: "Upstream unreachable",
          disabled_by_policy: "Disabled by policy",
          checking: "Checking",
          error: "Error",
        },
        source: {
          instance_configured: "Instance configured",
          user_connected: "User connected",
          user_connected_stub: "User connected (stub)",
          not_connected: "Not connected",
        },
        action: {
          connect: "Connect",
          reconnect: "Reconnect",
          disconnect: "Disconnect",
          reverify: "Reverify",
        },
      };

  function getActionLabel(adapter: SettingsLoginAdapter, action: "connect" | "reconnect" | "disconnect" | "reverify") {
    if (adapter.id === "github" && (action === "connect" || action === "reconnect")) {
      return locale === "de" ? "GitHub verbinden" : "Connect your GitHub";
    }

    return adapterCopy.action[action];
  }

  const openRouterCopy = locale === "de"
    ? {
        title: "OpenRouter Modelle",
        subtitle: "Modelle zuerst hier registrieren; danach erscheinen sie als backend-owned Aliase im Chat.",
        inputLabel: "OpenRouter Modell-ID",
        placeholder: "provider/model",
        add: "Modell hinzufügen",
        adding: "Wird hinzugefügt",
        empty: "Noch keine zusätzlichen OpenRouter-Modelle registriert.",
      }
    : {
        title: "OpenRouter models",
        subtitle: "Register models here first; then they appear as backend-owned aliases in Chat.",
        inputLabel: "OpenRouter model ID",
        placeholder: "provider/model",
        add: "Add model",
        adding: "Adding",
        empty: "No additional OpenRouter models registered yet.",
      };

  return (
    <section className="workspace-panel settings-workspace" data-testid="settings-workspace">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">{ui.settings.heroStatus}</p>
          <h1>{ui.settings.title}</h1>
          <p className="hero-copy">{activeCopy.description}</p>
          <div className="workspace-hero-actions">
            <GuideOverlay content={getWorkspaceGuide(locale, "settings")} testId="guide-settings" />
          </div>
        </div>
      </section>

      <div className="settings-grid">
        <article className="workspace-card settings-view-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.viewCardTitle}</span>
              <strong>{activeCopy.label}</strong>
            </div>
          </header>
          <p className="muted-copy">{activeCopy.riskHint}</p>
          <div className="action-row">
            <button type="button" className={workMode === "beginner" ? "" : "secondary-button"} onClick={() => onWorkModeChange("beginner")}>
              {beginnerCopy.shortLabel}
            </button>
            <button type="button" className={workMode === "expert" ? "" : "secondary-button"} onClick={() => onWorkModeChange("expert")}>
              {expertCopy.shortLabel}
            </button>
          </div>
        </article>

        <article className="workspace-card settings-access-card">
          <header className="card-header">
            <div>
              <span>{adapterCopy.accessTitle}</span>
              <strong>{ui.settings.backendTruth}</strong>
            </div>
          </header>

          <div className="settings-adapter-list">
            {loginAdapters.map((adapter) => (
              <section
                key={adapter.id}
                className={`settings-adapter-row settings-adapter-row-${adapter.status}`}
                data-testid={`settings-adapter-${adapter.id}`}
              >
                <div className="settings-adapter-main">
                  <div>
                    <span className={`status-pill status-${adapter.status === "connected" ? "ready" : adapter.status === "error" || adapter.status === "missing_server_config" || adapter.status === "auth_expired" || adapter.status === "scope_denied" || adapter.status === "upstream_unreachable" ? "error" : "partial"}`}>
                      {adapterCopy.status[adapter.status]}
                    </span>
                    <h2>{adapter.label}</h2>
                  </div>
                  <p className="muted-copy">{adapter.safeIdentityLabel}</p>
                  <p>{adapter.scopeSummary}</p>
                </div>

                <div className="settings-adapter-actions">
                  {adapter.primaryAction === "connect" || adapter.primaryAction === "reconnect" ? (
                    <a
                      className={`primary-link-button${adapter.status === "checking" ? " is-disabled" : ""}`}
                      aria-label={`${adapter.label} ${adapterCopy.action[adapter.primaryAction]}`}
                      data-testid={`settings-adapter-${adapter.id}-action-${adapter.primaryAction}`}
                      href={adapter.status === "checking" ? undefined : buildIntegrationStartUrl(adapter.id)}
                      aria-disabled={adapter.status === "checking" ? "true" : undefined}
                      onClick={(event) => {
                        if (adapter.status === "checking") {
                          event.preventDefault();
                        }
                      }}
                    >
                      {getActionLabel(adapter, adapter.primaryAction)}
                    </a>
                  ) : (
                    <button
                      type="button"
                      aria-label={`${adapter.label} ${adapterCopy.action[adapter.primaryAction]}`}
                      data-testid={`settings-adapter-${adapter.id}-action-${adapter.primaryAction}`}
                      onClick={() => onIntegrationAction(adapter.id, adapter.primaryAction)}
                      disabled={adapter.status === "checking"}
                    >
                      {getActionLabel(adapter, adapter.primaryAction)}
                    </button>
                  )}
                  {adapter.secondaryAction ? (
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`${adapter.label} ${adapterCopy.action[adapter.secondaryAction]}`}
                      data-testid={`settings-adapter-${adapter.id}-action-${adapter.secondaryAction}`}
                      onClick={() => onIntegrationAction(adapter.id, adapter.secondaryAction!)}
                      disabled={adapter.status === "checking"}
                    >
                      {adapterCopy.action[adapter.secondaryAction]}
                    </button>
                  ) : null}
                </div>

                {expertMode ? (
                  <div className="detail-grid settings-adapter-details">
                    <div>
                      <span>{adapterCopy.actionLabel}</span>
                      <strong>{adapterCopy.action[adapter.primaryAction]}</strong>
                    </div>
                    <div>
                      <span>{adapterCopy.requirementsLabel}</span>
                      <strong>{adapter.requirements.length > 0 ? adapter.requirements.join(", ") : adapterCopy.noRequirements}</strong>
                    </div>
                    <div>
                      <span>{adapterCopy.credentialSourceLabel}</span>
                      <strong>{adapterCopy.source[adapter.credentialSource]}</strong>
                    </div>
                    <div>
                      <span>{adapterCopy.capabilitiesLabel}</span>
                      <strong>{adapter.capabilitySummary}</strong>
                    </div>
                    <div>
                      <span>{adapterCopy.lastVerifiedLabel}</span>
                      <strong>{adapter.lastVerifiedAt ?? ui.common.na}</strong>
                    </div>
                    <div>
                      <span>{adapterCopy.lastErrorLabel}</span>
                      <strong>{adapter.lastErrorCode ?? ui.common.none}</strong>
                    </div>
                    <div>
                      <span>{ui.settings.chatAuthority}</span>
                      <strong>{adapter.authority}</strong>
                    </div>
                    {adapter.expertDetails.map((detail) => (
                      <div key={`${adapter.id}-${detail.label}`}>
                        <span>{detail.label}</span>
                        <strong>{detail.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </article>

        <article className="workspace-card settings-identity-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.identityCardTitle}</span>
              <strong>{ui.settings.backendTruth}</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>{ui.settings.backend}</span>
              <strong>{truthSnapshot.backend.label}</strong>
            </div>
            <div>
              <span>{ui.settings.githubIdentity}</span>
              <strong>{truthSnapshot.github.sessionLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.githubConnection}</span>
              <strong>{truthSnapshot.github.connectionLabel}</strong>
            </div>
            {expertMode ? (
              <>
                <div>
                  <span>{ui.settings.githubAuthority}</span>
                  <strong>{truthSnapshot.github.accessLabel}</strong>
                </div>
                <div>
                  <span>{ui.settings.githubScope}</span>
                  <strong>{truthSnapshot.github.repositoryLabel}</strong>
                </div>
              </>
            ) : null}
            <div>
              <span>{ui.settings.matrixIdentity}</span>
              <strong>{truthSnapshot.matrix.identityLabel}</strong>
            </div>
            {expertMode ? (
              <>
                <div>
                  <span>{ui.settings.matrixConnection}</span>
                  <strong>{truthSnapshot.matrix.connectionLabel}</strong>
                </div>
                <div>
                  <span>{ui.settings.matrixHomeserver}</span>
                  <strong>{truthSnapshot.matrix.homeserverLabel}</strong>
                </div>
                <div>
                  <span>{ui.settings.matrixScope}</span>
                  <strong>{truthSnapshot.matrix.scopeLabel}</strong>
                </div>
              </>
            ) : null}
          </div>
          <p className="muted-copy">{truthSnapshot.backend.detail}</p>
          {expertMode ? <p className="muted-copy">{ui.settings.backendTruth}</p> : null}
        </article>

        <article className="workspace-card settings-model-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.modelCardTitle}</span>
              <strong>{ui.settings.backendPolicy}</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>{ui.settings.modelAliasLabel}</span>
              <strong>{truthSnapshot.models.activeAlias}</strong>
            </div>
            <div>
              <span>{ui.settings.modelCountLabel}</span>
              <strong>{String(truthSnapshot.models.availableCount)}</strong>
            </div>
            <div>
              <span>{ui.settings.modelSourceLabel}</span>
              <strong>{truthSnapshot.models.registrySourceLabel}</strong>
            </div>
          </div>
          <p className="muted-copy">{ui.settings.modelChoiceNote}</p>
        </article>

        <article className="workspace-card openrouter-model-card">
          <header className="card-header">
            <div>
              <span>{openRouterCopy.title}</span>
              <strong>{ui.settings.backendPolicy}</strong>
            </div>
          </header>
          <p className="muted-copy">{openRouterCopy.subtitle}</p>
          <form
            className="settings-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAddOpenRouterModel();
            }}
          >
            <label htmlFor="openrouter-model-input">{openRouterCopy.inputLabel}</label>
            <div className="settings-inline-controls">
              <input
                id="openrouter-model-input"
                data-testid="openrouter-model-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={openRouterModelInput}
                onChange={(event) => onOpenRouterModelInputChange(event.target.value)}
                placeholder={openRouterCopy.placeholder}
              />
              <button
                type="submit"
                data-testid="openrouter-model-add"
                disabled={isAddingOpenRouterModel || openRouterModelInput.trim().length === 0}
              >
                {isAddingOpenRouterModel ? openRouterCopy.adding : openRouterCopy.add}
              </button>
            </div>
          </form>
          {openRouterModels.length === 0 ? (
            <p className="empty-state">{openRouterCopy.empty}</p>
          ) : (
            <div className="settings-model-list">
              {openRouterModels.map((model) => (
                <div key={model.alias}>
                  <span>{model.alias}</span>
                  <strong>{model.label}</strong>
                  <p>{model.description}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        {expertMode ? (
        <article className="workspace-card settings-diagnostics-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.diagnosticsCardTitle}</span>
              <strong>{ui.settings.diagnosticsSummary}</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>{ui.settings.runtimeModeLabel}</span>
              <strong>{truthSnapshot.diagnostics.runtimeMode}</strong>
            </div>
            <div>
              <span>{ui.settings.defaultPublicAliasLabel}</span>
              <strong>{truthSnapshot.diagnostics.defaultPublicAlias}</strong>
            </div>
            <div>
              <span>{ui.settings.publicAliasesLabel}</span>
              <strong>{truthSnapshot.diagnostics.publicAliases}</strong>
            </div>
            <div>
              <span>{ui.settings.routingModeLabel}</span>
              <strong>{truthSnapshot.diagnostics.routingMode}</strong>
            </div>
            <div>
              <span>{ui.settings.fallbackLabel}</span>
              <strong>{truthSnapshot.diagnostics.fallbackEnabled}</strong>
            </div>
            <div>
              <span>{ui.settings.failClosedLabel}</span>
              <strong>{truthSnapshot.diagnostics.failClosed}</strong>
            </div>
            <div>
              <span>{ui.settings.rateLimitLabel}</span>
              <strong>{truthSnapshot.diagnostics.rateLimitEnabled}</strong>
            </div>
            <div>
              <span>{ui.settings.actionStoreLabel}</span>
              <strong>{truthSnapshot.diagnostics.actionStoreMode}</strong>
            </div>
            <div>
              <span>{ui.settings.githubConfiguredLabel}</span>
              <strong>{truthSnapshot.diagnostics.githubConfigured}</strong>
            </div>
            <div>
              <span>{ui.settings.matrixConfiguredLabel}</span>
              <strong>{truthSnapshot.diagnostics.matrixConfigured}</strong>
            </div>
            <div>
              <span>{ui.settings.diagnosticsGeneratedAtLabel}</span>
              <strong>{truthSnapshot.diagnostics.generatedAt}</strong>
            </div>
            <div>
              <span>{ui.settings.uptimeLabel}</span>
              <strong>{truthSnapshot.diagnostics.uptimeMs}</strong>
            </div>
            <div>
              <span>{ui.settings.chatRequestsLabel}</span>
              <strong>{truthSnapshot.diagnostics.chatRequests}</strong>
            </div>
            <div>
              <span>{ui.settings.chatStreamStartedLabel}</span>
              <strong>{truthSnapshot.diagnostics.chatStreamStarted}</strong>
            </div>
            <div>
              <span>{ui.settings.chatStreamCompletedLabel}</span>
              <strong>{truthSnapshot.diagnostics.chatStreamCompleted}</strong>
            </div>
            <div>
              <span>{ui.settings.chatStreamErrorLabel}</span>
              <strong>{truthSnapshot.diagnostics.chatStreamError}</strong>
            </div>
            <div>
              <span>{ui.settings.chatStreamAbortedLabel}</span>
              <strong>{truthSnapshot.diagnostics.chatStreamAborted}</strong>
            </div>
            <div>
              <span>{ui.settings.upstreamErrorLabel}</span>
              <strong>{truthSnapshot.diagnostics.upstreamError}</strong>
            </div>
            <div>
              <span>{ui.settings.rateLimitBlockedLabel}</span>
              <strong>{truthSnapshot.diagnostics.rateLimitBlocked}</strong>
            </div>
          </div>
          <p className="muted-copy">{ui.settings.diagnosticsSafetyNote}</p>
        </article>
        ) : null}

        {expertMode ? (
        <article className="workspace-card settings-journal-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.journalCardTitle}</span>
              <strong>{ui.settings.journalRecentEventsLabel}</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>{ui.settings.journalLabel}</span>
              <strong>{truthSnapshot.journal.status}</strong>
            </div>
            <div>
              <span>{ui.settings.actionStoreLabel}</span>
              <strong>{truthSnapshot.journal.mode}</strong>
            </div>
            <div>
              <span>{ui.settings.journalRetentionLabel}</span>
              <strong>{truthSnapshot.journal.retention}</strong>
            </div>
            <div>
              <span>{ui.settings.journalRecentCountLabel}</span>
              <strong>{truthSnapshot.journal.recentCount}</strong>
            </div>
          </div>
          {truthSnapshot.journal.entries.length === 0 ? (
            <p className="empty-state">{ui.settings.journalNoEntries}</p>
          ) : (
            <div className="diagnostic-feed" aria-live="polite">
              {truthSnapshot.journal.entries.map((entry) => (
                <article key={entry.id} className={`telemetry-item telemetry-item-${entry.severity}`}>
                  <strong>{entry.summary}</strong>
                  <p>
                    {entry.timestamp} · {entry.source} · {entry.eventType}
                  </p>
                  <p>
                    {ui.settings.journalOutcomeLabel}: {entry.outcome} · {ui.settings.journalSeverityLabel}: {entry.severity}
                  </p>
                </article>
              ))}
            </div>
          )}
        </article>
        ) : null}

        {expertMode ? (
        <article className="workspace-card settings-feed-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.diagnosticsCardTitle}</span>
              <strong>{ui.settings.diagnosticsHidden}</strong>
            </div>
          </header>
          <p className="muted-copy">{ui.settings.diagnosticsHidden}</p>
          {expertMode ? (
            <div className="diagnostic-feed" aria-live="polite">
              {diagnostics.length === 0 ? (
                <p className="empty-state">{ui.settings.diagnosticsEmpty}</p>
              ) : (
                diagnostics.map((entry) => (
                  <article key={`${entry.kind}-${entry.label}-${entry.detail ?? ""}`} className={`telemetry-item telemetry-item-${entry.kind}`}>
                    <strong>{entry.label}</strong>
                    {entry.detail ? <p>{entry.detail}</p> : null}
                  </article>
                ))
              )}
              <div className="action-row">
                <button type="button" className="secondary-button" onClick={onClearDiagnostics}>
                  {ui.settings.clearDiagnostics}
                </button>
              </div>
            </div>
          ) : null}
        </article>
        ) : null}
      </div>

    </section>
  );
}
