import React, { type ReactNode } from "react";
import { joinClasses } from "./systemVisualTokens.js";

type GovernanceSpineProps = {
  active?: boolean;
  blocked?: boolean;
  children?: ReactNode;
  className?: string;
};

export function GovernanceSpine({
  active = false,
  blocked = false,
  children,
  className,
}: GovernanceSpineProps) {
  return (
    <div
      className={joinClasses(
        "governance-spine",
        active && "governance-spine-active",
        blocked && "governance-spine-blocked",
        className,
      )}
      data-governance-spine="true"
      data-governance-spine-active={active ? "true" : "false"}
      data-governance-spine-blocked={blocked ? "true" : "false"}
    >
      {children}
    </div>
  );
}
