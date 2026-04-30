import React, { type ReactNode } from "react";
import {
  joinClasses,
  systemNodeKindClassMap,
  systemNodeStatusClassMap,
  type SystemNodeKind,
  type SystemNodeStatus,
} from "./systemVisualTokens.js";

type SystemNodeProps = {
  label: string;
  kind: SystemNodeKind;
  status: SystemNodeStatus;
  children?: ReactNode;
  className?: string;
};

export function SystemNode({
  label,
  kind,
  status,
  children,
  className,
}: SystemNodeProps) {
  return (
    <div
      className={joinClasses(
        "system-node",
        systemNodeKindClassMap[kind],
        systemNodeStatusClassMap[status],
        className,
      )}
      data-system-node-kind={kind}
      data-system-node-status={status}
      aria-label={`${label} integration node, status ${status}`}
    >
      <span className="system-node-dot" aria-hidden="true" />
      <span className="system-node-copy">
        <span className="system-node-label">{label}</span>
        <span className="system-node-status-text">
          {label} system status: {status}
        </span>
      </span>
      {children ? <span className="system-node-detail">{children}</span> : null}
    </div>
  );
}
