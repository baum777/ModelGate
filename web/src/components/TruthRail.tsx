import React, { type ReactNode } from "react";
import { getSessionStatusLabel, useLocalization, type Locale } from "../lib/localization.js";
import type { WorkspaceSession } from "../lib/workspace-state.js";
import { DiagnosticsDrawer, type DiagnosticsDetailRow } from "./ExpertDetails.js";
import { MutedSystemCopy, StatusBadge, TruthRailSection, type BadgeTone } from "./ShellPrimitives.js";
import type { StatusPanelRow } from "./StatusPanel.js";

type HealthState = {
  label: string;
  detail: string;
  tone: BadgeTone;
};

type ApprovalSummary = {
  hasApprovals: boolean;
  pending: number;
  stale: number;
  chatPending: number;
};

type TruthRailProps = {
  locale: Locale;
  expertMode: boolean;
  healthState: HealthState;
  workspaceName: string;
  activeModelAlias: string | null;
  activeSession: WorkspaceSession<unknown> | null;
  statusTone: BadgeTone;
  currentStatusBadge: string;
  approvalSummary: ApprovalSummary;
  workspaceContextTitle: string;
  currentRows: StatusPanelRow[];
  currentHelperText: string;
  diagnosticsAccessible: boolean;
  diagnosticsOpen: boolean;
  diagnosticsTitle: string;
  diagnosticsRows: DiagnosticsDetailRow[];
  diagnosticsChildren: ReactNode;
  onActivateExpert: () => void;
  onDiagnosticsToggle: (open: boolean) => void;
};

export function TruthRail({
  locale,
  expertMode,
  healthState,
  workspaceName,
  activeModelAlias,
  activeSession,
  statusTone,
  currentStatusBadge,
  approvalSummary,
  workspaceContextTitle,
  currentRows,
  currentHelperText,
  diagnosticsAccessible,
  diagnosticsOpen,
  diagnosticsTitle,
  diagnosticsRows,
  diagnosticsChildren,
  onActivateExpert,
  onDiagnosticsToggle,
}: TruthRailProps) {
  const { copy: ui } = useLocalization();

  return (
    <aside className="workspace-context truth-rail">
      <TruthRailSection
        title={ui.shell.healthTitle}
        testId="truth-rail-health"
        badge={<StatusBadge tone={healthState.tone}>{healthState.label}</StatusBadge>}
      >
        <MutedSystemCopy>{healthState.detail}</MutedSystemCopy>
        {expertMode ? (
          <div className="truth-rail-pairs">
            <div>
              <span>{ui.shell.modeLabel}</span>
              <strong>{workspaceName}</strong>
            </div>
            <div>
              <span>{ui.shell.publicAliasLabel}</span>
              <strong>{activeModelAlias ?? ui.common.na}</strong>
            </div>
          </div>
        ) : null}
      </TruthRailSection>

      <TruthRailSection
        title={ui.shell.sessionLabel}
        testId="truth-rail-session"
        badge={<StatusBadge tone={statusTone}>{getSessionStatusLabel(locale, activeSession?.status ?? "draft")}</StatusBadge>}
      >
        <p className="truth-rail-keyline">{activeSession?.title ?? ui.shell.noActiveSession}</p>
        <MutedSystemCopy>
          {ui.shell.workspacesLabel}: {workspaceName}
          {activeSession?.updatedAt ? ` · ${ui.sessionList.updated} ${new Date(activeSession.updatedAt).toLocaleString()}` : ""}
        </MutedSystemCopy>
        {expertMode && activeSession?.id ? <MutedSystemCopy>{ui.shell.sessionIdPrefix}: {activeSession.id}</MutedSystemCopy> : null}
      </TruthRailSection>

      {approvalSummary.hasApprovals ? (
        <TruthRailSection
          title={ui.shell.pendingApprovalsTitle}
          testId="truth-rail-approvals"
          badge={<StatusBadge tone={approvalSummary.stale > 0 ? "error" : "partial"}>{approvalSummary.pending}</StatusBadge>}
        >
          <p className="truth-rail-keyline">
            {ui.shell.pendingApprovalsSummary(approvalSummary.pending, approvalSummary.stale)}
          </p>
          <MutedSystemCopy>
            {approvalSummary.chatPending > 0 ? ui.shell.pendingApprovalsChat : ui.shell.pendingApprovalsSeparate}
          </MutedSystemCopy>
        </TruthRailSection>
      ) : null}

      <TruthRailSection
        title={workspaceContextTitle}
        testId="truth-rail-workspace-context"
        badge={<StatusBadge tone={statusTone}>{currentStatusBadge}</StatusBadge>}
      >
        <div className="truth-rail-pairs">
          {currentRows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
        <MutedSystemCopy>{currentHelperText}</MutedSystemCopy>
      </TruthRailSection>

      <TruthRailSection title={ui.shell.diagnosticsLabel} testId="truth-rail-diagnostics">
        <MutedSystemCopy>
          {diagnosticsAccessible ? ui.shell.diagnosticsAvailable : ui.shell.diagnosticsHidden}
        </MutedSystemCopy>
        {!diagnosticsAccessible ? (
          <button type="button" className="secondary-button" onClick={onActivateExpert}>
            {ui.shell.activateExpert}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onDiagnosticsToggle(!diagnosticsOpen)}
          >
            {diagnosticsOpen ? ui.shell.diagnosticsHide : ui.shell.diagnosticsShow}
          </button>
        )}

        <DiagnosticsDrawer
          expertMode={diagnosticsAccessible}
          title={diagnosticsTitle}
          rows={diagnosticsRows}
          className="shell-diagnostics-drawer"
          open={diagnosticsOpen}
          onToggle={onDiagnosticsToggle}
        >
          {diagnosticsChildren}
        </DiagnosticsDrawer>
      </TruthRailSection>
    </aside>
  );
}
