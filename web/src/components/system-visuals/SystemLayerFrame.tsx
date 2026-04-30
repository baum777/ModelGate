import React, { type HTMLAttributes, type ReactNode } from "react";
import {
  joinClasses,
  systemLayerClassMap,
  type SystemLayer,
} from "./systemVisualTokens.js";

type SystemLayerFrameProps = {
  layer: SystemLayer;
  children: ReactNode;
  className?: string;
  active?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">;

export function SystemLayerFrame({
  layer,
  children,
  className,
  active = false,
  ...frameProps
}: SystemLayerFrameProps) {
  return (
    <div
      {...frameProps}
      className={joinClasses(
        "system-layer-frame",
        systemLayerClassMap[layer],
        active && "system-layer-frame-active",
        className,
      )}
      data-system-layer={layer}
      data-system-layer-active={active ? "true" : "false"}
    >
      {children}
    </div>
  );
}
