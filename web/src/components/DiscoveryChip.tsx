import React, { useEffect } from "react";

type DiscoveryChipPosition = "bubble-below" | "top-center" | "composer-above";

export interface DiscoveryChipProps {
  id: string;
  text: string;
  position: DiscoveryChipPosition;
  autoDismissMs?: number;
  onClick?: () => void;
  onDismiss?: () => void;
}

export function DiscoveryChip({
  id,
  text,
  position,
  autoDismissMs = 8000,
  onClick,
  onDismiss,
}: DiscoveryChipProps) {
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      onDismiss?.();
    }, autoDismissMs);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      className={`discovery-chip discovery-chip-${position}`}
      data-discovery-chip={id}
      role="status"
      aria-live="polite"
      onClick={onClick}
    >
      {text}
    </div>
  );
}
