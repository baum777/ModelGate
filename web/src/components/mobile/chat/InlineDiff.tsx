import { useMemo, useState } from "react";

export type InlineDiffFile = {
  path: string;
  additions: number;
  deletions: number;
  isNew: boolean;
};

export function extractInlineDiffFiles(content: string): InlineDiffFile[] {
  const rows: InlineDiffFile[] = [];
  const pattern = /^\s*[-*]?\s*([\w./-]+\.(?:ts|tsx|js|jsx|md|json|yml|yaml|css))\s+\+(\d+)(?:\s+-(\d+))?(?:\s+(new))?/gim;

  for (const match of content.matchAll(pattern)) {
    rows.push({
      path: match[1],
      additions: Number(match[2]),
      deletions: Number(match[3] ?? 0),
      isNew: Boolean(match[4]),
    });
  }

  return rows.slice(0, 12);
}

export function InlineDiff({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const files = useMemo(() => extractInlineDiffFiles(content), [content]);

  if (files.length === 0) {
    return null;
  }

  const visibleFiles = expanded ? files : files.slice(0, 3);

  return (
    <section className="mobile-inline-diff" aria-label="Changed files">
      <button
        type="button"
        className="mobile-inline-diff-summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span>{files.length} files changed</span>
        <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </button>
      <div className="mobile-inline-diff-list">
        {visibleFiles.map((file) => (
          <div className="mobile-inline-diff-row" key={`${file.path}:${file.additions}:${file.deletions}`}>
            <span>{file.path}</span>
            <strong>+{file.additions}</strong>
            {file.deletions > 0 ? <em>-{file.deletions}</em> : null}
            {file.isNew ? <small>new</small> : null}
          </div>
        ))}
      </div>
      {files.length > 3 && !expanded ? (
        <button type="button" className="mobile-inline-diff-more" onClick={() => setExpanded(true)}>
          {files.length - 3} more
        </button>
      ) : null}
    </section>
  );
}
