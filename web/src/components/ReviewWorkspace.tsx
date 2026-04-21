import React from "react";
import {
  ApprovalTransitionCard,
  ExecutionReceiptCard,
  ProposalCard,
} from "./ApprovalPrimitives.js";
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
  provenanceRows?: Array<{
    label: string;
    value: string;
  }>;
};

type ReviewWorkspaceProps = {
  items: ReviewItem[];
  expertMode: boolean;
};

const REVIEW_STATUS_PRIORITY: Record<ReviewItemStatus, number> = {
  stale: 0,
  pending_review: 1,
  approved: 2,
  executed: 3,
  rejected: 4,
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

export function prioritizeReviewItems(items: ReviewItem[]) {
  return items.slice().sort((left, right) => {
    const priorityDelta = REVIEW_STATUS_PRIORITY[left.status] - REVIEW_STATUS_PRIORITY[right.status];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const sourceDelta = left.source.localeCompare(right.source);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

export function describeReviewNextStep(items: ReviewItem[]) {
  if (items.length === 0) {
    return "Keine offenen Prüfungen";
  }

  if (items.some((item) => item.status === "stale")) {
    return "Veraltete Prüfung erneuern";
  }

  if (items.some((item) => item.status === "pending_review")) {
    return "Freigabe prüfen";
  }

  if (items.some((item) => item.status === "approved")) {
    return "Ausführung beobachten";
  }

  if (items.some((item) => item.status === "executed")) {
    return "Erledigte Ausführungen prüfen";
  }

  return "Bereit";
}

export function ReviewWorkspace({ items, expertMode }: ReviewWorkspaceProps) {
  const prioritizedItems = prioritizeReviewItems(items);
  const primaryItem = prioritizedItems[0] ?? null;
  const countLabel =
    items.length === 0
      ? "Keine offenen Prüfungen"
      : items.length === 1
        ? "Eine offene Prüfung"
        : `${items.length} offene Prüfungen`;
  const sourceLabelFor = (item: ReviewItem) =>
    item.sourceLabel ?? (item.source === "github" ? "GitHub Workspace" : "Matrix Workspace");
  const provenanceRowsFor = (item: ReviewItem) => item.provenanceRows ?? [];
  const primaryMetadata = primaryItem
    ? [
        { label: "Quelle", value: sourceLabelFor(primaryItem) },
        { label: "Status", value: statusLabel(primaryItem.status) },
        ...provenanceRowsFor(primaryItem),
      ]
    : [];

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
        title="Offene Prüfungen"
        headline={countLabel}
        badge={items.length === 0 ? "Leer" : "Aktiv"}
        badgeTone={items.length === 0 ? "partial" : "ready"}
        rows={[
          { label: "Offen", value: String(items.length) },
          {
            label: "Nächster Schritt",
            value: describeReviewNextStep(items),
          },
          {
            label: "Priorisiert",
            value: primaryItem ? `${primaryItem.sourceLabel ?? primaryItem.source}:${primaryItem.status}` : "n/a",
          },
        ]}
        safetyTitle="Sicherheit"
        safetyText="Review bleibt read-only und fail-closed. Veraltete Vorschläge werden nicht ausgeführt."
        expertMode={expertMode}
        expertRows={[
          { label: "Laufzeitspur", value: items.map((item) => `${item.source}:${item.id}`).join(" · ") || "n/a" },
          { label: "Backend-Route", value: items.length === 0 ? "keine offenen Routen" : "offene Vorschläge vorhanden" },
          { label: "Primärer Eintrag", value: primaryItem ? `${primaryItem.source}:${primaryItem.status}` : "n/a" },
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
          {primaryItem ? (
            primaryItem.status === "executed" ? (
              <ExecutionReceiptCard
                key={primaryItem.id}
                title={primaryItem.title}
                detail={primaryItem.summary}
                outcome="executed"
                metadata={primaryMetadata}
                testId="review-primary-executed"
              />
            ) : primaryItem.status === "rejected" ? (
              <ExecutionReceiptCard
                key={primaryItem.id}
                title={primaryItem.title}
                detail={primaryItem.summary}
                outcome="rejected"
                metadata={primaryMetadata}
                testId="review-primary-rejected"
              />
            ) : primaryItem.status === "approved" ? (
              <ApprovalTransitionCard
                key={primaryItem.id}
                title={primaryItem.title}
                detail={primaryItem.summary}
                testId="review-primary-approved"
              />
            ) : (
              <ProposalCard
                key={primaryItem.id}
                testId="review-primary-proposal"
                title={primaryItem.title}
                summary={primaryItem.summary}
                consequence="Review bleibt read-only; die Entscheidung wird im Quell-Workspace getroffen."
                statusLabel={primaryItem.stale ? "Veraltete Prüfung" : "Freigabe ausstehend"}
                statusTone={primaryItem.stale ? "error" : "partial"}
                metadata={primaryMetadata}
              />
            )
          ) : null}

          <section className="workspace-card review-queue-card">
            <header className="card-header">
              <div>
                <span>Prüfungswarteschlange</span>
                <strong>Alle offenen Prüfungen</strong>
              </div>
            </header>

            <div className="review-queue-list">
              {prioritizedItems.map((item) => (
                <article key={item.id} className="review-queue-item">
                  <div className="review-queue-item-header">
                    <div>
                      <span>{sourceLabelFor(item)}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <span className={`status-pill ${item.status === "stale" ? "status-error" : item.status === "approved" || item.status === "executed" ? "status-ready" : "status-partial"}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p>{item.summary}</p>
                  {provenanceRowsFor(item).length > 0 ? (
                    <div className="review-queue-item-provenance">
                      {provenanceRowsFor(item).map((row) => (
                        <p key={`${item.id}-${row.label}`}>
                          <span>{row.label}</span>
                          <strong>{row.value}</strong>
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {item.stale ? <p className="warning-banner" role="status">Dieser Vorschlag ist veraltet und muss neu geprüft werden.</p> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
