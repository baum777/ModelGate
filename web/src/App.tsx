import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestChatCompletion } from "./lib/api.js";
import {
  type GitHubWorkspaceStatus,
} from "./components/GitHubWorkspace.js";
import {
  type MatrixWorkspaceStatus,
} from "./components/MatrixWorkspace.js";
import {
  SettingsWorkspace,
  type DiagnosticEntry,
  type SettingsTruthSnapshot,
} from "./components/SettingsWorkspace.js";
import { SessionList } from "./components/SessionList.js";
import {
  type StatusPanelRow,
} from "./components/StatusPanel.js";
import {
  MutedSystemCopy,
  SectionLabel,
  ShellCard,
  StatusBadge,
  TruthRailSection,
} from "./components/ShellPrimitives.js";
import { FloatingCompanion } from "./components/FloatingCompanion.js";
import {
  getShellHealthCopy,
  getSessionStatusLabel,
  useLocalization,
} from "./lib/localization.js";
import {
  deriveSettingsLoginAdapters,
} from "./lib/settings-login-adapters.js";
import {
  type WorkspaceKind,
} from "./lib/workspace-state.js";
import {
  summarizePendingApprovals,
} from "./lib/shell-view-model.js";
import {
  getWorkModeCopy,
  isExpertMode,
  resolvePersistedWorkMode,
  type WorkMode,
} from "./lib/work-mode.js";
import { BottomNav } from "./components/navigation/BottomNav.js";
import { ContextStrip, type MobileContextStatus } from "./components/mobile/layout/ContextStrip.js";
import { TopContextBar } from "./components/mobile/layout/TopContextBar.js";
import { useRuntimeStatus } from "./hooks/useRuntimeStatus.js";
import { useWorkspaceSessions } from "./hooks/useWorkspaceSessions.js";
import { useCrossTabCommands } from "./hooks/useCrossTabCommands.js";
import type { CrossTabCommand } from "./lib/cross-tab-commands.js";
import { useReviewState } from "./hooks/useReviewState.js";
import { deriveShellFreshness, type ShellFreshness } from "./lib/shell-freshness.js";
import type { NavigationPaletteEntry } from "./lib/navigation-palette.js";

const loadChatWorkspace = () => import("./components/ChatWorkspace.js");
const loadGitHubWorkspace = () => import("./components/GitHubWorkspace.js");
const loadMatrixWorkspace = () => import("./components/MatrixWorkspace.js");

const ChatWorkspace = lazy(() => loadChatWorkspace().then((module) => ({ default: module.ChatWorkspace })));
const GitHubWorkspace = lazy(() => loadGitHubWorkspace().then((module) => ({ default: module.GitHubWorkspace })));
const MatrixWorkspace = lazy(() => loadMatrixWorkspace().then((module) => ({ default: module.MatrixWorkspace })));

type WorkspaceMode = "chat" | "workbench" | "matrix" | "settings";

type TelemetryEntry = {
  id: string;
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type PersistedShellState = {
  activeTab?: string;
  workMode?: WorkMode;
  expertMode?: boolean;
};

const SHELL_STORAGE_KEY = "mosaicstacked.console.shell.v2";
const DEFAULT_FREE_MODEL_ALIAS = "default-free";

function isWorkspaceMode(value: string | null): value is WorkspaceMode {
  return value === "chat"
    || value === "workbench"
    || value === "matrix"
    || value === "settings";
}

function normalizeWorkspaceMode(value: string | null | undefined): WorkspaceMode | null {
  if (!value) {
    return null;
  }

  if (isWorkspaceMode(value)) {
    return value;
  }

  if (value === "github" || value === "review" || value === "context") {
    return "workbench";
  }

  return null;
}

export function shouldConfirmGitHubReviewNavigation(options: {
  currentMode: WorkspaceMode;
  nextMode: WorkspaceMode;
  githubReviewDirty: boolean;
}) {
  return options.currentMode === "workbench"
    && options.nextMode !== "workbench"
    && options.githubReviewDirty;
}

function readUrlWorkspaceMode() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const requestedMode = url.searchParams.get("mode");
  return normalizeWorkspaceMode(requestedMode);
}

function replaceConsoleUrl(mode?: WorkspaceMode) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.pathname = "/console";
  url.searchParams.delete("console");

  if (mode) {
    url.searchParams.set("mode", mode);
  }

  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function createId() {
  return crypto.randomUUID();
}

function hasPrimaryModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
}

function readPersistedShellState(): PersistedShellState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedShellState) : null;
  } catch {
    return null;
  }
}

function persistShellState(state: PersistedShellState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(state));
}

function appendTelemetry(current: TelemetryEntry[], entry: TelemetryEntry) {
  return [...current, entry].slice(-8);
}

const WORKSPACE_MODES: WorkspaceMode[] = ["chat", "workbench", "matrix", "settings"];
const MOBILE_NAV_MODES: WorkspaceMode[] = ["chat", "workbench", "matrix", "settings"];
const MOBILE_BREAKPOINT_QUERY = "(max-width: 760px)";
const MATRIX_HIERARCHY_ENABLED = ((import.meta as { env?: { VITE_MATRIX_HIERARCHY?: string } }).env?.VITE_MATRIX_HIERARCHY ?? "false") === "true";
// Reference-only mobile demo pages stay in-repo, but runtime defaults to functional workspaces.
const MOBILE_REFERENCE_SURFACES_ENABLED = false;

function WorkspaceIcon({ mode }: { mode: WorkspaceMode }) {
  switch (mode) {
    case "workbench":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6.75A2.75 2.75 0 0 1 8.75 4H15l3 3v10.25A2.75 2.75 0 0 1 15.25 20H8.75A2.75 2.75 0 0 1 6 17.25V6.75Z" />
          <path d="M15 4v3h3" />
          <path d="M8.5 11.25h7" />
          <path d="M8.5 14.5h7" />
        </svg>
      );
    case "matrix":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 8.5A3.5 3.5 0 1 1 12 15.5A3.5 3.5 0 0 1 12 8.5Z" />
          <path d="M4.5 12a7.5 7.5 0 0 1 .2-1.7l2-.4a6.7 6.7 0 0 1 .8-1.3l-1.2-1.7a8 8 0 0 1 2.4-2.4l1.7 1.2c.4-.3.9-.6 1.3-.8l.4-2A7.5 7.5 0 0 1 12 4.5c.6 0 1.1.1 1.7.2l.4 2c.5.2 1 .5 1.3.8l1.7-1.2a8 8 0 0 1 2.4 2.4l-1.2 1.7c.3.4.6.9.8 1.3l2 .4a7.5 7.5 0 0 1 0 3.4l-2 .4c-.2.5-.5 1-.8 1.3l1.2 1.7a8 8 0 0 1-2.4 2.4l-1.7-1.2c-.4.3-.9.6-1.3.8l-.4 2a7.5 7.5 0 0 1-3.4 0l-.4-2c-.5-.2-1-.5-1.3-.8l-1.7 1.2a8 8 0 0 1-2.4-2.4l1.2-1.7c-.3-.4-.6-.9-.8-1.3l-2-.4A7.5 7.5 0 0 1 4.5 12Z" />
        </svg>
      );
    case "chat":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H9l-4 4v-4.5A2.5 2.5 0 0 1 5 13V6.5Z" />
          <path d="M8 8.5h8" />
          <path d="M8 11.5h5.5" />
        </svg>
      );
  }
}

function MosaicStackedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2 19.2 7.4v9.2L12 20.8 4.8 16.6V7.4Z" />
      <path d="m12 7 3.8 2.2v4.6L12 16l-3.8-2.2V9.2Z" />
    </svg>
  );
}

function BeginnerExpertToggle({
  workMode,
  setWorkMode,
}: {
  workMode: WorkMode;
  setWorkMode: (value: WorkMode) => void;
}) {
  const { locale } = useLocalization();
  const beginnerCopy = getWorkModeCopy(locale, "beginner");
  const expertCopy = getWorkModeCopy(locale, "expert");
  const activeCopy = getWorkModeCopy(locale, workMode);

  return (
    <div className="work-mode-control">
      <div className="mode-toggle" role="group" aria-label={activeCopy.label}>
        <button
          type="button"
          className={workMode === "beginner" ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
          onClick={() => setWorkMode("beginner")}
          aria-pressed={workMode === "beginner"}
        >
          {beginnerCopy.shortLabel}
        </button>
        <button
          type="button"
          className={workMode === "expert" ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
          onClick={() => setWorkMode("expert")}
          aria-pressed={workMode === "expert"}
        >
          {expertCopy.shortLabel}
        </button>
      </div>
      <MutedSystemCopy className="work-mode-hint">{activeCopy.description}</MutedSystemCopy>
    </div>
  );
}

function isSessionWorkspace(mode: WorkspaceMode): mode is "chat" | "workbench" | "matrix" {
  return mode === "chat" || mode === "workbench" || mode === "matrix";
}

function toWorkspaceKind(mode: "chat" | "workbench" | "matrix"): WorkspaceKind {
  if (mode === "workbench") {
    return "github";
  }

  return mode;
}

function toWorkspaceMode(workspace: WorkspaceKind): "chat" | "workbench" | "matrix" {
  if (workspace === "github") {
    return "workbench";
  }

  return workspace;
}

type AppSurface = "console" | "readme" | "preview";

export function resolveAppSurface(href?: string): AppSurface {
  if (typeof window === "undefined" && !href) {
    return "console";
  }

  const url = new URL(href ?? window.location.href);

  if (url.pathname === "/console" || url.searchParams.get("console") === "1") {
    return "console";
  }

  if (url.pathname === "/readme" || url.pathname === "/handbook") {
    return "readme";
  }

  return "preview";
}

export default function App() {
  const surface = resolveAppSurface();

  if (surface === "console") {
    return <ConsoleShell />;
  }

  return surface === "readme" ? <ReadmeLandingPage /> : <PublicPreview />;
}

function useDarkOnlyTheme() {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = "dark";
    document.body.classList.remove("light-mode");
  }, []);
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(media.matches);
    media.addEventListener("change", onChange);

    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  return isMobile;
}

