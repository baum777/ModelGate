import React, { type ReactNode } from "react";
import type { SessionStatus, WorkspaceKind, WorkspaceSession } from "../lib/workspace-state.js";
import { sortSessionsByUpdatedAt, workspaceLabel } from "../lib/workspace-state.js";
import { SectionLabel, StatusBadge } from "./ShellPrimitives.js";
import { getSessionStatusLabel, useLocalization } from "../lib/localization.js";

export type SessionListItemProps<TMetadata> = {
  session: WorkspaceSession<TMetadata>;
  active: boolean;
  onSelect: (sessionId: string) => void;
  onArchive: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
};

type SessionListProps<TMetadata> = {
  workspace: WorkspaceKind;
  sessions: WorkspaceSession<TMetadata>[];
  activeSessionId: string;
  onCreate: () => void;
  onSelect: (sessionId: string) => void;
  onArchive: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  headerNote?: ReactNode;
};

function statusTone(status: SessionStatus) {
  switch (status) {
    case "in_progress":
      return "partial";
    case "review_required":
      return "partial";
    case "done":
      return "ready";
    case "failed":
      return "error";
    default:
      return "partial";
  }
}

function formatRelativeTime(locale: "en" | "de", isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime();

  if (!Number.isFinite(timestamp)) {
    return isoTimestamp;
  }

  const deltaMinutes = Math.round((Date.now() - timestamp) / 60000);

  if (Math.abs(deltaMinutes) < 1) {
    return locale === "de" ? "gerade eben" : "just now";
  }

  if (Math.abs(deltaMinutes) < 60) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (Math.abs(deltaHours) < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (Math.abs(deltaDays) < 7) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-deltaDays, "day");
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTimestamp));
}

export function SessionList<TMetadata>({
  workspace,
  sessions,
  activeSessionId,
  onCreate,
  onSelect,
  onArchive,
  onDelete,
  headerNote
}: SessionListProps<TMetadata>) {
  const { locale, copy: ui } = useLocalization();
  const sortedSessions = sortSessionsByUpdatedAt(sessions);
  const workspaceName = workspaceLabel(workspace);

  return (
    <section
      className="session-list-card"
      data-testid="workspace-session-list"
      aria-label={`${workspaceName} ${ui.sessionList.newSession}`}
    >
      <header className="session-list-header">
        <div>
          <SectionLabel>{workspaceName} {locale === "de" ? "Sessions" : "sessions"}</SectionLabel>
          <strong>{ui.sessionList.headerCount(sortedSessions.length)}</strong>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onCreate}
          data-testid="workspace-create-session"
        >
          {ui.sessionList.newSession}
        </button>
      </header>

      {headerNote ? <div className="session-list-note">{headerNote}</div> : null}

      <div className="session-list-items" aria-live="polite" aria-relevant="additions text">
        {sortedSessions.length === 0 ? (
          <p className="empty-state" role="status">
            {ui.sessionList.noSessions}
          </p>
        ) : (
          sortedSessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <article
                key={session.id}
                className={`session-list-item ${active ? "session-list-item-active" : ""} ${session.archived ? "session-list-item-archived" : ""}`}
                data-testid={`workspace-session-item-${session.id}`}
              >
                <button
                  type="button"
                  className={`session-list-select ${active ? "session-list-select-active" : ""}`}
                  onClick={() => onSelect(session.id)}
                  data-testid={`workspace-session-select-${session.id}`}
                  aria-current={active ? "page" : undefined}
                >
                  <div className="session-list-copy">
                    <div className="session-list-title-row">
                      <strong>{session.title}</strong>
                    <StatusBadge
                      tone={statusTone(session.status)}
                      className={`session-status-badge session-status-${statusTone(session.status)}`}
                    >
                        {getSessionStatusLabel(locale, session.status)}
                    </StatusBadge>
                  </div>
                  <span className="session-list-subtitle">
                      {session.archived ? ui.sessionList.archived : ui.sessionList.active}
                  </span>
                </div>
                <small className="session-list-meta">
                    {ui.sessionList.updated} {formatRelativeTime(locale, session.updatedAt)} · {session.lastOpenedAt === session.updatedAt ? ui.sessionList.openedJustNow : ui.sessionList.openedRecently(formatRelativeTime(locale, session.lastOpenedAt))}
                </small>
              </button>

                <div className="session-list-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onArchive(session.id)}
                    disabled={session.archived}
                    data-testid={`workspace-session-archive-${session.id}`}
                  >
                    {ui.sessionList.archive}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDelete(session.id)}
                    data-testid={`workspace-session-delete-${session.id}`}
                  >
                    {ui.sessionList.delete}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
