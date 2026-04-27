import React, { type ReactNode } from "react";
import { getSessionStatusLabel, useLocalization, type Locale, type WorkspaceMode } from "../lib/localization.js";
import type { WorkspaceKind, WorkspaceSession } from "../lib/workspace-state.js";
import { SessionList } from "./SessionList.js";
import { MutedSystemCopy, SectionLabel, ShellCard, StatusBadge, type BadgeTone } from "./ShellPrimitives.js";

type SidebarProps = {
  locale: Locale;
  workspaceModes: WorkspaceMode[];
  activeMode: WorkspaceMode;
  onWorkspaceSelect: (mode: WorkspaceMode) => void;
  workspaceName: string;
  activeSession: WorkspaceSession<unknown> | null;
  sessionStatusTone: BadgeTone;
  expertMode: boolean;
  onExpertModeChange: (value: boolean) => void;
  accountTone: BadgeTone;
  accountLabel: string;
  accountError: string | null;
  sessionWorkspace: WorkspaceKind;
  sessionWorkspaceSessions: WorkspaceSession<unknown>[];
  sessionWorkspaceActiveId: string;
  onSessionCreate: () => void;
  onSessionSelect: (sessionId: string) => void;
  onSessionArchive: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  sessionHeaderNote: ReactNode;
};

function WorkspaceIcon({ mode }: { mode: WorkspaceMode }) {
  switch (mode) {
    case "github":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6.75A2.75 2.75 0 0 1 8.75 4H15l3 3v10.25A2.75 2.75 0 0 1 15.25 20H8.75A2.75 2.75 0 0 1 6 17.25V6.75Z" />
          <path d="M15 4v3h3" />
          <path d="M8.5 11.25h7" />
          <path d="M8.5 14.5h7" />
        </svg>
      );
    case "matrix":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "review":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5v11A1.5 1.5 0 0 1 16.5 18H10l-4 4v-3.5A1.5 1.5 0 0 1 4.5 17V5.5Z" />
          <path d="M8 8.5h8" />
          <path d="M8 11.5h8" />
          <path d="M8 14.5h5" />
        </svg>
      );
    case "routing":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 7h5" />
          <path d="M14 7h5" />
          <path d="M10 7a2 2 0 1 0 4 0a2 2 0 0 0-4 0Z" />
          <path d="M5 17h5" />
          <path d="M14 17h5" />
          <path d="M10 17a2 2 0 1 0 4 0a2 2 0 0 0-4 0Z" />
          <path d="M12 9v6" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 8.5A3.5 3.5 0 1 1 12 15.5A3.5 3.5 0 0 1 12 8.5Z" />
          <path d="M4.5 12a7.5 7.5 0 0 1 .2-1.7l2-.4a6.7 6.7 0 0 1 .8-1.3l-1.2-1.7a8 8 0 0 1 2.4-2.4l1.7 1.2c.4-.3.9-.6 1.3-.8l.4-2A7.5 7.5 0 0 1 12 4.5c.6 0 1.1.1 1.7.2l.4 2c.5.2 1 .5 1.3.8l1.7-1.2a8 8 0 0 1 2.4 2.4l-1.2 1.7c.3.4.6.9.8 1.3l2 .4a7.5 7.5 0 0 1 0 3.4l-2 .4c-.2.5-.5 1-.8 1.3l1.2 1.7a8 8 0 0 1-2.4 2.4l-1.7-1.2c-.4.3-.9.6-1.3.8l-.4 2a7.5 7.5 0 0 1-3.4 0l-.4-2c-.5-.2-1-.5-1.3-.8l-1.7 1.2a8 8 0 0 1-2.4-2.4l1.2-1.7c-.3-.4-.6-.9-.8-1.3l-2-.4A7.5 7.5 0 0 1 4.5 12Z" />
        </svg>
      );
    case "chat":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H9l-4 4v-4.5A2.5 2.5 0 0 1 5 13V6.5Z" />
          <path d="M8 8.5h8" />
          <path d="M8 11.5h5.5" />
        </svg>
      );
  }
}