const LANDING_COPY = {
  de: {
    kicker: "Model-Agnostic Workflow",
    heroTitle: "Eine backend-first Console für Chat, Workbench und Matrix-Scope.",
    heroBody: "MosaicStacked verbindet Modellwahl, Repo-Kontext und Matrix-Status in einem kontrollierten Arbeitsfluss mit klaren Freigabe-Gates.",
    heroPrimaryCta: "Console öffnen",
    heroSecondaryCta: "So funktioniert's",
    workspaceTabsKicker: "Workspace Tabs",
    workspaceTabsTitle: "Was du hier machen kannst",
    openSuffix: "öffnen",
    modelKicker: "Modell verbinden",
    modelTitle: "Verbinde dein Modell in drei Schritten",
    modelBody: "MosaicStacked bleibt model-agnostisch: Du bringst deinen Modellzugang mit, die App macht daraus einen kontrollierten Arbeitsfluss.",
    modelHintLabel: "Hinweis:",
    modelHintBody: "Die UI zeigt Modell-Aliase. Provider-Details bleiben Backend-/Config-Sache.",
    modelSecretNote: "gehört in Settings/Backend, nie in Prompt-Text.",
    actionsKicker: "Action Buttons",
    actionsTitle: "Von einer Antwort zur nächsten Aktion",
    actionsBody: "Jede gute Antwort kann direkt als nächster Schritt weitergegeben werden - ohne Copy-Paste-Chaos.",
    actionsExamplePrefix: "Beispiel:",
    actionsExampleBody: "Lade eine Datei -> prüfe Risiken -> übergib an Workbench mit",
    actionsExampleTail: "-> bereite einen Matrix-Entwurf mit",
    beginnerKicker: "Beginner Flow",
    beginnerTitle: "Dein erster Flow",
    powerKicker: "Power User Recipes",
    powerTitle: "Workflows für echte Projektarbeit",
    safetyLabel: "Safety-Hinweis",
    safetyLines: [
      "Browser ist Review Surface, Backend hält Autorität.",
      "Keine direkten Writes ohne Approval Gate.",
      "Matrix-Composer Submit bleibt fail-closed, bis ein Write-Contract aktiv ist.",
      "Secrets nie in Prompts posten.",
    ],
    enterLabel: "ENTER",
    enterHint: "Zur App wechseln",
  },
  en: {
    kicker: "Model-Agnostic Workflow",
    heroTitle: "A backend-first console for chat, workbench, and Matrix scope.",
    heroBody: "MosaicStacked combines model choice, repository context, and Matrix status in one controlled workflow with explicit approval gates.",
    heroPrimaryCta: "Open console",
    heroSecondaryCta: "How it works",
    workspaceTabsKicker: "Workspace Tabs",
    workspaceTabsTitle: "What you can do here",
    openSuffix: "open",
    modelKicker: "Connect Models",
    modelTitle: "Connect your model in three steps",
    modelBody: "MosaicStacked stays model-agnostic: you bring your model access, the app turns it into a controlled workflow.",
    modelHintLabel: "Note:",
    modelHintBody: "The UI shows model aliases. Provider details stay a backend/config concern.",
    modelSecretNote: "belongs in settings/backend, never in prompt text.",
    actionsKicker: "Action Buttons",
    actionsTitle: "From one answer to the next action",
    actionsBody: "Every good answer can be handed into the next step immediately - without copy-paste chaos.",
    actionsExamplePrefix: "Example:",
    actionsExampleBody: "Load a file -> review risks -> hand off to Workbench with",
    actionsExampleTail: "-> prepare a Matrix draft with",
    beginnerKicker: "Beginner Flow",
    beginnerTitle: "Your first flow",
    powerKicker: "Power User Recipes",
    powerTitle: "Workflows for real project work",
    safetyLabel: "Safety Note",
    safetyLines: [
      "The browser is a review surface; the backend remains authoritative.",
      "No direct writes without an approval gate.",
      "Matrix composer submit stays fail-closed until a write contract is active.",
      "Never post secrets in prompts.",
    ],
    enterLabel: "ENTER",
    enterHint: "Open the app",
  },
} as const;

const LANDING_FEATURES = [
  {
    key: "chat",
    icon: <WorkspaceIcon mode="chat" />,
    href: "/console?mode=chat",
    title: {
      de: "Chat",
      en: "Chat",
    },
    description: {
      de: "Frage Modelle, plane Tasks und lass dir Code oder Entscheidungen erklären.",
      en: "Ask models, plan tasks, and get code or decisions explained.",
    },
    useCase: {
      de: "Kurz starten: Idee eintippen und den nächsten Schritt ableiten.",
      en: "Quick start: type an idea and derive the next step.",
    },
  },
  {
    key: "workbench",
    icon: <WorkspaceIcon mode="workbench" />,
    href: "/console?mode=workbench",
    title: {
      de: "Workbench",
      en: "Workbench",
    },
    description: {
      de: "Lade Repo-Kontext, prüfe Änderungen und steuere Review, Übergabe und PR-Vorbereitung.",
      en: "Load repository context, review changes, and control handoff and PR preparation.",
    },
    useCase: {
      de: "Arbeitszusammenfassung prüfen und nur bei Bedarf den Raw Diff öffnen.",
      en: "Review the work summary first and open raw diff only when needed.",
    },
  },
  {
    key: "matrix",
    icon: <WorkspaceIcon mode="matrix" />,
    href: "/console?mode=matrix",
    title: {
      de: "Matrix",
      en: "Matrix",
    },
    description: {
      de: "Prüfe Scope, Provenienz und Topic-Update-Pläne im Backend-Flow.",
      en: "Review scope, provenance, and topic-update plans through backend flows.",
    },
    useCase: {
      de: "Scope auflösen, Plan prüfen, dann mit Freigabe ausführen und verifizieren.",
      en: "Resolve scope, review plan, then execute and verify with approval.",
    },
  },
  {
    key: "settings",
    icon: <WorkspaceIcon mode="settings" />,
    href: "/console?mode=settings",
    title: {
      de: "Settings",
      en: "Settings",
    },
    description: {
      de: "Verbinde Modellzugang, GitHub und Matrix kontrolliert.",
      en: "Connect model access, GitHub, and Matrix in a controlled way.",
    },
    useCase: {
      de: "OpenRouter-Credentials prüfen und GitHub-/Matrix-Integrationen kontrolliert verbinden.",
      en: "Verify OpenRouter credentials and connect GitHub/Matrix integrations in a controlled flow.",
    },
  },
] as const;

const LANDING_MODEL_STEPS = [
  {
    title: {
      de: "API-Key holen",
      en: "Get API key",
    },
    text: {
      de: "Erstelle einen OpenRouter-Key und nutze ihn als Zugang zu mehreren Modellen.",
      en: "Create an OpenRouter key and use it as access to multiple models.",
    },
  },
  {
    title: {
      de: "In Mosaic eintragen",
      en: "Connect in Mosaic",
    },
    text: {
      de: "Füge den Key im Setup oder in den Settings hinzu. Secrets gehören nie in Chat-Nachrichten.",
      en: "Add the key in setup or settings. Secrets never belong in chat messages.",
    },
  },
  {
    title: {
      de: "Modell wählen",
      en: "Switch model",
    },
    text: {
      de: "Wechsle je nach Aufgabe: schnell lesen, tief prüfen oder strukturiert planen.",
      en: "Switch by task: read fast, review deeply, or plan with structure.",
    },
  },
] as const;

const LANDING_ACTION_BUTTONS = [
  {
    title: "⊛",
    headline: {
      de: "Matrix-Entwurf vorbereiten",
      en: "Prepare Matrix draft",
    },
    text: {
      de: "Übernimmt eine Antwort in den Matrix-Workspace als Entwurf. Submit bleibt derzeit fail-closed.",
      en: "Moves a response into the Matrix workspace as a draft. Submit currently stays fail-closed.",
    },
  },
  {
    title: "↯",
    headline: {
      de: "Für GitHub vorbereiten",
      en: "Prepare for GitHub",
    },
    text: {
      de: "Übergibt einen Ausschnitt in den Workbench-Flow für Review, Vorschlag und freigabegesteuerte Ausführung.",
      en: "Hands off an excerpt into the Workbench flow for review, proposal, and approval-gated execution.",
    },
  },
  {
    title: "⊡",
    headline: {
      de: "Kontext laden",
      en: "Load context",
    },
    text: {
      de: "Ziehe Repo, Datei oder Branch in den Chat, bevor du nach Details fragst.",
      en: "Pull repo, file, or branch into chat before asking for details.",
    },
  },
  {
    title: "⎘",
    headline: {
      de: "Kopieren",
      en: "Copy",
    },
    text: {
      de: "Nutze Outputs außerhalb der App oder kombiniere sie mit Matrix und GitHub.",
      en: "Use outputs outside the app or combine them with Matrix and GitHub.",
    },
  },
] as const;

const LANDING_ACTION_RECIPES = [
  {
    title: {
      de: "Chat → Matrix",
      en: "Chat → Matrix",
    },
    text: {
      de: "Lass dir eine Zusammenfassung erstellen, tippe ⊛ und übernimm sie als Matrix-Entwurf.",
      en: "Generate a summary, tap ⊛, and adopt it as a Matrix draft.",
    },
  },
  {
    title: {
      de: "Chat → GitHub",
      en: "Chat → GitHub",
    },
    text: {
      de: "Lass dir Review-Hinweise erstellen, tippe ↯ und bereite daraus Issue oder PR-Kommentar vor.",
      en: "Generate review hints, tap ↯, and prepare an issue or PR comment.",
    },
  },
  {
    title: {
      de: "GitHub → Chat",
      en: "GitHub → Chat",
    },
    text: {
      de: "Lade eine Datei in den Kontext und frage gezielt nach Risiken, Bugs oder Refactor-Optionen.",
      en: "Load a file into context and ask directly about risks, bugs, or refactor options.",
    },
  },
  {
    title: {
      de: "Matrix → Chat",
      en: "Matrix → Chat",
    },
    text: {
      de: "Nutze Scope-Zusammenfassung und Provenienz als Orientierung für neue Prompts und Entscheidungen.",
      en: "Use scope summaries and provenance as guidance for new prompts and decisions.",
    },
  },
] as const;

const LANDING_BEGINNER_FLOW = {
  de: [
    "Modellzugang verbinden",
    "Erste Frage stellen",
    "Repo oder Datei als Kontext laden",
    "Output in Workbench weiterreichen",
    "Matrix-Scope prüfen und Topic-Plan freigeben",
  ],
  en: [
    "Connect model access",
    "Ask your first question",
    "Load repo or file context",
    "Review the output",
    "Save or dispatch the result",
  ],
} as const;

const LANDING_POWER_RECIPES = [
  {
    title: {
      de: "Review Sprint",
      en: "Review Sprint",
    },
    text: {
      de: "Datei laden, Risiken prüfen, Kommentar vorbereiten.",
      en: "Load file, check risks, prepare comment.",
    },
  },
  {
    title: {
      de: "Knowledge Capture",
      en: "Knowledge Capture",
    },
    text: {
      de: "Antwort verdichten, als Matrix-Entwurf übergeben und im Scope verankern.",
      en: "Condense response, pass it as a Matrix draft, and anchor it in scope.",
    },
  },
  {
    title: {
      de: "Model Switch",
      en: "Model Switch",
    },
    text: {
      de: "Schnelles Modell für Reads, starkes Modell für Reviews.",
      en: "Fast model for reads, stronger model for reviews.",
    },
  },
  {
    title: {
      de: "Team Handoff",
      en: "Team Handoff",
    },
    text: {
      de: "Projektstand zusammenfassen, teilen, nächste Aktion ableiten.",
      en: "Summarize project status, share it, derive next action.",
    },
  },
] as const;

