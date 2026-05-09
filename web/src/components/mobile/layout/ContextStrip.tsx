export type MobileContextStatus = "idle" | "streaming" | "pending" | "error";

export function ContextStrip({
  repoLabel,
  branchLabel,
  fileLabel,
  status,
  ariaLabel,
  onPress,
}: {
  repoLabel: string;
  branchLabel: string;
  fileLabel: string;
  status: MobileContextStatus;
  ariaLabel: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="mobile-context-strip"
      aria-label={ariaLabel}
      onClick={onPress}
    >
      <span className="mobile-context-path">
        <span>{repoLabel}</span>
        <span>{branchLabel}</span>
        <span>{fileLabel}</span>
      </span>
      <span className={`mobile-context-live mobile-context-live-${status}`}>
        {status}
      </span>
      <span className="mobile-context-chevron" aria-hidden="true">⌄</span>
    </button>
  );
}