function BeginnerExpertToggle({
  expertMode,
  setExpertMode,
}: {
  expertMode: boolean;
  setExpertMode: (value: boolean) => void;
}) {
  const { copy: ui } = useLocalization();

  return (
    <div className="mode-toggle" role="group" aria-label={`${ui.settings.beginner} / ${ui.settings.expert}`}>
      <button
        type="button"
        className={expertMode ? "mode-toggle-button" : "mode-toggle-button mode-toggle-button-active"}
        onClick={() => setExpertMode(false)}
        aria-pressed={!expertMode}
      >
        {ui.settings.beginner}
      </button>
      <button
        type="button"
        className={expertMode ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
        onClick={() => setExpertMode(true)}
        aria-pressed={expertMode}
      >
        {ui.settings.expert}
      </button>
    </div>
  );
}

export function Sidebar({
  locale,
  workspaceModes,
  activeMode,
  onWorkspaceSelect,
  workspaceName,
  activeSession,
  sessionStatusTone,
  expertMode,
  onExpertModeChange,
  accountTone,
  accountLabel,
  accountError,
  sessionWorkspace,
  sessionWorkspaceSessions,
  sessionWorkspaceActiveId,
  onSessionCreate,
  onSessionSelect,
  onSessionArchive,
  onSessionDelete,
  sessionHeaderNote,
}: SidebarProps) {
  const { copy: ui } = useLocalization();

  return (
    <aside className="workspace-sidebar shell-left-rail">
      <ShellCard variant="rail" className="shell-left-brand">
        <p className="app-kicker">{ui.shell.workspaceConsoleKicker}</p>
        <strong>{ui.shell.workspaceConsoleTitle}</strong>
        <MutedSystemCopy>{ui.shell.workspaceConsoleNote}</MutedSystemCopy>
      </ShellCard>

      <ShellCard variant="rail" className="shell-nav-card">
        <SectionLabel>{ui.shell.workspacesLabel}</SectionLabel>
        <nav className="sidebar-nav" aria-label={ui.shell.workspacesLabel}>
          {workspaceModes.map((workspaceMode) => (
            <button
              key={workspaceMode}
              type="button"
              className={activeMode === workspaceMode ? "workspace-tab workspace-tab-active workspace-tab-vertical workspace-tab-shell-active" : "workspace-tab workspace-tab-vertical"}
              onClick={() => onWorkspaceSelect(workspaceMode)}
              aria-current={activeMode === workspaceMode ? "page" : undefined}
              data-testid={`tab-${workspaceMode}`}
            >
              <WorkspaceIcon mode={workspaceMode} />
              <span>
                <strong>{ui.shell.workspaceTabs[workspaceMode].label}</strong>
                <small>{ui.shell.workspaceTabs[workspaceMode].description}</small>
              </span>
            </button>
          ))}
        </nav>
      </ShellCard>

      <ShellCard variant="muted" className="shell-session-identity-card">
        <SectionLabel>{ui.shell.sessionLabel}</SectionLabel>
        <strong>{activeSession?.title ?? ui.shell.noActiveSession}</strong>
        <MutedSystemCopy>{workspaceName}</MutedSystemCopy>
        <div className="shell-session-meta">
          <StatusBadge tone={sessionStatusTone}>{getSessionStatusLabel(locale, activeSession?.status ?? "draft")}</StatusBadge>
          {activeSession?.archived ? <StatusBadge tone="muted">{ui.shell.archivedBadge}</StatusBadge> : null}
        </div>
        {expertMode && activeSession?.id ? (
          <MutedSystemCopy className="shell-session-id">{ui.shell.sessionIdPrefix}: {activeSession.id}</MutedSystemCopy>
        ) : null}

        <div className="shell-disclosure-control">
          <SectionLabel>{ui.shell.disclosureLabel}</SectionLabel>
          <BeginnerExpertToggle expertMode={expertMode} setExpertMode={onExpertModeChange} />
        </div>

        <div className="shell-account-block">
          <SectionLabel>{ui.shell.accountLabel}</SectionLabel>
          <div className="shell-account-row">
            <StatusBadge tone={accountTone}>{accountLabel}</StatusBadge>
          </div>
          {accountError ? <MutedSystemCopy>{accountError}</MutedSystemCopy> : null}
        </div>
      </ShellCard>

      <SessionList
        workspace={sessionWorkspace}
        sessions={sessionWorkspaceSessions}
        activeSessionId={sessionWorkspaceActiveId}
        onCreate={onSessionCreate}
        onSelect={onSessionSelect}
        onArchive={onSessionArchive}
        onDelete={onSessionDelete}
        headerNote={sessionHeaderNote}
      />
    </aside>
  );
}
