import React from "react";

export function MatrixSkeleton() {
  return (
    <section className="matrix-mobile-skeleton" role="status" aria-label="Loading Matrix knowledge surface">
      <div className="matrix-mobile-skeleton-header" />
      <div className="matrix-mobile-skeleton-grid">
        <div className="matrix-mobile-skeleton-list">
          <span />
          <span />
          <span />
        </div>
        <div className="matrix-mobile-skeleton-topics">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
