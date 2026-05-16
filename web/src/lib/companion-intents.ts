export type CompanionLocale = "de" | "en";

export type CompanionTabTarget = "chat" | "workbench" | "matrix" | "settings";
export type CompanionPanelTarget = "command_palette" | "settings_integrations" | "settings_models";
export type CompanionSafeCheckTarget = "runtime_status" | "integrations" | "models";
export type CompanionGuideTopic = "orientation" | "github_connect" | "matrix_connect" | "model_setup";

export type CompanionAllowedIntent =
  | {
      id: string;
      kind: "navigate_tab";
      target: CompanionTabTarget;
      label: string;
      description: string;
    }
  | {
      id: string;
      kind: "open_panel";
      panel: CompanionPanelTarget;
      label: string;
      description: string;
    }
  | {
      id: string;
      kind: "prefill_chat";
      text: string;
      label: string;
      description: string;
    }
  | {
      id: string;
      kind: "prefill_matrix_draft";
      roomId: string | null;
      text: string;
      label: string;
      description: string;
    }
  | {
      id: string;
      kind: "explain_status";
      topic: "backend" | "models" | "github" | "matrix";
      label: string;
      description: string;
    }
  | {
      id: string;
      kind: "start_safe_check";
      target: CompanionSafeCheckTarget;
      label: string;
      description: string;
    }
  | {
      id: string;
      kind: "show_step_guide";
      topic: CompanionGuideTopic;
      label: string;
      description: string;
    };

export type CompanionBlockedIntent = {
  id: string;
  kind:
    | "github_execute"
    | "matrix_execute"
    | "matrix_write"
    | "credentials_read"
    | "credentials_write"
    | "provider_target_select"
    | "raw_route_call"
    | "unknown";
  label: string;
  reason: string;
};

export type CompanionIntentValidation =
  | {
      state: "allowed";
      intent: CompanionAllowedIntent;
    }
  | {
      state: "blocked";
      intent: CompanionBlockedIntent;
    };

export type CompanionSuggestionResult = {
  suggestedIntents: CompanionAllowedIntent[];
  blockedIntents: CompanionBlockedIntent[];
};

type IntentInput = Record<string, unknown>;

const TAB_TARGETS: CompanionTabTarget[] = ["chat", "workbench", "matrix", "settings"];
const PANEL_TARGETS: CompanionPanelTarget[] = ["command_palette", "settings_integrations", "settings_models"];
const SAFE_CHECK_TARGETS: CompanionSafeCheckTarget[] = ["runtime_status", "integrations", "models"];
const GUIDE_TOPICS: CompanionGuideTopic[] = ["orientation", "github_connect", "matrix_connect", "model_setup"];

function copy(locale: CompanionLocale, de: string, en: string) {
  return locale === "de" ? de : en;
}

