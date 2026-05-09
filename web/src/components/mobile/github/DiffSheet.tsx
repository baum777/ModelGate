import { useState } from "react";
import { BottomSheet } from "../shared/BottomSheet.js";
import { SegmentedControl } from "../shared/SegmentedControl.js";

export type DiffSheetFile = {
  path: string;
  changeType: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export function DiffSheet({
  open,
  title,
  summary,
  emptyLabel,
  files,
  onDismiss,
}: {
  open: boolean;
  title: string;
  summary: string;
  emptyLabel: string;
  files: DiffSheetFile[];
  onDismiss: () => void;
}) {
  const [tab, setTab] = useState<"chat" | "diff">("chat");

  return (
    <BottomSheet open={open} title={title} maxHeight="large" onDismiss={onDismiss}>
      <div className="mobile-diff-sheet">
        <SegmentedControl
          label={title}
          value={tab}
          options={[
            { value: "chat", label: "Chat" },
            { value: "diff", label: "Diff" },
          ]}
          onChange={setTab}
        />
        {tab === "chat" ? (
          <p className="mobile-diff-sheet-summary">{summary}</p>
        ) : (
          <div className="mobile-diff-file-list">
            {files.length > 0 ? files.map((file) => (
              <article className="mobile-diff-file-row" key={file.path}>
                <strong>{file.path}</strong>
                <span>{file.changeType}</span>
                <small>+{file.additions} -{file.deletions}</small>
              </article>
            )) : (
              <p className="mobile-diff-sheet-summary">{emptyLabel}</p>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
