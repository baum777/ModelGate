export type ShellFreshness = "backend-fresh" | "local-restored" | "stale";

export function deriveShellFreshness(options: {
  backendHealthy: boolean | null;
  restoredSession: boolean;
}): ShellFreshness {
  if (options.backendHealthy === true) {
    return "backend-fresh";
  }

  if (options.backendHealthy === false) {
    return "stale";
  }

  return options.restoredSession ? "local-restored" : "stale";
}