function LandingPage() {
  const { locale, setLocale, copy: ui } = useLocalization();
  const landingCopy = LANDING_COPY[locale];

  return (
    <main className="app-shell landing-shell" data-testid="readme-landing">
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-top">
          <div className="landing-brand-row">
            <span className="mosaicstacked-mark" aria-hidden="true">
              <MosaicStackedIcon />
            </span>
            <span>MosaicStacked</span>
          </div>
          <div className="shell-language-toggle landing-language-toggle" role="group" aria-label={ui.shell.languageLabel}>
            <button
              type="button"
              className={locale === "en" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
              aria-label={locale === "de" ? "Sprache: Englisch" : "Language: English"}
              data-testid="landing-locale-en"
            >
              {ui.shell.languageOptionEnglish}
            </button>
            <button
              type="button"
              className={locale === "de" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
              onClick={() => setLocale("de")}
              aria-pressed={locale === "de"}
              aria-label={locale === "de" ? "Sprache: Deutsch" : "Language: German"}
              data-testid="landing-locale-de"
            >
              {ui.shell.languageOptionGerman}
            </button>
          </div>
        </div>
        <p className="landing-kicker">{landingCopy.kicker}</p>
        <h1 id="landing-hero-title">{landingCopy.heroTitle}</h1>
        <p className="landing-hero-copy">
          {landingCopy.heroBody}
        </p>
        <div className="landing-hero-actions">
          <a className="landing-cta-primary" href="/console">
            {landingCopy.heroPrimaryCta}
          </a>
          <a className="landing-cta-secondary" href="#so-funktionierts">
            {landingCopy.heroSecondaryCta}
          </a>
        </div>
      </section>

      <section className="landing-section" id="so-funktionierts" aria-labelledby="landing-features-title">
        <header className="landing-section-header">
          <p className="landing-section-kicker">{landingCopy.workspaceTabsKicker}</p>
          <h2 id="landing-features-title">{landingCopy.workspaceTabsTitle}</h2>
        </header>
        <div className="landing-feature-grid">
          {LANDING_FEATURES.map((feature) => (
            <article className="landing-card" key={feature.key}>
              <div className="landing-card-icon" aria-hidden="true">
                {feature.icon}
              </div>
              <h3>{feature.title[locale]}</h3>
              <p>{feature.description[locale]}</p>
              <p className="landing-card-note">{feature.useCase[locale]}</p>
              <a href={feature.href}>{feature.title[locale]} {landingCopy.openSuffix}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-model-title">
        <header className="landing-section-header">
          <p className="landing-section-kicker">{landingCopy.modelKicker}</p>
          <h2 id="landing-model-title">{landingCopy.modelTitle}</h2>
          <p>
            {landingCopy.modelBody}
          </p>
        </header>
        <div className="landing-step-grid">
          {LANDING_MODEL_STEPS.map((step, index) => (
            <article className="landing-step-card" key={step.title[locale]}>
              <span className="landing-step-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title[locale]}</h3>
              <p>{step.text[locale]}</p>
            </article>
          ))}
        </div>
        <p className="landing-inline-note">
          <strong>{landingCopy.modelHintLabel}</strong> {landingCopy.modelHintBody}
        </p>
        <p className="landing-inline-note">
          <code>OPENROUTER_API_KEY</code> {landingCopy.modelSecretNote}
        </p>
      </section>

      <section className="landing-section" aria-labelledby="landing-actions-title">
        <header className="landing-section-header">
          <p className="landing-section-kicker">{landingCopy.actionsKicker}</p>
          <h2 id="landing-actions-title">{landingCopy.actionsTitle}</h2>
          <p>{landingCopy.actionsBody}</p>
        </header>
        <div className="landing-action-grid">
          {LANDING_ACTION_BUTTONS.map((action) => (
            <article className="landing-card landing-card-cheatsheet" key={`${action.title}-${locale}`}>
              <h3>{action.title} {action.headline[locale]}</h3>
              <p>{action.text[locale]}</p>
            </article>
          ))}
        </div>
        <div className="landing-mini-cheatsheet">
          {LANDING_ACTION_RECIPES.map((recipe) => (
            <article className="landing-cheat-row" key={recipe.title[locale]}>
              <strong>{recipe.title[locale]}</strong>
              <p>{recipe.text[locale]}</p>
            </article>
          ))}
        </div>
        <p className="landing-inline-note">
          {landingCopy.actionsExamplePrefix} {landingCopy.actionsExampleBody} <code>⊛</code> {landingCopy.actionsExampleTail} <code>↯</code> {locale === "de" ? "vor." : "."}
        </p>
      </section>

      <section className="landing-section" aria-labelledby="landing-beginner-title">
        <header className="landing-section-header">
          <p className="landing-section-kicker">{landingCopy.beginnerKicker}</p>
          <h2 id="landing-beginner-title">{landingCopy.beginnerTitle}</h2>
        </header>
        <ol className="landing-stepper">
          {LANDING_BEGINNER_FLOW[locale].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="landing-section" aria-labelledby="landing-power-title">
        <header className="landing-section-header">
          <p className="landing-section-kicker">{landingCopy.powerKicker}</p>
          <h2 id="landing-power-title">{landingCopy.powerTitle}</h2>
        </header>
        <div className="landing-recipe-grid">
          {LANDING_POWER_RECIPES.map((recipe) => (
            <article className="landing-card" key={recipe.title[locale]}>
              <h3>{recipe.title[locale]}</h3>
              <p>{recipe.text[locale]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-safety-note" aria-label={landingCopy.safetyLabel}>
        {landingCopy.safetyLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>

      <section className="landing-enter-section" aria-label={landingCopy.enterHint}>
        <a className="landing-cta-primary landing-enter-cta" href="/console">
          {landingCopy.enterLabel}
        </a>
      </section>
    </main>
  );
}

function PublicPreview() {
  return <LandingPage />;
}

function ReadmeLandingPage() {
  return <LandingPage />;
}

function RouteStatusLadder({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    value: string;
    tone?: "ready" | "partial" | "error" | "muted";
  }>;
}) {
  return (
    <div className="route-status-ladder" aria-label={title}>
      {rows.map((row) => (
        <div className={`route-status-step route-status-step-${row.tone ?? "muted"}`} key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ConsoleShell() {
  const persisted = readPersistedShellState();
  const { locale, setLocale, copy: ui } = useLocalization();
  useDarkOnlyTheme();
  const isMobileViewport = useIsMobileViewport();
  const appText = useMemo(
    () => locale === "de"
      ? {
          telemetryHealthLoaded: "Backend-Health geladen",
          telemetryHealthLoadedDetail: (service: string, modeLabel: string, allowedModelCount: number) =>
            `${service} meldet ${modeLabel} mit ${allowedModelCount} öffentlichen Modellen.`,
          telemetryHealthFailed: "Backend-Health fehlgeschlagen",
          telemetryHealthFailedDetail: "Kein Zugriff auf /health",
          telemetryModelAliasLoaded: "Öffentlicher Modellalias geladen",
          telemetryModelAliasLoadedDetail: (alias: string) =>
            `Alias ${alias} ausgewählt; Provider-Ziele bleiben backend-seitig.`,
          telemetryModelListFailed: "Modellliste fehlgeschlagen",
          telemetryModelListFailedDetail: "Kein Zugriff auf /models",
          telemetryDiagnosticsFailed: "Diagnostik nicht verfügbar",
          telemetryDiagnosticsFailedDetail: "Kein Zugriff auf /diagnostics",
          chatGovernancePendingApproval: "Freigabe ausstehend",
          chatGovernanceExecutionRunning: "Ausführung läuft",
          chatGovernanceLastExecutionConfirmed: "Letzte Ausführung bestätigt",
          chatGovernanceProposalRejected: "Vorschlag verworfen",
          chatGovernanceLastExecutionFailed: "Letzte Ausführung fehlgeschlagen",
          chatGovernanceNoOpenProposal: "Kein offener Vorschlag",
          sessionHeaderNote: "Wiederaufnehmbare Sessions pro Arbeitsbereich",
          processGoReview: "Workbench öffnen",
          processGoWorkspace: "Workspace öffnen",
          processCreateSession: "Neue Session",
        }
      : {
          telemetryHealthLoaded: "Backend health loaded",
          telemetryHealthLoadedDetail: (service: string, modeLabel: string, allowedModelCount: number) =>
            `${service} reports ${modeLabel} mode with ${allowedModelCount} public model(s).`,
          telemetryHealthFailed: "Backend health failed",
          telemetryHealthFailedDetail: "Unable to reach /health",
          telemetryModelAliasLoaded: "Public model alias loaded",
          telemetryModelAliasLoadedDetail: (alias: string) =>
            `Selected alias ${alias}; provider targets remain backend-owned.`,
          telemetryModelListFailed: "Model list failed",
          telemetryModelListFailedDetail: "Unable to reach /models",
          telemetryDiagnosticsFailed: "Diagnostics unavailable",
          telemetryDiagnosticsFailedDetail: "Unable to reach /diagnostics",
          chatGovernancePendingApproval: "Approval pending",
          chatGovernanceExecutionRunning: "Execution running",
          chatGovernanceLastExecutionConfirmed: "Last execution confirmed",
          chatGovernanceProposalRejected: "Proposal rejected",
          chatGovernanceLastExecutionFailed: "Last execution failed",
          chatGovernanceNoOpenProposal: "No open proposal",
          sessionHeaderNote: "Resumable sessions per workspace",
          processGoReview: "Open workbench",
          processGoWorkspace: "Open workspace",
          processCreateSession: "New session",
        },
    [locale],
  );
  const createDefaultGitHubContext = useCallback(
    (): GitHubWorkspaceStatus => ({
      repositoryLabel: ui.github.noRepoSelected,
      connectionLabel: ui.shell.healthChecking,
      accessLabel: ui.github.readOnly,
      analysisLabel: ui.github.nextStepAnalysis,
      proposalLabel: ui.github.proposalEmpty,
      approvalLabel: ui.common.none,
      resultLabel: ui.github.verifyResult,
      safetyText: ui.github.actionReadBody,
      expertDetails: {
        requestId: null,
        planId: null,
        branchName: null,
        apiStatus: ui.shell.healthChecking,
        sseEvents: [],
        rawDiffPreview: null,
        selectedRepoSlug: null,
      },
    }),
    [ui],
  );
  const createDefaultMatrixContext = useCallback(
    (): MatrixWorkspaceStatus => ({
      identityLabel: ui.shell.healthChecking,
      connectionLabel: ui.shell.healthChecking,
      homeserverLabel: ui.common.na,
      scopeLabel: ui.matrix.scopeUnresolved,
      summaryLabel: ui.matrix.scopeSummaryUnavailable,
      approvalLabel: ui.common.none,
      safetyText: ui.matrix.scopeNotice,
      expertDetails: {
        route: "/api/matrix/*",
        requestId: null,
        planId: null,
        roomId: null,
        spaceId: null,
        eventId: null,
        httpStatus: null,
        latency: null,
        backendRouteStatus: ui.shell.healthChecking,
        runtimeEventTrail: [],
        sseLifecycle: ui.common.loading,
        rawPayload: null,
        composerMode: "post",
        composerRoomId: null,
        composerEventId: null,
        composerThreadRootId: null,
        composerTargetLabel: ui.matrix.newPost,
      },
      reviewItems: [],
    }),
    [ui],
  );
  const [mode, setMode] = useState<WorkspaceMode>(
    () => readUrlWorkspaceMode() ?? normalizeWorkspaceMode(persisted?.activeTab) ?? "chat",
  );
  const [workMode, setWorkMode] = useState<WorkMode>(() => resolvePersistedWorkMode(persisted));
  const expertMode = isExpertMode(workMode);
  const workModeCopy = getWorkModeCopy(locale, workMode);
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(() => createDefaultGitHubContext());
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(() => createDefaultMatrixContext());
  const { reviewItems, githubReviewDirty, setGitHubReviewDirty, updateGitHubReviewItems, updateMatrixReviewItems } = useReviewState();
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const mobileSettingsLongPressRef = useRef<number | null>(null);
  const mobileSettingsLongPressTriggeredRef = useRef(false);
  const recordTelemetry = useCallback(
    (kind: TelemetryEntry["kind"], label: string, detail?: string) => {
      setTelemetry((current) =>
        appendTelemetry(current, {
          id: createId(),
          kind,
          label,
          detail,
        }),
      );
    },
    [],
  );
  const {
    backendHealthy,
    activeModelAlias,
    setActiveModelAlias,
    availableModels,
    modelRegistry,
    runtimeDiagnostics,
    integrationsStatus,
    githubCapabilities,
    runtimeJournalEntries,
    openRouterCredentialStatus,
    openRouterApiKeyInput,
    setOpenRouterApiKeyInput,
    openRouterModelInput,
    setOpenRouterModelInput,
    isSavingOpenRouterCredentials,
    isTestingOpenRouterCredentials,
    openRouterCredentialMessage,
    settingsVerificationResults,
    routingStatus,
    handleSaveOpenRouterCredentials,
    handleTestOpenRouterCredentials,
    handleSettingsVerifyConnection,
    handleIntegrationAction,
    buildSettingsIntegrationStartUrl,
  } = useRuntimeStatus({
    mode,
    locale,
    appText: {
      telemetryHealthLoaded: appText.telemetryHealthLoaded,
      telemetryHealthLoadedDetail: appText.telemetryHealthLoadedDetail,
      telemetryHealthFailed: appText.telemetryHealthFailed,
      telemetryHealthFailedDetail: appText.telemetryHealthFailedDetail,
      telemetryModelAliasLoaded: appText.telemetryModelAliasLoaded,
      telemetryModelAliasLoadedDetail: appText.telemetryModelAliasLoadedDetail,
      telemetryModelListFailed: appText.telemetryModelListFailed,
      telemetryModelListFailedDetail: appText.telemetryModelListFailedDetail,
      telemetryDiagnosticsFailed: appText.telemetryDiagnosticsFailed,
      telemetryDiagnosticsFailedDetail: appText.telemetryDiagnosticsFailedDetail,
    },
    onTelemetry: recordTelemetry,
  });
  const {
    workspaceState,
    setWorkspaceState,
    restoredSession,
    chatSession,
    githubSession,
    matrixSession,
    getWorkspaceSessions,
    handleWorkspaceSessionCreate: createWorkspaceSession,
    handleWorkspaceSessionSelect: selectWorkspaceSession,
    selectActiveWorkspaceSession,
    handleWorkspaceSessionArchive,
    handleWorkspaceSessionDelete,
    handleChatSessionChange,
    handleGitHubSessionChange,
    handleMatrixSessionChange,
  } = useWorkspaceSessions(activeModelAlias);
  const {
    pinnedChatContext,
    handleWorkspaceTabSelect,
    handlePinChatContext,
    handleClearPinnedChatContext,
    handleCrossTabCommand,
  } = useCrossTabCommands({
    locale,
    mode,
    setMode,
    githubReviewDirty,
    githubReviewConfirmNavigation: ui.github.reviewDirtyConfirmNavigation,
    setWorkspaceState,
    selectActiveWorkspaceSession,
    recordTelemetry,
  });

  useEffect(() => {
    persistShellState({
      activeTab: mode,
      workMode,
      expertMode,
    });
  }, [expertMode, mode, workMode]);

  useEffect(() => {
    replaceConsoleUrl(mode);
  }, [mode]);

  useEffect(() => {
    setMobileContextOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileContextOpen(false);
    }
  }, [isMobileViewport]);

  const handleWorkspaceSessionCreate = useCallback((workspace: WorkspaceKind) => {
    setMode(toWorkspaceMode(workspace));
    createWorkspaceSession(workspace);
  }, [createWorkspaceSession]);

  const handleWorkspaceSessionSelect = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setMode(toWorkspaceMode(workspace));
    selectWorkspaceSession(workspace, sessionId);
  }, [selectWorkspaceSession]);

  const handleMobileNavSelect = useCallback((nextMode: WorkspaceMode) => {
    setMobileContextOpen(false);
    handleWorkspaceTabSelect(nextMode);
  }, [handleWorkspaceTabSelect]);

  const handleMobileContextToggle = useCallback(() => {
    setMobileContextOpen((current) => !current);
  }, []);

  const handleMobileBrandPointerDown = useCallback(() => {
    if (!isMobileViewport) {
      return;
    }

    mobileSettingsLongPressTriggeredRef.current = false;
    mobileSettingsLongPressRef.current = globalThis.setTimeout(() => {
      mobileSettingsLongPressTriggeredRef.current = true;
      setMobileContextOpen(false);
      handleWorkspaceTabSelect("settings");
    }, 650);
  }, [handleWorkspaceTabSelect, isMobileViewport]);

  const clearMobileBrandLongPress = useCallback(() => {
    if (mobileSettingsLongPressRef.current !== null) {
      globalThis.clearTimeout(mobileSettingsLongPressRef.current);
      mobileSettingsLongPressRef.current = null;
    }
  }, []);

  const handleMobileBrandClick = useCallback(() => {
    if (mobileSettingsLongPressTriggeredRef.current) {
      mobileSettingsLongPressTriggeredRef.current = false;
      return;
    }

    handleWorkspaceTabSelect("chat");
  }, [handleWorkspaceTabSelect]);

  useEffect(() => () => {
    clearMobileBrandLongPress();
  }, [clearMobileBrandLongPress]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!hasPrimaryModifier(event)) {
        if (event.key === "Escape") {
          if (paletteOpen) {
            event.preventDefault();
            setPaletteOpen(false);
            setPaletteQuery("");
            return;
          }

          if (mobileContextOpen) {
            event.preventDefault();
            setMobileContextOpen(false);
          }
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (event.shiftKey && key === "e") {
        event.preventDefault();
        setWorkMode((current) => current === "expert" ? "beginner" : "expert");
        return;
      }

      if (event.shiftKey) {
        return;
      }

      if (key === "1") {
        event.preventDefault();
        handleWorkspaceTabSelect("chat");
      } else if (key === "2") {
        event.preventDefault();
        handleWorkspaceTabSelect("workbench");
      } else if (key === "3") {
        event.preventDefault();
        handleWorkspaceTabSelect("matrix");
      } else if (key === "4") {
        event.preventDefault();
        handleWorkspaceTabSelect("settings");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleWorkspaceTabSelect, mobileContextOpen, paletteOpen]);

  const sessionWorkspace: WorkspaceKind = isSessionWorkspace(mode) ? toWorkspaceKind(mode) : workspaceState.activeWorkspace;
  const sessionWorkspaceSessions = getWorkspaceSessions(sessionWorkspace);
  const sessionWorkspaceActiveId = workspaceState.activeSessionIdByWorkspace[sessionWorkspace];
  const activeSession = sessionWorkspaceSessions.find((session) => session.id === sessionWorkspaceActiveId) ?? sessionWorkspaceSessions[0] ?? null;
  const freshness: ShellFreshness = deriveShellFreshness({
    backendHealthy,
    restoredSession,
  });
  const freshnessLabel = freshness === "backend-fresh"
    ? (locale === "de" ? "backend-fresh" : "backend-fresh")
    : freshness === "local-restored"
      ? (locale === "de" ? "local-restored" : "local-restored")
      : (locale === "de" ? "stale" : "stale");
  const freshnessHint = freshness === "backend-fresh"
    ? (locale === "de" ? "Live-Backend-Status" : "Live backend status")
    : freshness === "local-restored"
      ? (locale === "de" ? "Aus lokalem Restore geladen" : "Loaded from local restore")
      : (locale === "de" ? "Veraltet oder nicht erreichbar" : "Stale or unreachable");
  const workbenchTabLabel = `${ui.shell.workspaceTabs.workbench.label}${githubReviewDirty ? " •" : ""}`;
  const matrixDraftDefaultRoomId = matrixSession?.metadata.roomId?.trim()
    || matrixSession?.metadata.topicRoomId?.trim()
    || matrixSession?.metadata.selectedRoomIds[0]?.trim()
    || null;
  const matrixDraftRoomOptions = useMemo(() => {
    const candidates = [
      matrixSession?.metadata.roomId,
      matrixSession?.metadata.topicRoomId,
      matrixSession?.metadata.provenanceRoomId,
      ...(matrixSession?.metadata.selectedRoomIds ?? []),
    ];
    const next: string[] = [];
    for (const value of candidates) {
      const trimmed = value?.trim();
      if (!trimmed || next.includes(trimmed)) {
        continue;
      }
      next.push(trimmed);
    }
    return next;
  }, [
    matrixSession?.metadata.provenanceRoomId,
    matrixSession?.metadata.roomId,
    matrixSession?.metadata.selectedRoomIds,
    matrixSession?.metadata.topicRoomId,
  ]);
  const hasRepoContext = Boolean(githubSession?.metadata.selectedRepoFullName);
  const workbenchRepoBinding = githubSession?.metadata.selectedRepoFullName ?? null;
  const workbenchBranchBinding =
    githubContext.expertDetails.branchName
    ?? githubSession?.metadata.proposalPlan?.branchName
    ?? githubSession?.metadata.proposalPlan?.baseRef
    ?? githubSession?.metadata.analysisBundle?.ref
    ?? null;
  const workbenchScopeBinding =
    githubSession?.metadata.proposalPlan?.diff[0]?.path
    ?? githubSession?.metadata.analysisBundle?.files[0]?.path
    ?? null;
  const repoChipLabel = hasRepoContext
    ? `⊟ ${githubSession?.metadata.selectedRepoFullName}`
    : (locale === "de" ? "⊡ Kein Kontext" : "⊡ No context");
  const branchChipLabel = hasRepoContext
    ? (
        githubContext.expertDetails.branchName
        ?? githubSession?.metadata.proposalPlan?.baseRef
        ?? githubSession?.metadata.analysisBundle?.ref
        ?? ui.common.na
      )
    : (locale === "de" ? "Tippe ⊡ für Repo" : "Tap ⊡ to load repo");
  const fileChipLabel = hasRepoContext
    ? (
        githubSession?.metadata.analysisBundle?.files[0]?.path
        ?? githubSession?.metadata.proposalPlan?.diff[0]?.path
        ?? (locale === "de" ? "Keine Datei" : "No file")
      )
    : (locale === "de" ? "Datei wählen" : "Choose a file");

  const chatPendingProposal = chatSession?.metadata.chatState.pendingProposal ?? null;
  const chatLatestReceipt = chatSession?.metadata.chatState.receipts.at(-1) ?? null;
  const chatGovernanceState = chatPendingProposal
    ? chatPendingProposal.status === "pending"
      ? appText.chatGovernancePendingApproval
      : appText.chatGovernanceExecutionRunning
    : chatLatestReceipt
      ? chatLatestReceipt.outcome === "executed"
        ? appText.chatGovernanceLastExecutionConfirmed
        : chatLatestReceipt.outcome === "rejected"
          ? appText.chatGovernanceProposalRejected
          : appText.chatGovernanceLastExecutionFailed
      : appText.chatGovernanceNoOpenProposal;

  const chatRows: StatusPanelRow[] = [
    { label: ui.github.modelLabel, value: activeModelAlias ?? ui.common.none },
    { label: ui.review.rowClassification, value: chatGovernanceState },
    {
      label: ui.shell.healthTitle,
      value:
        backendHealthy === true
          ? ui.shell.healthReady
          : backendHealthy === false
            ? ui.shell.healthUnavailable
            : ui.shell.healthChecking,
    },
  ];
  const githubConfigured = runtimeDiagnostics?.github.configured ?? null;
  const githubReady = runtimeDiagnostics?.github.ready ?? null;
  const githubAccountLabel = githubConfigured === false || githubReady === false
    ? ui.settings.notConfigured
    : githubConfigured === null || githubReady === null
      ? ui.shell.healthChecking
      : ui.settings.configured;
  const githubAccessLabel = githubConfigured === false || githubReady === false
    ? ui.settings.notConfigured
    : githubContext.accessLabel;

  const githubRows: StatusPanelRow[] = [
    { label: ui.github.connectedRepo, value: githubContext.repositoryLabel },
    { label: ui.settings.githubConnection, value: githubContext.connectionLabel },
    { label: ui.github.readOnly, value: githubAccessLabel },
    ...(githubContext.approvalLabel !== ui.common.none
      ? [{ label: ui.review.approvalNeeded, value: githubContext.approvalLabel }]
      : []),
  ];

  const matrixRows: StatusPanelRow[] = [
    { label: ui.settings.matrixIdentity, value: matrixContext.identityLabel },
    { label: ui.settings.matrixConnection, value: matrixContext.connectionLabel },
    { label: ui.matrix.scopeSelectedLabel, value: matrixContext.scopeLabel },
    { label: ui.matrix.scopeSummaryTitle, value: matrixContext.summaryLabel },
    ...(matrixContext.approvalLabel !== ui.common.none
      ? [{ label: ui.review.approvalNeeded, value: matrixContext.approvalLabel }]
      : []),
  ];
  const routeOwnershipRows = mode === "workbench"
    ? [
        {
          label: "identity",
          value: githubAccountLabel,
          tone: githubReady === true ? "ready" as const : githubReady === false ? "error" as const : "partial" as const,
        },
        {
          label: "config",
          value: runtimeDiagnostics?.github.configured ? ui.settings.configured : runtimeDiagnostics ? ui.settings.notConfigured : ui.shell.healthChecking,
          tone: runtimeDiagnostics?.github.configured ? "ready" as const : runtimeDiagnostics ? "error" as const : "partial" as const,
        },
        {
          label: "scope",
          value: githubContext.repositoryLabel,
          tone: githubContext.repositoryLabel === ui.github.noRepoSelected ? "partial" as const : "ready" as const,
        },
        {
          label: "execute",
          value: githubContext.approvalLabel,
          tone: githubContext.approvalLabel === ui.common.none ? "muted" as const : "partial" as const,
        },
        {
          label: "verify",
          value: githubContext.resultLabel,
          tone: githubContext.resultLabel === ui.github.verifyResult ? "muted" as const : "ready" as const,
        },
      ]
    : mode === "matrix"
      ? [
          {
            label: "identity",
            value: matrixContext.identityLabel,
            tone: runtimeDiagnostics?.matrix.configured ? "ready" as const : runtimeDiagnostics ? "error" as const : "partial" as const,
          },
          {
            label: "rooms",
            value: matrixContext.connectionLabel,
            tone: matrixContext.connectionLabel === ui.shell.healthChecking ? "partial" as const : "ready" as const,
          },
          {
            label: "scope",
            value: matrixContext.scopeLabel,
            tone: matrixContext.scopeLabel === ui.matrix.scopeUnresolved ? "partial" as const : "ready" as const,
          },
          {
            label: "analyze",
            value: matrixContext.summaryLabel,
            tone: matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable ? "muted" as const : "ready" as const,
          },
          {
            label: "execute",
            value: matrixContext.approvalLabel,
            tone: matrixContext.approvalLabel === ui.common.none ? "muted" as const : "partial" as const,
          },
          {
            label: "verify",
            value: matrixContext.expertDetails.sseLifecycle,
            tone: matrixContext.expertDetails.sseLifecycle === ui.common.loading ? "muted" as const : "ready" as const,
          },
        ]
      : [];

  const defaultFreeStatus: SettingsTruthSnapshot["models"]["defaultFreeStatus"] = backendHealthy === false
    ? "unavailable"
    : openRouterCredentialStatus.defaultFree.status;

  const settingsTruthSnapshot: SettingsTruthSnapshot = {
    backend: {
      label:
        backendHealthy === false
          ? ui.shell.healthUnavailable
          : backendHealthy === true
            ? ui.shell.healthReady
            : ui.shell.healthChecking,
      detail:
        backendHealthy === false
          ? ui.shell.healthUnavailableDetail
          : backendHealthy === true
            ? ui.shell.healthReadyDetail
            : ui.shell.healthCheckingDetail,
    },
    github: {
      sessionLabel: githubAccountLabel,
      connectionLabel: githubContext.connectionLabel,
      repositoryLabel: githubContext.repositoryLabel,
      accessLabel: githubAccessLabel,
    },
    matrix: {
      identityLabel: matrixContext.identityLabel,
      connectionLabel: matrixContext.connectionLabel,
      homeserverLabel: matrixContext.homeserverLabel,
      scopeLabel: matrixContext.scopeLabel,
    },
    models: {
      activeAlias: activeModelAlias ?? ui.common.none,
      availableCount: availableModels.length,
      registrySourceLabel: modelRegistry.length > 0 ? "backend-policy" : ui.common.na,
      defaultFreeStatus,
    },
    diagnostics: {
      runtimeMode: runtimeDiagnostics?.runtimeMode ?? ui.settings.unavailable,
      defaultPublicAlias: runtimeDiagnostics?.models.defaultPublicAlias ?? ui.settings.unavailable,
      publicAliases: runtimeDiagnostics?.models.publicAliases.join(", ") || ui.settings.unavailable,
      routingMode: runtimeDiagnostics?.routing.mode ?? ui.settings.unavailable,
      fallbackEnabled: runtimeDiagnostics
        ? (runtimeDiagnostics.routing.allowFallback ? ui.common.active : ui.common.inactive)
        : ui.settings.unavailable,
      failClosed: runtimeDiagnostics
        ? (runtimeDiagnostics.routing.failClosed ? ui.common.active : ui.common.inactive)
        : ui.settings.unavailable,
      rateLimitEnabled: runtimeDiagnostics
        ? (runtimeDiagnostics.rateLimit.enabled ? ui.common.active : ui.common.inactive)
        : ui.settings.unavailable,
      rateLimitDefaults: runtimeDiagnostics
        ? `chat:${runtimeDiagnostics.rateLimit.limits.chat}, auth:${runtimeDiagnostics.rateLimit.limits.auth_login}, gh-propose:${runtimeDiagnostics.rateLimit.limits.github_propose}, gh-exec:${runtimeDiagnostics.rateLimit.limits.github_execute}, matrix-exec:${runtimeDiagnostics.rateLimit.limits.matrix_execute}`
        : "chat:30, auth:8, gh-propose:10, gh-exec:6, matrix-exec:6",
      actionStoreMode: runtimeDiagnostics?.actionStore.mode ?? ui.settings.unavailable,
      githubConfigured: runtimeDiagnostics
        ? (runtimeDiagnostics.github.configured ? ui.settings.configured : ui.settings.notConfigured)
        : ui.settings.unavailable,
      matrixConfigured: runtimeDiagnostics
        ? (runtimeDiagnostics.matrix.configured ? ui.settings.configured : ui.settings.notConfigured)
        : ui.settings.unavailable,
      generatedAt: runtimeDiagnostics?.diagnosticsGeneratedAt ?? ui.settings.unavailable,
      uptimeMs: runtimeDiagnostics ? String(runtimeDiagnostics.uptimeMs) : ui.settings.unavailable,
      chatRequests: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatRequests) : ui.settings.unavailable,
      chatStreamStarted: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamStarted) : ui.settings.unavailable,
      chatStreamCompleted: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamCompleted) : ui.settings.unavailable,
      chatStreamError: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamError) : ui.settings.unavailable,
      chatStreamAborted: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamAborted) : ui.settings.unavailable,
      upstreamError: runtimeDiagnostics ? String(runtimeDiagnostics.counters.upstreamError) : ui.settings.unavailable,
      rateLimitBlocked: runtimeDiagnostics
        ? `chat:${runtimeDiagnostics.rateLimit.blockedByScope.chat}, auth:${runtimeDiagnostics.rateLimit.blockedByScope.auth_login}, gh-propose:${runtimeDiagnostics.rateLimit.blockedByScope.github_propose}, gh-exec:${runtimeDiagnostics.rateLimit.blockedByScope.github_execute}, matrix-exec:${runtimeDiagnostics.rateLimit.blockedByScope.matrix_execute}`
        : ui.settings.unavailable,
    },
    journal: {
      status: runtimeDiagnostics?.journal.enabled ? ui.settings.configured : ui.settings.journalUnavailable,
      mode: runtimeDiagnostics?.journal.mode ?? ui.settings.unavailable,
      retention: runtimeDiagnostics
        ? `${runtimeDiagnostics.journal.recentCount}/${runtimeDiagnostics.journal.maxEntries}`
        : ui.settings.unavailable,
      recentCount: runtimeDiagnostics ? String(runtimeDiagnostics.journal.recentCount) : ui.settings.unavailable,
      entries: runtimeJournalEntries.slice(0, 12)
    }
  };

  const settingsLoginAdapters = useMemo(() => deriveSettingsLoginAdapters({
    copy: {
      checking: ui.shell.healthChecking,
      unavailable: ui.shell.healthUnavailable,
      none: ui.common.none,
    },
    integrations: integrationsStatus
  }), [
    integrationsStatus,
    ui.common.none,
    ui.shell.healthChecking,
    ui.shell.healthUnavailable
  ]);

  const settingsRows: StatusPanelRow[] = [
    { label: ui.settings.backend, value: settingsTruthSnapshot.backend.label },
    { label: ui.shell.workspaceTabs.workbench.label, value: `${settingsTruthSnapshot.github.sessionLabel} · ${settingsTruthSnapshot.github.accessLabel}` },
    { label: ui.shell.workspaceTabs.matrix.label, value: `${settingsTruthSnapshot.matrix.identityLabel} · ${settingsTruthSnapshot.matrix.connectionLabel}` },
    { label: ui.settings.modelCardTitle, value: settingsTruthSnapshot.models.activeAlias },
  ];

  const currentRows = useMemo(() => {
    switch (mode) {
      case "workbench":
        return githubRows;
      case "matrix":
        return matrixRows;
      case "settings":
        return settingsRows;
      default:
        return chatRows;
    }
  }, [chatRows, githubRows, matrixRows, mode, settingsRows]);

  const currentStatusBadge = useMemo(() => {
    switch (mode) {
      case "workbench":
        if (githubContext.connectionLabel !== ui.shell.statusReady) {
          return githubContext.connectionLabel;
        }

        if (githubContext.approvalLabel !== ui.common.none && githubContext.approvalLabel !== ui.github.nextStepReadOnly) {
          return ui.review.approvalNeeded;
        }

        if (githubContext.repositoryLabel === ui.github.noRepoSelected) {
          return ui.github.repoSelectLabel;
        }

        return githubContext.connectionLabel;
      case "matrix":
        if (matrixContext.connectionLabel !== ui.shell.statusReady) {
          return matrixContext.connectionLabel;
        }

        if (matrixContext.approvalLabel !== ui.common.none && matrixContext.approvalLabel !== ui.shell.statusReady) {
          return ui.review.approvalNeeded;
        }

        if (matrixContext.scopeLabel === ui.matrix.scopeUnresolved) {
          return ui.matrix.scopeSelected;
        }

        if (matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable) {
          return ui.matrix.scopeSummaryReady;
        }

        return ui.shell.statusReady;
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.statusError;
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return ui.shell.statusError;
        }

        if (!activeModelAlias) {
          return ui.shell.statusPartial;
        }

        return ui.shell.statusReady;
      default:
        if (chatPendingProposal?.status === "pending") {
          return ui.review.approvalNeeded;
        }

        if (chatPendingProposal?.status === "executing") {
          return ui.chat.executingTitle;
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return ui.shell.statusError;
        }

        return backendHealthy === false ? ui.shell.healthUnavailable : backendHealthy === true ? ui.shell.healthReady : ui.shell.healthChecking;
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    activeModelAlias,
    matrixContext.approvalLabel,
    matrixContext.connectionLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
  ]);

  const healthState = useMemo(() => getShellHealthCopy(locale, backendHealthy), [backendHealthy, locale]);
  const approvalSummary = useMemo(() => {
    const base = summarizePendingApprovals(reviewItems);
    const chatPending = chatPendingProposal?.status === "pending" ? 1 : 0;
    return {
      ...base,
      pending: base.pending + chatPending,
      hasApprovals: base.hasApprovals || chatPending > 0,
      chatPending,
    };
  }, [chatPendingProposal?.status, reviewItems]);
  const workspaceTabLabels = useMemo(() => ({
    chat: ui.shell.workspaceTabs.chat.label,
    workbench: workbenchTabLabel,
    matrix: ui.shell.workspaceTabs.matrix.label,
    settings: ui.shell.workspaceTabs.settings.label,
  }), [ui.shell.workspaceTabs.chat.label, ui.shell.workspaceTabs.matrix.label, ui.shell.workspaceTabs.settings.label, workbenchTabLabel]);
  const workspaceName = workspaceTabLabels[mode];
  const nextStepTitle = ui.review.nextStepLabel;
  const matrixReadAvailable = integrationsStatus?.matrix.capabilities.read === "available";

  useEffect(() => {
    if (!paletteOpen) {
      setPaletteQuery("");
    }
  }, [paletteOpen]);

  const paletteEntries = useMemo<NavigationPaletteEntry[]>(() => {
    const tabEntries: NavigationPaletteEntry[] = WORKSPACE_MODES.map((workspaceMode) => ({
      id: `tab:${workspaceMode}`,
      kind: "tab",
      label: workspaceTabLabels[workspaceMode],
      detail: locale === "de" ? "Navigation" : "Navigation",
      mode: workspaceMode,
      onSelect: () => {
        handleWorkspaceTabSelect(workspaceMode);
        setPaletteOpen(false);
      },
    }));

    const sessionEntries: NavigationPaletteEntry[] = (["chat", "github", "matrix"] as const).flatMap((workspace) => {
      const workspaceMode = toWorkspaceMode(workspace);
      const workspaceSessions = getWorkspaceSessions(workspace);
      return workspaceSessions
        .filter((session) => !session.archived)
        .map((session) => ({
          id: `session:${workspace}:${session.id}`,
          kind: "session" as const,
          label: session.title,
          detail: `${workspaceTabLabels[workspaceMode]} · ${session.status}`,
          mode: workspaceMode,
          onSelect: () => {
            handleWorkspaceSessionSelect(workspace, session.id);
            setPaletteOpen(false);
          },
        }));
    });

    return [...tabEntries, ...sessionEntries];
  }, [getWorkspaceSessions, handleWorkspaceSessionSelect, handleWorkspaceTabSelect, locale, workspaceTabLabels]);

  const filteredPaletteEntries = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) {
      return paletteEntries;
    }

    return paletteEntries.filter((entry) => (
      entry.label.toLowerCase().includes(query)
      || entry.detail.toLowerCase().includes(query)
    ));
  }, [paletteEntries, paletteQuery]);

  const currentStatusTone = useMemo(() => {
    switch (mode) {
      case "workbench":
        if (githubContext.connectionLabel !== ui.shell.statusReady) {
          return githubContext.connectionLabel === ui.shell.statusError ? "error" : "partial";
        }

        return githubContext.approvalLabel !== ui.common.none || githubContext.repositoryLabel === ui.github.noRepoSelected
          ? "partial"
          : "ready";
      case "matrix":
        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return "error";
        }

        if (matrixContext.connectionLabel !== ui.shell.statusReady) {
          return "partial";
        }

        return matrixContext.approvalLabel !== ui.common.none || matrixContext.scopeLabel === ui.matrix.scopeUnresolved || matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable
          ? "partial"
          : "ready";
      case "settings":
        if (backendHealthy === false) {
          return "error";
        }

        if (matrixContext.connectionLabel === ui.shell.healthChecking) {
          return "partial";
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return "error";
        }

        if (!activeModelAlias) {
          return "partial";
        }

        return "ready";
      default:
        if (chatPendingProposal?.status === "pending" || chatPendingProposal?.status === "executing") {
          return "partial";
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return "error";
        }

        return backendHealthy === false ? "error" : backendHealthy === true ? "ready" : "partial";
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    activeModelAlias,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
  ]);

  const currentHelperText = useMemo(() => {
    switch (mode) {
      case "workbench":
        if (githubContext.approvalLabel !== ui.common.none) {
          return ui.github.approveHelper;
        }

        if (githubContext.repositoryLabel === ui.github.noRepoSelected) {
          return ui.github.workspaceNoticeSelection;
        }

        return ui.github.actionReadBody;
      case "matrix":
        if (matrixContext.scopeLabel === ui.matrix.scopeSelected) {
          return ui.matrix.scopeSummaryInfo;
        }

        if (matrixContext.approvalLabel !== ui.common.none) {
          return ui.matrix.topicStatusApproval;
        }

        if (matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable) {
          return ui.matrix.scopeSummaryInfo;
        }

        return ui.matrix.scopeNotice;
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.healthUnavailableDetail;
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return ui.matrix.topicStatusUnavailable;
        }

        return expertMode
          ? ui.settings.connectionTruthNote
          : ui.shell.diagnosticsHidden;
      default:
        if (chatPendingProposal?.status === "pending") {
          return ui.chat.proposalHelper;
        }

        if (chatPendingProposal?.status === "executing") {
          return ui.chat.composerLocked.execution;
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return ui.chat.composerLocked.backend;
        }

        return backendHealthy === false
          ? ui.chat.composerLocked.backend
          : ui.chat.intro;
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    expertMode,
    githubContext.approvalLabel,
    githubContext.repositoryLabel,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
  ]);

  const clearTelemetry = useCallback(() => {
    setTelemetry([]);
  }, []);
  const workbenchBinding = useMemo(
    () => ({
      repo: workbenchRepoBinding,
      branch: workbenchBranchBinding,
      scope: workbenchScopeBinding,
    }),
    [workbenchBranchBinding, workbenchRepoBinding, workbenchScopeBinding],
  );
  const chatWorkspaceProps = useMemo(
    () => ({
      session: chatSession,
      workMode,
      backendHealthy,
      routingStatus,
      activeModelAlias,
      availableModels,
      modelRegistry,
      onActiveModelAliasChange: setActiveModelAlias,
      onTelemetry: recordTelemetry,
      onSessionChange: handleChatSessionChange,
      pinnedContext: pinnedChatContext,
      onClearPinnedContext: handleClearPinnedChatContext,
      matrixDraftDefaultRoomId,
      matrixDraftRoomOptions,
      workbenchBinding,
      onCrossTabCommand: (command: CrossTabCommand) => {
        handleCrossTabCommand(command);
      },
    }),
    [
      activeModelAlias,
      availableModels,
      backendHealthy,
      chatSession,
      handleChatSessionChange,
      handleClearPinnedChatContext,
      handleCrossTabCommand,
      matrixDraftDefaultRoomId,
      matrixDraftRoomOptions,
      modelRegistry,
      pinnedChatContext,
      recordTelemetry,
      routingStatus,
      setActiveModelAlias,
      workMode,
      workbenchBinding,
    ],
  );
  const githubWorkspaceProps = useMemo(
    () => ({
      session: githubSession,
      backendHealthy,
      workMode,
      onTelemetry: recordTelemetry,
      onContextChange: setGitHubContext,
      onReviewItemsChange: updateGitHubReviewItems,
      onReviewDirtyChange: setGitHubReviewDirty,
      onPinChatContext: handlePinChatContext,
      onSessionChange: handleGitHubSessionChange,
      githubIntegration: integrationsStatus?.github ?? null,
      githubCapabilities,
      onIntegrationAction: handleIntegrationAction,
    }),
    [
      backendHealthy,
      githubSession,
      handleGitHubSessionChange,
      handleIntegrationAction,
      handlePinChatContext,
      githubCapabilities,
      integrationsStatus?.github,
      recordTelemetry,
      setGitHubReviewDirty,
      updateGitHubReviewItems,
      workMode,
    ],
  );
  const matrixWorkspaceProps = useMemo(
    () => ({
      session: matrixSession,
      restoredSession,
      workMode,
      expertMode,
      matrixReadAvailable,
      matrixHierarchyEnabled: MATRIX_HIERARCHY_ENABLED,
      onTelemetry: recordTelemetry,
      onContextChange: setMatrixContext,
      onReviewItemsChange: updateMatrixReviewItems,
      onSessionChange: handleMatrixSessionChange,
      onQueueChatDraft: (content: string) => {
        handleCrossTabCommand({
          type: "QueueChatDraft",
          payload: {
            content,
            source: "matrix",
          },
        });
      },
    }),
    [
      expertMode,
      handleMatrixSessionChange,
      handleCrossTabCommand,
      matrixReadAvailable,
      matrixSession,
      recordTelemetry,
      restoredSession,
      updateMatrixReviewItems,
      workMode,
    ],
  );
  const settingsWorkspaceProps = useMemo(
    () => ({
      workMode,
      onWorkModeChange: setWorkMode,
      diagnostics: telemetry as DiagnosticEntry[],
      onClearDiagnostics: clearTelemetry,
      truthSnapshot: settingsTruthSnapshot,
      loginAdapters: settingsLoginAdapters,
      openRouterCredentialStatus,
      openRouterApiKeyInput,
      openRouterModelInput,
      onOpenRouterApiKeyInputChange: setOpenRouterApiKeyInput,
      onOpenRouterModelInputChange: setOpenRouterModelInput,
      onSaveOpenRouterCredentials: handleSaveOpenRouterCredentials,
      onTestOpenRouterCredentials: handleTestOpenRouterCredentials,
      isSavingOpenRouterCredentials,
      isTestingOpenRouterCredentials,
      openRouterCredentialMessage,
      buildIntegrationStartUrl: buildSettingsIntegrationStartUrl,
      onIntegrationAction: handleIntegrationAction,
      verificationResults: settingsVerificationResults,
      onVerifyConnection: handleSettingsVerifyConnection,
    }),
    [
      buildSettingsIntegrationStartUrl,
      clearTelemetry,
      handleIntegrationAction,
      handleSaveOpenRouterCredentials,
      handleSettingsVerifyConnection,
      handleTestOpenRouterCredentials,
      isSavingOpenRouterCredentials,
      isTestingOpenRouterCredentials,
      openRouterApiKeyInput,
      openRouterCredentialMessage,
      openRouterCredentialStatus,
      openRouterModelInput,
      setOpenRouterApiKeyInput,
      setOpenRouterModelInput,
      settingsLoginAdapters,
      settingsTruthSnapshot,
      settingsVerificationResults,
      telemetry,
      workMode,
    ],
  );
  const workspaceSurface = mode === "chat" ? (
    <ChatWorkspace
      key={chatSession?.id ?? "chat-session"}
      {...chatWorkspaceProps}
    />
  ) : mode === "workbench" ? (
    <GitHubWorkspace
      key={githubSession?.id ?? "github-session"}
      {...githubWorkspaceProps}
    />
  ) : mode === "matrix" ? (
    <MatrixWorkspace
      key={matrixSession?.id ?? "matrix-session"}
      {...matrixWorkspaceProps}
    />
  ) : (
    <SettingsWorkspace {...settingsWorkspaceProps} />
  );
  const statusToneForBadge = currentStatusTone === "error" ? "error" : currentStatusTone === "ready" ? "ready" : "partial";
  const activeMobileNav = mode;
  const mobileContextStatus: { label: MobileContextStatus; tone: MobileContextStatus } = (() => {
    if (mode === "chat") {
      if (chatSession?.metadata.chatState.connectionState === "streaming" || chatSession?.metadata.chatState.connectionState === "submitting") {
        return { label: "streaming", tone: "streaming" };
      }

      if (chatPendingProposal?.status === "pending" || chatPendingProposal?.status === "executing") {
        return { label: "pending", tone: "pending" };
      }

      if (
        chatSession?.metadata.chatState.connectionState === "error"
        || chatSession?.metadata.chatState.lastError
        || chatLatestReceipt?.outcome === "failed"
        || chatLatestReceipt?.outcome === "unverifiable"
      ) {
        return { label: "error", tone: "error" };
      }

      return { label: "idle", tone: "idle" };
    }

    if (currentStatusTone === "error") {
      return { label: "error", tone: "error" };
    }

    if (currentStatusTone === "partial") {
      return { label: "pending", tone: "pending" };
    }

    return { label: "idle", tone: "idle" };
  })();
  const showRouteOwnershipContext = mode === "workbench" || mode === "matrix";
  const mobileWorkspaceSurface = workspaceSurface;
  const handleCompanionQuestion = useCallback(async (question: string) => {
    if (backendHealthy !== true) {
      const unavailableCopy = locale === "de"
        ? "Backend derzeit nicht erreichbar. Prüfe die Verbindung in Settings."
        : "Backend is currently unreachable. Check connectivity in Settings.";
      recordTelemetry("warning", "Helpdesk companion blocked", unavailableCopy);
      return unavailableCopy;
    }

    try {
      const response = await requestChatCompletion({
        modelAlias: DEFAULT_FREE_MODEL_ALIAS,
        messages: [
          {
            role: "user",
            content: question,
          },
        ],
      });
      recordTelemetry("info", "Helpdesk companion reply", `Alias ${response.model} returned a backend answer.`);
      return response.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Companion backend request failed";
      recordTelemetry("warning", "Helpdesk companion failed", message);
      return locale === "de"
        ? "Companion konnte die Antwort nicht laden. Prüfe Backend und Modellzugang."
        : "Companion could not load a response. Check backend and model access.";
    }
  }, [backendHealthy, locale, recordTelemetry]);
  const floatingCompanion = (
    <FloatingCompanion
      locale={locale}
      onSubmitQuestion={handleCompanionQuestion}
    />
  );
  const paletteOverlay = paletteOpen ? (
    <>
      <button
        type="button"
        className="palette-backdrop"
        onClick={() => setPaletteOpen(false)}
        aria-label={locale === "de" ? "Command Palette schließen" : "Close command palette"}
      />
      <section className="command-palette" role="dialog" aria-label={locale === "de" ? "Command Palette" : "Command palette"}>
        <header className="command-palette-header">
          <strong>{locale === "de" ? "Command Palette" : "Command Palette"}</strong>
          <button type="button" className="ghost-button" onClick={() => setPaletteOpen(false)}>
            Esc
          </button>
        </header>
        <input
          type="search"
          value={paletteQuery}
          onChange={(event) => setPaletteQuery(event.target.value)}
          placeholder={locale === "de" ? "Tabs oder Sessions suchen…" : "Search tabs or sessions..."}
          autoFocus
        />
        <div className="command-palette-results" role="listbox">
          {filteredPaletteEntries.length === 0 ? (
            <p className="muted-copy">{locale === "de" ? "Keine Treffer." : "No results."}</p>
          ) : filteredPaletteEntries.slice(0, 24).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="command-palette-item"
              onClick={entry.onSelect}
            >
              <span>{entry.label}</span>
              <small>{entry.detail}</small>
            </button>
          ))}
        </div>
      </section>
    </>
  ) : null;

  if (isMobileViewport) {
    return (
      <main className="app-shell app-shell-console app-shell-mobile" data-testid="app-shell">
        <TopContextBar
          brandIcon={<MosaicStackedIcon />}
          title="MosaicStacked"
          modelAlias={activeModelAlias ?? ui.common.na}
          healthTone={healthState.tone}
          locale={locale}
          brandAriaLabel={locale === "de" ? "Zur Chat-Ansicht wechseln. Lange drücken für Einstellungen." : "Switch to chat. Long press for settings."}
          modelAriaLabel={locale === "de" ? "Modelleinstellungen öffnen" : "Open model settings"}
          languageAriaLabel={ui.shell.languageLabel}
          languageOptionEnglish={ui.shell.languageOptionEnglish}
          languageOptionGerman={ui.shell.languageOptionGerman}
          onBrandClick={handleMobileBrandClick}
          onBrandPointerDown={handleMobileBrandPointerDown}
          onBrandPointerUp={clearMobileBrandLongPress}
          onBrandPointerCancel={clearMobileBrandLongPress}
          onBrandPointerLeave={clearMobileBrandLongPress}
          onModelPress={() => handleWorkspaceTabSelect("settings")}
          onLocaleChange={setLocale}
        />
        <section className="shell-truth-top shell-truth-top-mobile" aria-label={locale === "de" ? "Systemstatus" : "System status"}>
          <div className="shell-truth-top-left">
            <WorkspaceIcon mode={mode} />
            <span>{activeSession?.title ?? workspaceName}</span>
            <span className={`freshness-badge freshness-badge-${freshness}`} title={freshnessHint}>
              {freshnessLabel}
            </span>
          </div>
          <button
            type="button"
            className="shell-truth-review-pill"
            onClick={() => handleWorkspaceTabSelect("workbench")}
            aria-label={locale === "de" ? "Ausstehende Freigaben anzeigen" : "Show pending approvals"}
          >
            {`${approvalSummary.pending} pending`}
          </button>
        </section>

        <ContextStrip
          repoLabel={repoChipLabel.replace(/^⊟\s?|^⊡\s?/, "")}
          branchLabel={branchChipLabel}
          fileLabel={fileChipLabel}
          status={mobileContextStatus.label}
          ariaLabel={locale === "de" ? "Command-Kontext öffnen" : "Open command context"}
          onPress={handleMobileContextToggle}
        />

        <section className="mobile-workspace-surface">
          <ShellCard variant="base" className="workspace-frame-card mobile-workspace-frame">
            <div className="workspace-frame-body">
              <Suspense fallback={<p className="empty-state" role="status">{ui.shell.healthChecking}</p>}>
                {mobileWorkspaceSurface}
              </Suspense>
            </div>
          </ShellCard>
        </section>

        {mobileContextOpen ? (
          <>
            <button
              type="button"
              className="mobile-context-backdrop mobile-bottom-sheet-backdrop"
              aria-label={locale === "de" ? "Kontext schließen" : "Close context"}
              onClick={() => setMobileContextOpen(false)}
            />
            <section className="mobile-context-sheet mobile-bottom-sheet" aria-label={ui.shell.workspaceContextSuffix}>
              <span className="mobile-context-sheet-handle mobile-bottom-sheet-handle" aria-hidden="true" />
              <header className="mobile-context-sheet-header">
                <SectionLabel>{ui.shell.workspaceContextSuffix}</SectionLabel>
              </header>

              <div className="mobile-context-sheet-body">
                <div className="mobile-context-status-grid">
                  <div>
                    <span>{ui.shell.healthTitle}</span>
                    <strong>{healthState.label}</strong>
                  </div>
                  <div>
                    <span>{ui.review.nextStepLabel}</span>
                    <strong>{currentStatusBadge}</strong>
                  </div>
                  <div>
                    <span>{ui.shell.pendingApprovalsTitle}</span>
                    <strong>{String(approvalSummary.pending)}</strong>
                  </div>
                  <div>
                    <span>{ui.shell.modeLabel}</span>
                    <strong>{workspaceName}</strong>
                  </div>
                </div>

                {!hasRepoContext ? (
                  <p className="mobile-context-empty-note">
                    {locale === "de"
                      ? "Kein Kontext geladen. Öffne Workbench und wähle ein Repo oder eine Datei."
                      : "No context loaded yet. Open Workbench and choose a repository or file."}
                  </p>
                ) : null}

                <div className="mobile-context-actions">
                  <button type="button" className="secondary-button" onClick={() => handleMobileNavSelect("workbench")}>
                    {ui.shell.workspaceTabs.workbench.label}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => handleMobileNavSelect("settings")}>
                    {ui.shell.workspaceTabs.settings.label}
                  </button>
                  {isSessionWorkspace(mode) ? (
                    <button type="button" className="secondary-button" onClick={() => handleWorkspaceSessionCreate(sessionWorkspace)}>
                      {appText.processCreateSession}
                    </button>
                  ) : null}
                </div>

                {showRouteOwnershipContext && routeOwnershipRows.length > 0 ? (
                  <RouteStatusLadder
                    title={mode === "workbench" ? "Workbench status ladder" : "Matrix status ladder"}
                    rows={routeOwnershipRows}
                  />
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        <BottomNav
          ariaLabel={ui.shell.workspacesLabel}
          items={MOBILE_NAV_MODES.map((workspaceMode) => ({
            key: workspaceMode,
            label: workspaceTabLabels[workspaceMode],
            icon: <WorkspaceIcon mode={workspaceMode} />,
            active: activeMobileNav === workspaceMode,
            onPress: () => handleMobileNavSelect(workspaceMode),
            testId: `tab-${workspaceMode}`,
          }))}
        />
        {paletteOverlay}
        {floatingCompanion}
      </main>
    );
  }

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
      <section className="shell-truth-top" aria-label={locale === "de" ? "Systemstatus" : "System status"}>
        <div className="shell-truth-top-left">
          <WorkspaceIcon mode={mode} />
          <span>{activeSession?.title ?? workspaceName}</span>
          <span className={`freshness-badge freshness-badge-${freshness}`} title={freshnessHint}>
            {freshnessLabel}
          </span>
        </div>
        <button
          type="button"
          className="shell-truth-review-pill"
          onClick={() => handleWorkspaceTabSelect("workbench")}
          aria-label={locale === "de" ? "Ausstehende Freigaben anzeigen" : "Show pending approvals"}
        >
          {`${approvalSummary.pending} pending`}
        </button>
        <div className="shell-truth-top-right">
          <span className={`shell-health-dot shell-health-dot-${healthState.tone}`} aria-hidden="true" />
          <span className="shell-truth-model">{activeModelAlias ?? ui.common.na}</span>
          <button
            type="button"
            className="secondary-button shell-expert-toggle"
            onClick={() => setWorkMode(expertMode ? "beginner" : "expert")}
          >
            {expertMode ? "Expert" : "Assist"}
          </button>
        </div>
      </section>
      <header className="global-header global-header-shell">
        <div className="brand-block">
          <span className="mosaicstacked-mark" aria-hidden="true">
            <MosaicStackedIcon />
          </span>
          <p className="app-kicker">{ui.shell.appKicker}</p>
          <h1>{ui.shell.appTitle}</h1>
          <p className="app-deck">{ui.shell.appDeck}</p>
        </div>

        <div className="header-actions">
          <div className="shell-language-toggle" role="group" aria-label={ui.shell.languageLabel}>
            <button
              type="button"
              className={locale === "en" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
              aria-label={locale === "de" ? "Sprache: Englisch" : "Language: English"}
              data-testid="locale-en"
            >
              {ui.shell.languageOptionEnglish}
            </button>
            <button
              type="button"
              className={locale === "de" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
              onClick={() => setLocale("de")}
              aria-pressed={locale === "de"}
              aria-label={locale === "de" ? "Sprache: Deutsch" : "Language: German"}
              data-testid="locale-de"
            >
              {ui.shell.languageOptionGerman}
            </button>
          </div>
          {healthState.tone === "ready" ? null : (
            <StatusBadge tone={healthState.tone}>{ui.shell.backendPrefix} {healthState.label}</StatusBadge>
          )}
        </div>
      </header>

      <section className="console-layout">
        <aside className="workspace-sidebar shell-left-rail">
          <ShellCard variant="rail" className="shell-nav-card">
            <SectionLabel>{ui.shell.workspacesLabel}</SectionLabel>
            <nav className="sidebar-nav" aria-label={ui.shell.workspacesLabel}>
              {WORKSPACE_MODES.map((workspaceMode) => (
                <button
                  key={workspaceMode}
                  type="button"
                  className={mode === workspaceMode
                    ? "workspace-tab workspace-tab-active workspace-tab-vertical workspace-tab-shell-active workspace-tab-icon-rail"
                    : "workspace-tab workspace-tab-vertical workspace-tab-icon-rail"}
                  onClick={() => handleWorkspaceTabSelect(workspaceMode)}
                  aria-label={workspaceTabLabels[workspaceMode]}
                  aria-current={mode === workspaceMode ? "page" : undefined}
                  data-testid={`tab-${workspaceMode}`}
                  title={workspaceTabLabels[workspaceMode]}
                >
                  <WorkspaceIcon mode={workspaceMode} />
                  <span className="sr-only">{workspaceTabLabels[workspaceMode]}</span>
                </button>
              ))}
            </nav>
          </ShellCard>

          <ShellCard variant="muted" className="shell-session-identity-card shell-controls-card">
            <div className="shell-control-row">
              <div>
                <SectionLabel>{locale === "de" ? "Arbeitsmodus" : "Work mode"}</SectionLabel>
                <BeginnerExpertToggle workMode={workMode} setWorkMode={setWorkMode} />
              </div>
              <StatusBadge tone={statusToneForBadge}>{getSessionStatusLabel(locale, activeSession?.status ?? "draft")}</StatusBadge>
            </div>
            {expertMode && activeSession?.id ? (
              <MutedSystemCopy className="shell-session-id">{ui.shell.sessionIdPrefix}: {activeSession.id}</MutedSystemCopy>
            ) : null}

          </ShellCard>

          <SessionList
            workspace={sessionWorkspace}
            sessions={sessionWorkspaceSessions}
            activeSessionId={sessionWorkspaceActiveId}
            onCreate={() => handleWorkspaceSessionCreate(sessionWorkspace)}
            onSelect={(sessionId) => handleWorkspaceSessionSelect(sessionWorkspace, sessionId)}
            onArchive={(sessionId) => handleWorkspaceSessionArchive(sessionWorkspace, sessionId)}
            onDelete={(sessionId) => handleWorkspaceSessionDelete(sessionWorkspace, sessionId)}
            headerNote={expertMode ? appText.sessionHeaderNote : undefined}
            showManagement={expertMode}
          />
        </aside>

        <section className="console-main shell-center-main">
          <ShellCard variant="base" className="workspace-frame-card">
            <div className="workspace-frame-body">
              <Suspense fallback={<p className="empty-state" role="status">{ui.shell.healthChecking}</p>}>
                {workspaceSurface}
              </Suspense>
            </div>
          </ShellCard>
        </section>

        <aside className="workspace-context truth-rail">
          <TruthRailSection
            title={ui.shell.healthTitle}
            testId="truth-rail-health"
            badge={<StatusBadge tone={healthState.tone}>{healthState.label}</StatusBadge>}
          >
            <MutedSystemCopy>{workModeCopy.riskHint}</MutedSystemCopy>
            {expertMode || healthState.tone !== "ready" ? (
              <MutedSystemCopy>{healthState.detail}</MutedSystemCopy>
            ) : null}
            {expertMode ? (
              <div className="truth-rail-pairs">
                <div>
                  <span>{ui.shell.modeLabel}</span>
                  <strong>{workspaceName}</strong>
                </div>
                <div>
                  <span>{ui.shell.publicAliasLabel}</span>
                  <strong>{activeModelAlias ?? ui.common.na}</strong>
                </div>
              </div>
            ) : null}
          </TruthRailSection>

          {routeOwnershipRows.length > 0 ? (
            <TruthRailSection
              title={mode === "workbench" ? "Workbench route ownership" : "Matrix route ownership"}
              testId="truth-rail-route-ownership"
              badge={<StatusBadge tone="muted">backend-owned</StatusBadge>}
            >
              <MutedSystemCopy>
                GitHub and Matrix are not browser integrations. The console sends governed intent; backend owns credentials, execution, verification, and sanitized errors.
              </MutedSystemCopy>
              <RouteStatusLadder
                title={mode === "workbench" ? "Workbench status ladder" : "Matrix status ladder"}
                rows={routeOwnershipRows}
              />
            </TruthRailSection>
          ) : null}

          {approvalSummary.hasApprovals || expertMode ? (
            <TruthRailSection
              title={ui.shell.pendingApprovalsTitle}
              testId="truth-rail-approvals"
              badge={<StatusBadge tone={approvalSummary.stale > 0 ? "error" : approvalSummary.pending > 0 ? "partial" : "muted"}>{approvalSummary.pending}</StatusBadge>}
            >
              <p className="truth-rail-keyline">
                {ui.shell.pendingApprovalsSummary(approvalSummary.pending, approvalSummary.stale)}
              </p>
              {approvalSummary.hasApprovals ? (
                <MutedSystemCopy>
                  {approvalSummary.chatPending > 0 ? ui.shell.pendingApprovalsChat : ui.shell.pendingApprovalsSeparate}
                </MutedSystemCopy>
              ) : null}
            </TruthRailSection>
          ) : null}

          <TruthRailSection
            title={nextStepTitle}
            testId="truth-rail-next-step"
            badge={<StatusBadge tone={statusToneForBadge}>{currentStatusBadge}</StatusBadge>}
          >
            <div className="truth-rail-pairs">
              {currentRows.slice(0, expertMode ? 2 : 1).map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
            <MutedSystemCopy>{currentHelperText}</MutedSystemCopy>
            <div className="truth-rail-actions">
              {approvalSummary.hasApprovals && mode !== "workbench" ? (
                <button type="button" className="secondary-button" onClick={() => handleWorkspaceTabSelect("workbench")}>
                  {appText.processGoReview}
                </button>
              ) : isSessionWorkspace(mode) ? (
                <button type="button" className="secondary-button" onClick={() => handleWorkspaceSessionCreate(sessionWorkspace)}>
                  {appText.processCreateSession}
                </button>
              ) : null}
            </div>
          </TruthRailSection>

        </aside>
      </section>
      {paletteOverlay}
      {floatingCompanion}
    </main>
  );
}
