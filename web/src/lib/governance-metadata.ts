export type GovernanceMetadataRow = {
  label: string;
  value: string;
};

export type GovernanceMetadataShape = {
  actingIdentity?: string | null;
  activeScope?: string | null;
  authorityDomain?: string | null;
  targetScope?: string | null;
  executionDomain?: string | null;
  executionTarget?: string | null;
  provenanceSummary?: string | null;
  receiptSummary?: string | null;
};

export const BACKEND_TRUTH_UNAVAILABLE = "not exposed by backend";

function truthValue(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function buildGovernanceMetadataRows(
  shape: GovernanceMetadataShape,
  options?: {
    includeMissing?: boolean;
    missingValue?: string;
  }
): GovernanceMetadataRow[] {
  const includeMissing = options?.includeMissing ?? false;
  const missingValue = options?.missingValue ?? BACKEND_TRUTH_UNAVAILABLE;

  const entries: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Acting identity", value: shape.actingIdentity },
    { label: "Active scope", value: shape.activeScope },
    { label: "Authority domain", value: shape.authorityDomain },
    { label: "Target scope", value: shape.targetScope },
    { label: "Execution domain", value: shape.executionDomain },
    { label: "Execution target", value: shape.executionTarget },
    { label: "Provenance", value: shape.provenanceSummary },
    { label: "Receipt", value: shape.receiptSummary }
  ];

  return entries
    .filter((entry) => includeMissing || Boolean(entry.value && entry.value.trim().length > 0))
    .map((entry) => ({
      label: entry.label,
      value: truthValue(entry.value, missingValue)
    }));
}

export function mergeMetadataRows(
  ...groups: GovernanceMetadataRow[][]
): GovernanceMetadataRow[] {
  const merged: GovernanceMetadataRow[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const row of group) {
      const key = `${row.label}:${row.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(row);
      }
    }
  }

  return merged;
}
