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
import {
  areOpenRouterCredentialInputsValid,
  OPENROUTER_API_KEY_MIN_LENGTH,
} from "../lib/openrouter-inputs.js";
import {
  FlowIndicator,
  GovernanceSpine,
  SystemLayerFrame,
  SystemNode,
  type FlowIndicatorState,
  type SystemNodeStatus,
} from "./system-visuals/index.js";
import { BottomSheet } from "./mobile/shared/BottomSheet.js";
import { SettingsRow } from "./mobile/shared/SettingsRow.js";

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

export type SettingsVerificationTarget = "backend" | "github" | "matrix";

export type SettingsVerificationState = {
  status: "idle" | "checking" | "passed" | "failed";
  detail: string;
  checkedAt: string | null;
};

type SettingsWorkspaceProps = {
  workMode: WorkMode;
  onWorkModeChange: (value: WorkMode) => void;
  diagnostics: DiagnosticEntry[];
  onClearDiagnostics: () => void;
  truthSnapshot: SettingsTruthSnapshot;
  loginAdapters: SettingsLoginAdapter[];
  openRouterCredentialStatus: {
    configured: boolean;
    models: Array<{
      alias: string;
      label: string;
      source: "user_configured";
    }>;
  };
  openRouterApiKeyInput: string;
  openRouterModelInput: string;
  onOpenRouterApiKeyInputChange: (value: string) => void;
  onOpenRouterModelInputChange: (value: string) => void;
  onSaveOpenRouterCredentials: () => void;
  onTestOpenRouterCredentials: () => void;
  isSavingOpenRouterCredentials: boolean;
  isTestingOpenRouterCredentials: boolean;
  openRouterCredentialMessage: string | null;
  buildIntegrationStartUrl: (provider: "github" | "matrix") => string;
  onIntegrationAction: (
    provider: "github" | "matrix",
    action: "connect" | "reconnect" | "disconnect" | "reverify"
  ) => void;
  verificationResults: Record<SettingsVerificationTarget, SettingsVerificationState>;
  onVerifyConnection: (target: SettingsVerificationTarget) => void;
};

function getIntegrationNodeStatus(status: SettingsLoginAdapter["status"]): SystemNodeStatus {
  if (status === "connected") {
    return "connected";
  }

  if (status === "checking") {
    return "pending";
  }

  if (status === "auth_expired" || status === "missing_server_config" || status === "scope_denied" || status === "disabled_by_policy") {
    return "blocked";
  }

  if (status === "upstream_unreachable" || status === "error") {
    return "error";
  }

  return "disconnected";
}

function getIntegrationFlowState(status: SettingsLoginAdapter["status"]): FlowIndicatorState {
  const nodeStatus = getIntegrationNodeStatus(status);

  if (nodeStatus === "connected") {
    return "connected";
  }

  if (nodeStatus === "pending") {
    return "pending";
  }

  if (nodeStatus === "blocked") {
    return "blocked";
  }

  if (nodeStatus === "error") {
    return "error";
  }

  return "idle";
}

function isActiveNodeStatus(status: SystemNodeStatus) {
  return status === "connected" || status === "pending" || status === "executing";
}

type MobileSettingsTone = "ready" | "partial" | "error" | "muted";
type MobileSettingsSectionId = "access" | "operation" | "expert";

type MobileSettingsTruthItem = {
  id: "backend" | "model" | "github" | "matrix";
  label: string;
  value: string;
  tone: MobileSettingsTone;
};

type MobileSettingsRowModel = {
  id: string;
  section: MobileSettingsSectionId;
  label: string;
  value: string;
  detail: string;
  tone: MobileSettingsTone;
};

