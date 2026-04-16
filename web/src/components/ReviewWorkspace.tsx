import { StatusPanel } from "./StatusPanel.js";

export type ReviewItemStatus = "pending_review" | "approved" | "rejected" | "stale" | "executed";

export type ReviewItem = {
  id: string;
  source: "github" | "matrix";
  title: string;
  summary: string;
  status: ReviewItemStatus;
  stale?: boolean;
  sourceLabel?: string;
};

type ReviewWorkspaceProps = {
  items: ReviewItem[];
  expertMode: boolean;
};

function statusLabel(status: ReviewItemStatus) {
  switch (status) {
    case "approved":
      return "Freigegeben";
    case "rejected":
      return "Abgelehnt";
    case "stale":
      return "Veraltet";
    case "executed":
      return "Ausgeführt";
    default:
      return "Wartet auf Freigabe";
  }
}

export function ReviewWorkspace({ items, expertMode }: ReviewWorkspaceProps) {
  const countLabel =
    items.length === 0
      ? "Keine offenen Prüfungen"
      : items.length === 1
        ? "Eine offene Prüfung"
        : `${items.length} offene Prüfungen`;

  return (
    <section className="workspace-panel review-workspace" data-testid="review-workspace">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">Review</p>
          <h1>Review</h1>
          <p className="hero-copy">
            Vorschläge sammeln, prüfen und freigeben. Ausführung bleibt im Backend.
          </p>
        </div>
      </section>

      <StatusPanel
        title="Reviewstatus"
        headline={countLabel}
        badge={items.length === 0 ? "Leer" : "Aktiv"}
        badgeTone={items.length === 0 ? "partial" : "ready"}
        rows={[
          { label: "Offen", value: String(items.length) },
          { label: "Stand", value: items.length === 0 ? "Noch nichts vorbereitet" : statusLabel(items[0]?.status ?? "pending_review") },
          { label: "Freigabe", value: items.some((item) => item.status === "pending_review") ? "Erforderlich" : "Nicht erforderlich" },
          { label: "Ausführung", value: items.some((item) => item.status === "stale") ? "Blockiert" : "Nicht gestartet" },
        ]}
        safetyTitle="Sicherheit"
        safetyText="Freigaben laufen nur hier. Veraltete Vorschläge werden nicht ausgeführt."
        expertMode={expertMode}
        expertRows={[
          { label: "Runtime event trail", value: items.map((item) => `${item.source}:${item.id}`).join(" · ") || "n/a" },
          { label: "Backend route status", value: items.length === 0 ? "keine offenen Routen" : "offene Vorschläge vorhanden" },
        ]}
      />

      {items.length === 0 ? (
        <article className="empty-state-card">
          <div className="empty-state-card-copy">
            <p className="info-label">Review</p>
            <h2>Noch keine offenen Prüfungen.</h2>
            <p>
              Wenn Chat, GitHub oder Matrix einen Vorschlag vorbereitet, erscheint er hier zur Freigabe.
            </p>
          </div>
        </article>
      ) : (
        <div className="review-list">
          {items.map((item) => (
            <article key={item.id} className="workspace-card review-item-card">
              <header className="card-header">
                <div>
                  <span>{item.sourceLabel ?? (item.source === "github" ? "GitHub Workspace" : "Matrix Workspace")}</span>
                  <strong>{item.title}</strong>
                </div>
                <span className={`status-pill ${item.status === "stale" ? "status-error" : item.status === "approved" || item.status === "executed" ? "status-ready" : "status-partial"}`}>
                  {statusLabel(item.status)}
                </span>
              </header>
              <p>{item.summary}</p>
              {item.stale ? <p className="warning-banner" role="status">Dieser Vorschlag ist veraltet und muss neu geprüft werden.</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
