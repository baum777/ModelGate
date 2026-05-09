type StatusChipProps = {
  model: string;
  status: "Ready" | "Syncing" | "Offline" | string;
  latencyMs?: number;
};

export function StatusChip({ model, status, latencyMs }: StatusChipProps) {
  const tone = status.toLowerCase() === "ready"
    ? "ready"
    : status.toLowerCase() === "offline"
      ? "error"
      : "partial";

  return (
    <div className={`mobile-status-chip mobile-status-chip-${tone}`}>
      <span className="mobile-status-chip-model">{model}</span>
      <span className="mobile-status-chip-separator" aria-hidden="true">•</span>
      <span className="mobile-status-chip-state">{status}</span>
      {typeof latencyMs === "number" ? (
        <span className="mobile-status-chip-latency">{latencyMs}ms</span>
      ) : null}
    </div>
  );
}