function isRecord(value: unknown): value is IntentInput {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function blockedIntent(kind: CompanionBlockedIntent["kind"], locale: CompanionLocale = "de"): CompanionBlockedIntent {
  const reason = copy(
    locale,
    "Dieser Wunsch bleibt in MosaicStacked gesperrt oder approval-gated.",
    "This request stays blocked or approval-gated in MosaicStacked.",
  );
  const labels: Record<CompanionBlockedIntent["kind"], string> = {
    github_execute: copy(locale, "GitHub-Ausführung blockiert", "GitHub execution blocked"),
    matrix_execute: copy(locale, "Matrix-Ausführung blockiert", "Matrix execution blocked"),
    matrix_write: copy(locale, "Matrix-Schreiben blockiert", "Matrix write blocked"),
    credentials_read: copy(locale, "Credential-Lesen blockiert", "Credential read blocked"),
    credentials_write: copy(locale, "Credential-Änderung blockiert", "Credential change blocked"),
    provider_target_select: copy(locale, "Provider-Ziel blockiert", "Provider target blocked"),
    raw_route_call: copy(locale, "Freie Route blockiert", "Raw route blocked"),
    unknown: copy(locale, "Unbekannte Aktion blockiert", "Unknown action blocked"),
  };

  return {
    id: `blocked-${kind}`,
    kind,
    label: labels[kind],
    reason,
  };
}

function navigateIntent(target: CompanionTabTarget, locale: CompanionLocale): CompanionAllowedIntent {
  const labels: Record<CompanionTabTarget, string> = {
    chat: copy(locale, "Chat öffnen", "Open Chat"),
    workbench: copy(locale, "Workbench öffnen", "Open Workbench"),
    matrix: copy(locale, "Matrix öffnen", "Open Matrix"),
    settings: copy(locale, "Settings öffnen", "Open Settings"),
  };

  return {
    id: `navigate-${target}`,
    kind: "navigate_tab",
    target,
    label: labels[target],
    description: copy(locale, "Wechselt nur die sichtbare App-Fläche.", "Only changes the visible app surface."),
  };
}

function checkIntent(target: CompanionSafeCheckTarget, locale: CompanionLocale): CompanionAllowedIntent {
  return {
    id: `safe-check-${target}`,
    kind: "start_safe_check",
    target,
    label: copy(locale, "Status prüfen", "Check status"),
    description: copy(locale, "Startet nur bestehende Read-only-Prüfungen.", "Runs only existing read-only checks."),
  };
}

function guideIntent(topic: CompanionGuideTopic, locale: CompanionLocale): CompanionAllowedIntent {
  const labels: Record<CompanionGuideTopic, string> = {
    orientation: copy(locale, "Schritte anzeigen", "Show steps"),
    github_connect: copy(locale, "GitHub-Verbindung erklären", "Explain GitHub connection"),
    matrix_connect: copy(locale, "Matrix-Verbindung erklären", "Explain Matrix connection"),
    model_setup: copy(locale, "Modellzugang erklären", "Explain model setup"),
  };

  return {
    id: `guide-${topic}`,
    kind: "show_step_guide",
    topic,
    label: labels[topic],
    description: copy(locale, "Zeigt eine sichere Schrittfolge ohne Ausführung.", "Shows a safe guide without execution."),
  };
}

export function validateCompanionIntent(input: unknown, locale: CompanionLocale = "de"): CompanionIntentValidation {
  if (!isRecord(input)) {
    return { state: "blocked", intent: blockedIntent("unknown", locale) };
  }

  const kind = readString(input.kind);

  if (!kind) {
    return { state: "blocked", intent: blockedIntent("unknown", locale) };
  }

  if (
    kind === "github_execute"
    || kind === "matrix_execute"
    || kind === "matrix_write"
    || kind === "credentials_read"
    || kind === "credentials_write"
    || kind === "provider_target_select"
    || kind === "raw_route_call"
  ) {
    return { state: "blocked", intent: blockedIntent(kind, locale) };
  }

  if (kind === "navigate_tab" && isOneOf(input.target, TAB_TARGETS)) {
    return { state: "allowed", intent: navigateIntent(input.target, locale) };
  }

  if (kind === "open_panel" && isOneOf(input.panel, PANEL_TARGETS)) {
    return {
      state: "allowed",
      intent: {
        id: `open-${input.panel}`,
        kind,
        panel: input.panel,
        label: copy(locale, "Panel öffnen", "Open panel"),
        description: copy(locale, "Öffnet nur eine lokale UI-Fläche.", "Only opens a local UI surface."),
      },
    };
  }

  if (kind === "prefill_chat") {
    const text = readString(input.text);
    if (text) {
      return {
        state: "allowed",
        intent: {
          id: "prefill-chat",
          kind,
          text,
          label: copy(locale, "In Chat übernehmen", "Send to Chat draft"),
          description: copy(locale, "Füllt nur den Chat-Composer vor.", "Only prefills the Chat composer."),
        },
      };
    }
  }

  if (kind === "prefill_matrix_draft") {
    const text = readString(input.text);
    if (text) {
      return {
        state: "allowed",
        intent: {
          id: "prefill-matrix-draft",
          kind,
          roomId: readString(input.roomId),
          text,
          label: copy(locale, "Matrix-Entwurf vorbereiten", "Prepare Matrix draft"),
          description: copy(locale, "Bereitet nur einen Entwurf vor, ohne zu senden.", "Only prepares a draft without sending."),
        },
      };
    }
  }

  if (kind === "explain_status" && isOneOf(input.topic, ["backend", "models", "github", "matrix"] as const)) {
    return {
      state: "allowed",
      intent: {
        id: `explain-${input.topic}`,
        kind,
        topic: input.topic,
        label: copy(locale, "Status erklären", "Explain status"),
        description: copy(locale, "Erklärt vorhandene Read-only-Signale.", "Explains existing read-only signals."),
      },
    };
  }

  if (kind === "start_safe_check" && isOneOf(input.target, SAFE_CHECK_TARGETS)) {
    return { state: "allowed", intent: checkIntent(input.target, locale) };
  }

  if (kind === "show_step_guide" && isOneOf(input.topic, GUIDE_TOPICS)) {
    return { state: "allowed", intent: guideIntent(input.topic, locale) };
  }

  return { state: "blocked", intent: blockedIntent("unknown", locale) };
}

export function buildCompanionSuggestions(options: {
  question: string;
  locale: CompanionLocale;
  matrixRoomId?: string | null;
}): CompanionSuggestionResult {
  const normalized = options.question.toLowerCase();
  const suggestedIntents: CompanionAllowedIntent[] = [];
  const blockedIntents: CompanionBlockedIntent[] = [];

  if (/github|repo|branch|pr|pull request|workbench/.test(normalized)) {
    suggestedIntents.push(navigateIntent("workbench", options.locale));
    suggestedIntents.push(guideIntent("github_connect", options.locale));
  }

  if (/matrix|raum|room|topic/.test(normalized)) {
    suggestedIntents.push(navigateIntent("matrix", options.locale));
    suggestedIntents.push(guideIntent("matrix_connect", options.locale));
  }

  if (/setting|settings|modell|model|openrouter|backend|verbindung|connection|key/.test(normalized)) {
    suggestedIntents.push(navigateIntent("settings", options.locale));
    suggestedIntents.push(checkIntent("runtime_status", options.locale));
  }

  if (/chat|prompt|frage/.test(normalized)) {
    suggestedIntents.push(navigateIntent("chat", options.locale));
  }

  if (/ausführ|execute|push|merge|write|schreib|senden|send/.test(normalized)) {
    if (/github|repo|branch|pr|pull request/.test(normalized)) {
      blockedIntents.push(blockedIntent("github_execute", options.locale));
    }

    if (/matrix|raum|room|topic/.test(normalized)) {
      blockedIntents.push(blockedIntent("matrix_write", options.locale));
    }
  }

  if (suggestedIntents.length === 0) {
    suggestedIntents.push(guideIntent("orientation", options.locale));
  }

  const deduped = Array.from(new Map(suggestedIntents.map((intent) => [intent.id, intent])).values()).slice(0, 4);

  return {
    suggestedIntents: deduped,
    blockedIntents,
  };
}
