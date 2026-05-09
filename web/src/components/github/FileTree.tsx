import React from "react";
import type { GitHubFileNode } from "./types.js";

type FileTreeProps = {
  files: GitHubFileNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
};

function statusLabel(status: GitHubFileNode["status"]) {
  switch (status) {
    case "added":
      return "A";
    case "removed":
      return "D";
    case "modified":
    default:
      return "M";
  }
}

export function FileTree({ files, selectedPath, onSelect }: FileTreeProps) {
  return (
    <section className="github-mobile-file-tree" aria-label="Changed files">
      <div className="github-mobile-section-header">
        <h3>Files</h3>
        <span>{files.length}</span>
      </div>
      <div className="github-mobile-file-list" role="tree">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            className={file.path === selectedPath ? "github-mobile-file github-mobile-file-active" : "github-mobile-file"}
            onClick={() => onSelect(file.path)}
            role="treeitem"
            aria-selected={file.path === selectedPath}
          >
            <span className={`github-mobile-file-status github-mobile-file-status-${file.status}`}>
              {statusLabel(file.status)}
            </span>
            <span className="github-mobile-file-main">
              <strong>{file.path}</strong>
              <span>{file.additions}+ / {file.deletions}-</span>
            </span>
            <span className={`github-mobile-risk-dot github-mobile-risk-${file.risk}`} aria-label={`${file.risk} risk`} />
          </button>
        ))}
      </div>
    </section>
  );
}
