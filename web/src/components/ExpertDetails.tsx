import type { ReactNode } from "react";

export type ExpertDetailRow = {
  label: string;
  value: ReactNode;
};

type ExpertDetailsProps = {
  expertMode: boolean;
  title?: string;
  rows?: ExpertDetailRow[];
  children?: ReactNode;
  className?: string;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function ExpertDetails({
  expertMode,
  title = "Technische Details",
  rows = [],
  children,
  className,
}: ExpertDetailsProps) {
  if (!expertMode) {
    return null;
  }

  return (
    <details className={joinClassNames("expert-details", className)} open>
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
