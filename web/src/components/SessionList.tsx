import type { ReactNode } from "react";
import type { SessionStatus, WorkspaceKind, WorkspaceSession } from "../lib/workspace-state.js";
import { sortSessionsByUpdatedAt, workspaceLabel } from "../lib/workspace-state.js";

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

function statusCopy(status: SessionStatus) {
  switch (status) {
    case "in_progress":
      return "In Arbeit";
    case "review_required":
      return "Review nötig";
    case "done":
      return "Fertig";
    case "failed":
      return "Fehler";
    default:
      return "Entwurf";
  }
}

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

function formatRelativeTime(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime();

  if (!Number.isFinite(timestamp)) {
    return isoTimestamp;
  }

  const deltaMinutes = Math.round((Date.now() - timestamp) / 60000);

  if (Math.abs(deltaMinutes) < 1) {
    return "gerade eben";
  }

  if (Math.abs(deltaMinutes) < 60) {
    return deltaMinutes > 0 ? `vor ${deltaMinutes}m` : `in ${Math.abs(deltaMinutes)}m`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (Math.abs(deltaHours) < 24) {
    return deltaHours > 0 ? `vor ${deltaHours}h` : `in ${Math.abs(deltaHours)}h`;
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (Math.abs(deltaDays) < 7) {
    return deltaDays > 0 ? `vor ${deltaDays}d` : `in ${Math.abs(deltaDays)}d`;
  }

  return new Intl.DateTimeFormat(undefined, {
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
  const sortedSessions = sortSessionsByUpdatedAt(sessions);
  const workspaceName = workspaceLabel(workspace);

  return (
    <section
      className="session-list-card"
      data-testid="workspace-session-list"
      aria-label={`${workspaceName} session list`}
    >
      <header className="session-list-header">
        <div>
          <span>{workspaceName} Sessions</span>
          <strong>{sortedSessions.length} insgesamt</strong>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onCreate}
          data-testid="workspace-create-session"
        >
          Neue Session
        </button>
      </header>

      {headerNote ? <div className="session-list-note">{headerNote}</div> : null}

      <div className="session-list-items" aria-live="polite" aria-relevant="additions text">
        {sortedSessions.length === 0 ? (
          <p className="empty-state" role="status">
            Noch keine Sessions.
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
                      <span className={`session-status-badge session-status-${statusTone(session.status)}`}>
                        {statusCopy(session.status)}
                      </span>
                    </div>
                    <span className="session-list-subtitle">
                      {session.archived ? "Archiviert" : "Aktiv"}
                    </span>
                  </div>
                  <small className="session-list-meta">
                    Aktualisiert {formatRelativeTime(session.updatedAt)} · {session.lastOpenedAt === session.updatedAt ? "gerade geöffnet" : `zuletzt geöffnet ${formatRelativeTime(session.lastOpenedAt)}`}
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
                    Archivieren
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDelete(session.id)}
                    data-testid={`workspace-session-delete-${session.id}`}
                  >
                    Löschen
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
