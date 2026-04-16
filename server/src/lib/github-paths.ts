import path from "node:path";

export function normalizeGitHubRelativePath(input: string) {
  const trimmed = input.trim().replace(/\\/g, "/");

  if (!trimmed || trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    return null;
  }

  const normalized = path.posix.normalize(trimmed);

  if (!normalized || normalized === "." || normalized === "..") {
    return null;
  }

  if (normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }

  return normalized.replace(/^\.\/+/, "");
}
