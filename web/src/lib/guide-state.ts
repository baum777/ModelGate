const GUIDE_NAMESPACE = "ms-guide:";

type GuideSetupState = "pending" | "done" | "skipped";

function toStorageKey(key: string) {
  return `${GUIDE_NAMESPACE}${key}`;
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(toStorageKey(key));
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(toStorageKey(key), value);
  } catch {
    // localStorage may be unavailable in strict browser settings; UI remains usable.
  }
}

export function hasSeenGuideKey(key: string) {
  return readStorage(key) === "true";
}

export function markGuideKeySeen(key: string) {
  writeStorage(key, "true");
}

export function readGuideSetupState(key: string, fallback: GuideSetupState = "pending"): GuideSetupState {
  const value = readStorage(key);
  if (value === "pending" || value === "done" || value === "skipped") {
    return value;
  }
  return fallback;
}

export function writeGuideSetupState(key: string, value: GuideSetupState) {
  writeStorage(key, value);
}
