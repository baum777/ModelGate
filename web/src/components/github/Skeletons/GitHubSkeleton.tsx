import React from "react";

export function GitHubSkeleton() {
  return (
    <section className="github-mobile-skeleton" role="status" aria-label="Loading GitHub review surface">
      <div className="github-mobile-skeleton-header" />
      <div className="github-mobile-skeleton-grid">
        <div className="github-mobile-skeleton-list">
          <span />
          <span />
          <span />
        </div>
        <div className="github-mobile-skeleton-diff">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
