import type { ReactNode } from "react";

export type DiagnosticsDetailRow = {
  label: string;
  value: ReactNode;
};

type DiagnosticsDrawerProps = {
  expertMode: boolean;
  title?: string;
  rows?: DiagnosticsDetailRow[];
  children?: ReactNode;
  className?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function DiagnosticsDrawer({
  expertMode,
  title = "Diagnostics",
  rows = [],
  children,
  className,
  open = true,
  onToggle,
}: DiagnosticsDrawerProps) {
  if (!expertMode) {
    return null;
  }

  return (
    <details
      className={joinClassNames("expert-details expert-details-secondary diagnostics-drawer", className)}
      open={open}
      onToggle={(event) => onToggle?.(event.currentTarget.open)}
    >
      <summary>{title}</summary>
      {rows.length > 0 ? (
        <div className="expert-details-grid">
          {rows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </details>
  );
}

export function ExpertDetails(props: DiagnosticsDrawerProps) {
  return <DiagnosticsDrawer {...props} />;
}
