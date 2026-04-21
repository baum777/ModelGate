import type { ReactNode } from "react";
import { SectionLabel, ShellCard, StatusBadge } from "./ShellPrimitives.js";

export type ApprovalOutcome = "executed" | "failed" | "rejected" | "unverifiable";

type ProposalCardProps = {
  title: string;
  summary: string;
  consequence: string;
  metadata?: Array<{ label: string; value: string }>;
  children?: ReactNode;
  testId?: string;
};

type DecisionZoneProps = {
  approveLabel?: string;
  rejectLabel?: string;
  onApprove: () => void;
  onReject: () => void;
  approveDisabled?: boolean;
  rejectDisabled?: boolean;
  busy?: boolean;
  helperText?: string;
  testId?: string;
};

type ApprovalTransitionProps = {
  title: string;
  detail: string;
  testId?: string;
};

type ExecutionReceiptProps = {
  title: string;
  detail: string;
  outcome: ApprovalOutcome;
  metadata?: Array<{ label: string; value: string }>;
  testId?: string;
};

function toneForOutcome(outcome: ApprovalOutcome) {
  switch (outcome) {
    case "executed":
      return "ready" as const;
    case "failed":
    case "unverifiable":
      return "error" as const;
    case "rejected":
    default:
      return "partial" as const;
  }
}

function labelForOutcome(outcome: ApprovalOutcome) {
  switch (outcome) {
    case "executed":
      return "Executed";
    case "failed":
      return "Failed";
    case "unverifiable":
      return "Unverifiable";
    case "rejected":
    default:
      return "Rejected";
  }
}

export function ProposalCard({
  title,
  summary,
  consequence,
  metadata = [],
  children,
  testId,
}: ProposalCardProps) {
  return (
    <ShellCard variant="base" className="proposal-card" data-testid={testId}>
      <header className="proposal-card-header">
        <div>
          <SectionLabel>Proposal</SectionLabel>
          <strong>{title}</strong>
        </div>
        <StatusBadge tone="partial">Approval required</StatusBadge>
      </header>

      <p className="proposal-summary">{summary}</p>
      <p className="proposal-consequence">
        <span>Consequence</span>
        <strong>{consequence}</strong>
      </p>

      {metadata.length > 0 ? (
        <div className="approval-meta-grid">
          {metadata.map((item) => (
            <div key={`${item.label}-${item.value}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {children}
    </ShellCard>
  );
}

export function DecisionZone({
  approveLabel = "Approve",
  rejectLabel = "Reject",
  onApprove,
  onReject,
  approveDisabled = false,
  rejectDisabled = false,
  busy = false,
  helperText,
  testId,
}: DecisionZoneProps) {
  return (
    <section className="decision-zone" data-testid={testId}>
      <div className="decision-actions">
        <button type="button" onClick={onApprove} disabled={approveDisabled || busy}>
          {busy ? "Running…" : approveLabel}
        </button>
        <button type="button" className="secondary-button" onClick={onReject} disabled={rejectDisabled || busy}>
          {rejectLabel}
        </button>
      </div>
      {helperText ? <p className="shell-muted-copy">{helperText}</p> : null}
    </section>
  );
}

export function ApprovalTransitionCard({ title, detail, testId }: ApprovalTransitionProps) {
  return (
    <ShellCard variant="muted" className="approval-transition-card" data-testid={testId}>
      <header className="approval-transition-header">
        <SectionLabel>Executing</SectionLabel>
        <StatusBadge tone="partial">In progress</StatusBadge>
      </header>
      <strong>{title}</strong>
      <p className="shell-muted-copy">{detail}</p>
    </ShellCard>
  );
}

export function ExecutionReceiptCard({
  title,
  detail,
  outcome,
  metadata = [],
  testId,
}: ExecutionReceiptProps) {
  return (
    <ShellCard variant="muted" className={`execution-receipt execution-receipt-${outcome}`} data-testid={testId}>
      <header className="execution-receipt-header">
        <SectionLabel>Execution receipt</SectionLabel>
        <StatusBadge tone={toneForOutcome(outcome)}>{labelForOutcome(outcome)}</StatusBadge>
      </header>
      <strong>{title}</strong>
      <p className="shell-muted-copy">{detail}</p>
      {metadata.length > 0 ? (
        <div className="approval-meta-grid">
          {metadata.map((item) => (
            <div key={`${item.label}-${item.value}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </ShellCard>
  );
}
