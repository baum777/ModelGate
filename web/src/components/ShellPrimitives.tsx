import React from "react";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type ShellCardVariant = "base" | "rail" | "truth" | "muted";
export type BadgeTone = "ready" | "partial" | "error" | "muted";

type ShellCardProps<T extends ElementType = "section"> = {
  as?: T;
  variant?: ShellCardVariant;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

function joinClassNames(...classNames: Array<string | null | undefined | false>) {
  return classNames.filter(Boolean).join(" ");
}

export function ShellCard<T extends ElementType = "section">({
  as,
  variant = "base",
  children,
  className,
  ...rest
}: ShellCardProps<T>) {
  const Component = (as ?? "section") as ElementType;
  return (
    <Component
      className={joinClassNames("shell-card", `shell-card-${variant}`, className)}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={joinClassNames("shell-section-label", className)}>{children}</p>;
}

export function MutedSystemCopy({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={joinClassNames("shell-muted-copy", className)}>{children}</p>;
}

export function StatusBadge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span className={joinClassNames("shell-badge", `shell-badge-${tone}`, className)}>
      {children}
    </span>
  );
}

export function TruthRailSection({
  title,
  badge,
  children,
  className,
  testId,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <ShellCard
      variant="truth"
      className={joinClassNames("truth-rail-section", className)}
      data-testid={testId}
    >
      <header className="truth-rail-section-header">
        <SectionLabel>{title}</SectionLabel>
        {badge}
      </header>
      <div className="truth-rail-section-body">{children}</div>
    </ShellCard>
  );
}
