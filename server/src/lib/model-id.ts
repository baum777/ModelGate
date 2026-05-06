export function normalizeConfiguredModelId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.toLowerCase() === "default") {
    return null;
  }

  return normalized;
}
