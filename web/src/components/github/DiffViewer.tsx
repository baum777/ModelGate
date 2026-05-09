import React from "react";
import type { DiffHunk, GitHubFileNode, RiskMarker } from "./types.js";

type DiffViewerProps = {
  file: GitHubFileNode;
  hunks: DiffHunk[];
  riskMarkers: RiskMarker[];
};

function linePrefix(kind: DiffHunk["lines"][number]["kind"]) {
  switch (kind) {
    case "added":
      return "+";
    case "removed":
      return "-";
    case "context":
    default:
      return " ";
  }
}

export function DiffViewer({ file, hunks, riskMarkers }: DiffViewerProps) {
  return (
    <section className="github-mobile-diff" aria-label={`Diff preview for ${file.path}`}>
      <header className="github-mobile-diff-header">
        <div>
          <p>Diff Viewer</p>
          <h3>{file.path}</h3>
        </div>
        <span className={`github-mobile-risk-pill github-mobile-risk-${file.risk}`}>{file.risk}</span>
      </header>

      <div className="github-mobile-risk-markers" aria-label="Risk markers">
        {riskMarkers.map((marker) => (
          <article className={`github-mobile-risk-marker github-mobile-risk-marker-${marker.tone}`} key={marker.label}>
            <strong>{marker.label}</strong>
            <span>{marker.detail}</span>
          </article>
        ))}
      </div>

      <div className="github-mobile-diff-body">
        {hunks.map((hunk) => (
          <article className="github-mobile-hunk" key={hunk.header}>
            <p className="github-mobile-hunk-header">{hunk.header}</p>
            <pre>
              {hunk.lines.map((line, index) => (
                <span
                  className={`github-mobile-diff-line github-mobile-diff-line-${line.kind}`}
                  data-line-kind={line.kind}
                  key={`${hunk.header}-${index}-${line.content}`}
                >
                  <span aria-hidden="true">{linePrefix(line.kind)}</span>
                  <code>{line.content}</code>
                </span>
              ))}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
