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
      return "In progress";
    case "review_required":
      return "Review needed";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Draft";
  }
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

  return (
    <section className="session-list-card" data-testid="workspace-session-list">
      <header className="session-list-header">
        <div>
          <span>{workspaceLabel(workspace)} sessions</span>
          <strong>{sortedSessions.length} total</strong>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onCreate}
          data-testid="workspace-create-session"
        >
          New session
        </button>
      </header>

      {headerNote ? <div className="session-list-note">{headerNote}</div> : null}

      <div className="session-list-items">
        {sortedSessions.length === 0 ? (
          <p className="empty-state">No sessions yet.</p>
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
                  className="session-list-select"
                  onClick={() => onSelect(session.id)}
                  data-testid={`workspace-session-select-${session.id}`}
                >
                  <div className="session-list-copy">
                    <strong>{session.title}</strong>
                    <span>{statusCopy(session.status)}</span>
                  </div>
                  <small>
                    {session.archived ? "Archived" : "Active"} · Updated {session.updatedAt}
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
                    Archive
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDelete(session.id)}
                    data-testid={`workspace-session-delete-${session.id}`}
                  >
                    Delete
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