function toneFromStatusText(value: string): MobileSettingsTone {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("ready") ||
    normalized.includes("bereit") ||
    normalized.includes("connected") ||
    normalized.includes("verbunden") ||
    normalized.includes("configured") ||
    normalized.includes("konfiguriert")
  ) {
    return "ready";
  }

  if (
    normalized.includes("error") ||
    normalized.includes("fehler") ||
    normalized.includes("unavailable") ||
    normalized.includes("nicht verfügbar") ||
    normalized.includes("missing") ||
    normalized.includes("fehlt") ||
    normalized.includes("rejected")
  ) {
    return "error";
  }

  return "partial";
}

export function SettingsWorkspace({
  workMode,
  onWorkModeChange,
  diagnostics,
  onClearDiagnostics,
  truthSnapshot,
  loginAdapters,
  openRouterCredentialStatus,
  openRouterApiKeyInput,
  openRouterModelInput,
  onOpenRouterApiKeyInputChange,
  onOpenRouterModelInputChange,
  onSaveOpenRouterCredentials,
  onTestOpenRouterCredentials,
  isSavingOpenRouterCredentials,
  isTestingOpenRouterCredentials,
  openRouterCredentialMessage,
  buildIntegrationStartUrl,
  onIntegrationAction,
  verificationResults,
  onVerifyConnection,
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
          user_connected_stub: "Legacy stub connection",
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
          user_connected_stub: "Legacy stub connection",
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
      return locale === "de" ? "GitHub verbinden" : "Connect GitHub";
    }

    if (adapter.id === "matrix" && (action === "connect" || action === "reconnect")) {
      return locale === "de" ? "Matrix verbinden" : "Connect Matrix";
    }

    return adapterCopy.action[action];
  }

  const openRouterCopy = locale === "de"
    ? {
        title: "OpenRouter Modelle",
        subtitle: "Speichere deinen eigenen OpenRouter API Key backend-seitig. Der Browser zeigt danach nur einen maskierten Status.",
        keyLabel: "OpenRouter API Key",
        inputLabel: "OpenRouter Modell-ID",
        validation: `OpenRouter API Key braucht mindestens ${OPENROUTER_API_KEY_MIN_LENGTH} Zeichen; die Modell-ID muss provider/model verwenden.`,
        keyPlaceholder: "sk-or-v1-...",
        placeholder: "provider/model",
        save: "Speichern",
        saving: "Speichert",
        test: "Verbindung testen",
        testing: "Test läuft",
        configured: "OpenRouter key configured",
        empty: "Noch kein OpenRouter-Key für dieses lokale Profil gespeichert.",
      }
    : {
        title: "OpenRouter models",
        subtitle: "Store your own OpenRouter API key on the backend. The browser only shows masked status after save.",
        keyLabel: "OpenRouter API key",
        inputLabel: "OpenRouter model ID",
        validation: `OpenRouter API key must have at least ${OPENROUTER_API_KEY_MIN_LENGTH} characters; model ID must use provider/model.`,
        keyPlaceholder: "sk-or-v1-...",
        placeholder: "provider/model",
        save: "Save",
        saving: "Saving",
        test: "Test connection",
        testing: "Testing",
        configured: "OpenRouter key configured",
        empty: "No OpenRouter key is configured for this local profile yet.",
      };
  const openRouterCredentialInputsValid = areOpenRouterCredentialInputsValid(openRouterApiKeyInput, openRouterModelInput);
  const openRouterControlsDisabled = !openRouterCredentialInputsValid;
  const openRouterMessageTone = openRouterCredentialMessage
    && /(failed|invalid|error|fehler|nicht konfiguriert|not configured|not saved|missing)/i.test(openRouterCredentialMessage)
    ? "error"
    : "ready";
  const verificationCopy = locale === "de"
    ? {
        title: "Verbindung testen",
        subtitle: "Prüft bestehende Backend-Routen. Der Browser erhält nur Status und sichere Zusammenfassungen.",
        backend: "Backend",
        github: "GitHub",
        matrix: "Matrix",
        idle: "Noch nicht geprüft",
        checking: "Wird geprüft",
        passed: "OK",
        failed: "Fehler",
        checkedAt: "Geprüft",
        action: "Test connection",
      }
    : {
        title: "Test connections",
        subtitle: "Checks existing backend routes. The browser only receives status and safe summaries.",
        backend: "Backend",
        github: "GitHub",
        matrix: "Matrix",
        idle: "Not checked yet",
        checking: "Checking",
        passed: "OK",
        failed: "Failed",
        checkedAt: "Checked",
        action: "Test connection",
      };
  const verificationTargets: Array<{ id: SettingsVerificationTarget; label: string }> = [
    { id: "backend", label: verificationCopy.backend },
    { id: "github", label: verificationCopy.github },
    { id: "matrix", label: verificationCopy.matrix },
  ];
  const [mobileSettingsSheet, setMobileSettingsSheet] = React.useState<string | null>(null);
  const openRouterMobileStatusValue = openRouterCredentialStatus.configured
    ? (locale === "de" ? "Konfiguriert" : "Configured")
    : (locale === "de" ? "Fehlt" : "Missing");
  const mobileTruthItems: MobileSettingsTruthItem[] = [
    {
      id: "backend",
      label: "Backend",
      value: truthSnapshot.backend.label,
      tone: toneFromStatusText(truthSnapshot.backend.label),
    },
    {
      id: "model",
      label: locale === "de" ? "Modell" : "Model",
      value: openRouterCredentialStatus.configured ? (locale === "de" ? "Konfiguriert" : "Configured") : (locale === "de" ? "Fehlt" : "Missing"),
      tone: openRouterCredentialStatus.configured ? "ready" : "error",
    },
    {
      id: "github",
      label: "GitHub",
      value: truthSnapshot.github.connectionLabel,
      tone: toneFromStatusText(truthSnapshot.github.connectionLabel),
    },
    {
      id: "matrix",
      label: "Matrix",
      value: truthSnapshot.matrix.connectionLabel,
      tone: toneFromStatusText(truthSnapshot.matrix.connectionLabel),
    },
  ];

  const mobileSettingsRows: MobileSettingsRowModel[] = [
    {
      id: "openrouter",
      section: "access",
      label: openRouterCopy.title,
      value: openRouterMobileStatusValue,
      detail: openRouterCopy.subtitle,
      tone: openRouterCredentialStatus.configured ? "ready" : "error",
    },
    {
      id: "github",
      section: "access",
      label: "GitHub",
      value: truthSnapshot.github.connectionLabel,
      detail: truthSnapshot.github.repositoryLabel,
      tone: toneFromStatusText(truthSnapshot.github.connectionLabel),
    },
    {
      id: "matrix",
      section: "access",
      label: "Matrix",
      value: truthSnapshot.matrix.connectionLabel,
      detail: truthSnapshot.matrix.scopeLabel,
      tone: toneFromStatusText(truthSnapshot.matrix.connectionLabel),
    },
    {
      id: "backend",
      section: "operation",
      label: "Backend",
      value: truthSnapshot.backend.label,
      detail: truthSnapshot.backend.detail,
      tone: toneFromStatusText(truthSnapshot.backend.label),
    },
    {
      id: "workmode",
      section: "operation",
      label: locale === "de" ? "Arbeitsdichte" : "Work mode",
      value: activeCopy.label,
      detail: activeCopy.description,
      tone: "muted",
    },
    {
      id: "diagnostics",
      section: "expert",
      label: ui.settings.diagnosticsCardTitle,
      value: ui.settings.diagnosticsSummary,
      detail: ui.settings.diagnosticsSafetyNote,
      tone: "muted",
    },
    {
      id: "journal",
      section: "expert",
      label: ui.settings.journalCardTitle,
      value: truthSnapshot.journal.status,
      detail: `${truthSnapshot.journal.mode} · ${truthSnapshot.journal.retention}`,
      tone: toneFromStatusText(truthSnapshot.journal.status),
    },
  ];

  const mobileSettingsSections: Array<{ id: MobileSettingsSectionId; title: string; rows: MobileSettingsRowModel[] }> = [
    {
      id: "access",
      title: locale === "de" ? "Zugänge" : "Access",
      rows: mobileSettingsRows.filter((row) => row.section === "access"),
    },
    {
      id: "operation",
      title: locale === "de" ? "Betrieb" : "Operation",
      rows: mobileSettingsRows.filter((row) => row.section === "operation"),
    },
    {
      id: "expert",
      title: locale === "de" ? "Expert Details" : "Expert details",
      rows: mobileSettingsRows.filter((row) => row.section === "expert"),
    },
  ];
  const mobileSettingsSectionTestIds: Record<MobileSettingsSectionId, string> = {
    access: "settings-mobile-section-access",
    operation: "settings-mobile-section-operation",
    expert: "settings-mobile-section-expert",
  };
  const selectedMobileSettingsRow = mobileSettingsRows.find((row) => row.id === mobileSettingsSheet) ?? null;

  function getVerificationStatusLabel(status: SettingsVerificationState["status"]) {
    return verificationCopy[status];
  }

  function getVerificationTone(status: SettingsVerificationState["status"]) {
    if (status === "passed") {
      return "ready";
    }

    if (status === "failed") {
      return "error";
    }

    return "partial";
  }

  function renderOpenRouterCredentialForm({
    prefix,
    className = "settings-inline-form",
    inputLabel = openRouterCopy.inputLabel,
    showMessage = false,
  }: {
    prefix: "openrouter" | "mobile-openrouter";
    className?: string;
    inputLabel?: string;
    showMessage?: boolean;
  }) {
    const validationId = `${prefix}-validation`;

    return (
      <form
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          onSaveOpenRouterCredentials();
        }}
      >
        <label htmlFor={`${prefix}-api-key-input`}>{openRouterCopy.keyLabel}</label>
        <input
          id={`${prefix}-api-key-input`}
          data-testid={`${prefix}-api-key-input`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={openRouterApiKeyInput}
          onChange={(event) => onOpenRouterApiKeyInputChange(event.target.value)}
          placeholder={openRouterCopy.keyPlaceholder}
          aria-describedby={validationId}
        />
        <label htmlFor={`${prefix}-model-input`}>{inputLabel}</label>
        <div className="settings-inline-controls">
          <input
            id={`${prefix}-model-input`}
            data-testid={`${prefix}-model-input`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={openRouterModelInput}
            onChange={(event) => onOpenRouterModelInputChange(event.target.value)}
            placeholder={openRouterCopy.placeholder}
            aria-describedby={validationId}
          />
          <button
            type="submit"
            data-testid={`${prefix}-credentials-save`}
            disabled={isSavingOpenRouterCredentials || openRouterControlsDisabled}
          >
            {isSavingOpenRouterCredentials ? openRouterCopy.saving : openRouterCopy.save}
          </button>
          <button
            type="button"
            className="secondary-button"
            data-testid={`${prefix}-credentials-test`}
            onClick={onTestOpenRouterCredentials}
            disabled={isTestingOpenRouterCredentials || openRouterControlsDisabled}
          >
            {isTestingOpenRouterCredentials ? openRouterCopy.testing : openRouterCopy.test}
          </button>
        </div>
        <p id={validationId} className="settings-openrouter-validation" data-testid={`${prefix}-validation`}>
          {openRouterCopy.validation}
        </p>
        {showMessage && openRouterCredentialMessage ? (
          <p className={`status-pill status-${openRouterMessageTone}`} data-testid={`${prefix}-message`}>
            {openRouterCredentialMessage}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <section className="workspace-panel settings-workspace" data-testid="settings-workspace">
      <section className="settings-mobile-panel mobile-panel-scroll" aria-label={locale === "de" ? "Mobile Einstellungen" : "Mobile settings"}>
        <header className="settings-mobile-summary" data-testid="settings-mobile-truth-snapshot">
          <span className="mobile-mono">SETTINGS</span>
          <strong>{locale === "de" ? "Authority Control Center" : "Authority Control Center"}</strong>
          <p>{locale === "de" ? "Backend-bestätigte Wahrheit, sichere Zugänge und Expert-Diagnostik ohne Credential-Werte." : "Backend-proven truth, safe access controls, and expert diagnostics without credential values."}</p>
          <div className="settings-mobile-truth-grid" aria-label={locale === "de" ? "Systemstatus" : "System status"}>
            {mobileTruthItems.map((item) => (
              <div className={`settings-mobile-truth-item settings-mobile-truth-item-${item.tone}`} key={item.id}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </header>

        {mobileSettingsSections.map((section) => (
          <section className="settings-mobile-section" data-testid={mobileSettingsSectionTestIds[section.id]} key={section.id}>
            <header className="settings-mobile-section-header">
              <span className="mobile-mono">{section.title}</span>
            </header>
            <div className="settings-mobile-row-list">
              {section.rows.map((row) => (
                <SettingsRow
                  key={row.id}
                  label={row.label}
                  value={row.value}
                  detail={row.detail}
                  tone={row.tone}
                  testId={`settings-mobile-row-${row.id}`}
                  action={() => setMobileSettingsSheet(row.id)}
                />
              ))}
            </div>
          </section>
        ))}

        <BottomSheet
          open={Boolean(selectedMobileSettingsRow)}
          title={selectedMobileSettingsRow?.label ?? ui.settings.title}
          onDismiss={() => setMobileSettingsSheet(null)}
          maxHeight="large"
        >
          <div className="settings-mobile-sheet-body" data-testid="settings-mobile-sheet-body">
            <span className={`status-pill status-${selectedMobileSettingsRow?.tone === "error" ? "error" : selectedMobileSettingsRow?.tone === "ready" ? "ready" : "partial"}`}>
              {selectedMobileSettingsRow?.value}
            </span>
            <strong>{selectedMobileSettingsRow?.label}</strong>
            <p>{selectedMobileSettingsRow?.detail}</p>
            <p className="muted-copy">
              {locale === "de"
                ? "Aktionen bleiben backend-owned. Der Browser zeigt nur Status, Intent und sichere Zusammenfassungen."
                : "Actions stay backend-owned. The browser only shows status, intent, and safe summaries."}
            </p>
            {selectedMobileSettingsRow?.id === "openrouter" ? (
              <details className="settings-mobile-dropdown" data-testid="mobile-openrouter-dropdown" open>
                <summary>{locale === "de" ? "Key und Modell-ID eingeben" : "Enter key and model ID"}</summary>
                <p className="muted-copy">
                  {locale === "de"
                    ? "Der Backend-Contract speichert API-Key und Modell-ID. Der öffentliche Alias bleibt backend-owned."
                    : "The backend contract stores API key and model ID. The public alias stays backend-owned."}
                </p>
                {renderOpenRouterCredentialForm({
                  prefix: "mobile-openrouter",
                  className: "settings-inline-form settings-mobile-openrouter-form",
                  showMessage: true,
                })}
              </details>
            ) : null}
          </div>
        </BottomSheet>
      </section>

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

          <GovernanceSpine
            active={loginAdapters.some((adapter) => getIntegrationNodeStatus(adapter.status) === "connected")}
            blocked={loginAdapters.some((adapter) => getIntegrationNodeStatus(adapter.status) === "blocked")}
            className="settings-access-spine"
          >
            <div className="settings-adapter-list">
              {loginAdapters.map((adapter) => {
                const nodeStatus = getIntegrationNodeStatus(adapter.status);
                const flowState = getIntegrationFlowState(adapter.status);

                return (
              <SystemLayerFrame
                key={adapter.id}
                layer="execution"
                active={isActiveNodeStatus(nodeStatus)}
                className={`settings-adapter-row settings-adapter-row-${adapter.status}`}
                data-testid={`settings-adapter-${adapter.id}`}
              >
                <div className="settings-adapter-main">
                  <div>
                    <span className={`status-pill status-${adapter.status === "connected" ? "ready" : adapter.status === "error" || adapter.status === "missing_server_config" || adapter.status === "auth_expired" || adapter.status === "scope_denied" || adapter.status === "upstream_unreachable" ? "error" : "partial"}`}>
                      {adapterCopy.status[adapter.status]}
                    </span>
                    <div className="settings-adapter-title-stack">
                      <h2>{adapter.label}</h2>
                      <SystemNode
                        label={adapter.label}
                        kind={adapter.id}
                        status={nodeStatus}
                      >
                        {adapterCopy.status[adapter.status]}
                      </SystemNode>
                    </div>
                  </div>
                  <p className="muted-copy">{adapter.safeIdentityLabel}</p>
                  <p>{adapter.scopeSummary}</p>
                </div>

                <div className="settings-adapter-actions">
                  <FlowIndicator
                    state={flowState}
                    direction="horizontal"
                    label={`${adapter.label} action path`}
                    className="settings-adapter-flow"
                  />
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
              </SystemLayerFrame>
                );
              })}
            </div>
          </GovernanceSpine>
        </article>

        <article className="workspace-card settings-verification-card">
          <header className="card-header">
            <div>
              <span>{verificationCopy.title}</span>
              <strong>{ui.settings.backendTruth}</strong>
            </div>
          </header>
          <p className="muted-copy">{verificationCopy.subtitle}</p>
          <div className="settings-verification-list">
            {verificationTargets.map((target) => {
              const result = verificationResults[target.id];
              const tone = getVerificationTone(result.status);

              return (
                <div className="settings-verification-row" data-testid={`settings-verification-${target.id}`} key={target.id}>
                  <div>
                    <span className={`status-pill status-${tone}`}>{getVerificationStatusLabel(result.status)}</span>
                    <strong>{target.label}</strong>
                    <p>{result.detail || verificationCopy.idle}</p>
                    {result.checkedAt ? (
                      <span className="settings-verification-timestamp">
                        {verificationCopy.checkedAt}: {result.checkedAt}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    data-testid={`settings-verification-${target.id}-action`}
                    onClick={() => onVerifyConnection(target.id)}
                    disabled={result.status === "checking"}
                  >
                    {result.status === "checking" ? verificationCopy.checking : verificationCopy.action}
                  </button>
                </div>
              );
            })}
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

        <SystemLayerFrame
          layer="execution"
          active={openRouterCredentialStatus.configured}
          className="workspace-card openrouter-model-card"
        >
          <header className="card-header">
            <div>
              <span>{openRouterCopy.title}</span>
              <strong>{ui.settings.backendPolicy}</strong>
            </div>
          </header>
          <SystemNode
            label="OpenRouter"
            kind="openrouter"
            status={openRouterCredentialStatus.configured ? "connected" : "disconnected"}
          >
            {openRouterCredentialStatus.configured ? openRouterCopy.configured : truthSnapshot.models.registrySourceLabel}
          </SystemNode>
          <p className="muted-copy">{openRouterCopy.subtitle}</p>
          {openRouterCredentialMessage ? (
            <p className="status-pill status-ready">{openRouterCredentialMessage}</p>
          ) : null}
          {renderOpenRouterCredentialForm({ prefix: "openrouter" })}
          {openRouterCredentialStatus.models.length === 0 ? (
            <p className="empty-state">{openRouterCopy.empty}</p>
          ) : (
            <div className="settings-model-list">
              {openRouterCredentialStatus.models.map((model) => (
                <div key={model.alias}>
                  <span>{model.alias}</span>
                  <strong>{model.label}</strong>
                  <p>{model.source}</p>
                </div>
              ))}
            </div>
          )}
        </SystemLayerFrame>

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
