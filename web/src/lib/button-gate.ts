export type ButtonGate = {
  blockedReason: string | null;
  ariaDisabled: boolean;
  tooltipText: string | null;
};

export function toButtonGate(blockedReason: string | null): ButtonGate {
  return {
    blockedReason,
    ariaDisabled: Boolean(blockedReason),
    tooltipText: blockedReason,
  };
}
