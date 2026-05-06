import React from "react";
import {
  flowDirectionClassMap,
  flowStatusClassMap,
  joinClasses,
  type FlowIndicatorDirection,
  type FlowIndicatorState,
} from "./systemVisualTokens.js";

type FlowIndicatorProps = {
  state: FlowIndicatorState;
  direction: FlowIndicatorDirection;
  label?: string;
  className?: string;
};

export function FlowIndicator({
  state,
  direction,
  label,
  className,
}: FlowIndicatorProps) {
  const accessibleLabel = label ?? "System flow";

  return (
    <span
      className={joinClasses(
        "flow-indicator",
        flowStatusClassMap[state],
        flowDirectionClassMap[direction],
        className,
      )}
      data-flow-state={state}
      data-flow-direction={direction}
      aria-label={`${accessibleLabel} flow, ${state}, ${direction}`}
      role="img"
    >
      {label ? <span className="flow-indicator-label">{label}</span> : null}
    </span>
  );
}
