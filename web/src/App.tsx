import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GitHubWorkspaceStatus,
} from "./components/GitHubWorkspace.js";
import {
  type MatrixWorkspaceStatus,
} from "./components/MatrixWorkspace.js";
import {
  type ReviewItem,
} from "./components/ReviewWorkspace.js";
import {
  type DiagnosticEntry,
  type SettingsVerificationState,
  type SettingsVerificationTarget,
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
import {
  getShellHealthCopy,
  getSessionStatusLabel,
  useLocalization,
} from "./lib/localization.js";
import {
  buildIntegrationConnectStartUrl,
  fetchDiagnostics,
  fetchHealth,
  fetchIntegrationsStatus,
  fetchJournalRecent,
  fetchModels,
  postIntegrationControlAction,
  fetchOpenRouterCredentialStatus,
  saveOpenRouterCredentials,
  testOpenRouterCredentials,
  testSettingsConnection,
  type DiagnosticsResponse,
  type IntegrationsStatusResponse,
  type JournalEntry,
  type OpenRouterCredentialStatusResponse
} from "./lib/api.js";
import {
  deriveSettingsLoginAdapters,
} from "./lib/settings-login-adapters.js";
import {
  appendSession,
  createChatSessionMetadata,
  createGitHubSessionMetadata,
  createMatrixSessionMetadata,
  createSession,
  deleteSession,
  loadWorkspaceState,
  saveWorkspaceState,
  selectSession,
  updateSession,
  type WorkspaceKind,
  type WorkspaceSession,
  type ChatSession,
  type GitHubSession,
  type MatrixSession
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
import type { PinnedChatContext } from "./lib/pinned-chat-context.js";
import { BottomNav } from "./components/navigation/BottomNav.js";
import { ChatPage as MobileChatPage } from "./pages/ChatPage.js";

const loadChatWorkspace = () => import("./components/ChatWorkspace.js");
const loadGitHubWorkspace = () => import("./components/GitHubWorkspace.js");
const loadMatrixWorkspace = () => import("./components/MatrixWorkspace.js");
const loadReviewWorkspace = () => import("./components/ReviewWorkspace.js");
const loadSettingsWorkspace = () => import("./components/SettingsWorkspace.js");
const GITHUB_MOBILE_STYLESHEET_ID = "mosaicstacked-mobile-github-css";
const MATRIX_MOBILE_STYLESHEET_ID = "mosaicstacked-mobile-matrix-css";

function loadMobileGitHubStylesheet() {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingLink = document.getElementById(GITHUB_MOBILE_STYLESHEET_ID) as HTMLLinkElement | null;
  if (existingLink?.dataset.loaded || existingLink?.sheet) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const link = existingLink ?? document.createElement("link");
    const handleLoad = () => {
      link.dataset.loaded = "true";
      resolve();
    };
    const handleError = () => {
      link.dataset.loaded = "error";
      resolve();
    };

    link.addEventListener("load", handleLoad, { once: true });
    link.addEventListener("error", handleError, { once: true });

    if (!existingLink) {
      link.id = GITHUB_MOBILE_STYLESHEET_ID;
      link.rel = "stylesheet";
      link.href = "/github-mobile.css";
      document.head.appendChild(link);
    }
  });
}

const loadMobileGitHubPage = async () => {
  const [pageModule] = await Promise.all([
    import("./pages/GitHubPage.js"),
    loadMobileGitHubStylesheet(),
  ]);

  return pageModule;
};

function loadMobileMatrixStylesheet() {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingLink = document.getElementById(MATRIX_MOBILE_STYLESHEET_ID) as HTMLLinkElement | null;
  if (existingLink?.dataset.loaded || existingLink?.sheet) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const link = existingLink ?? document.createElement("link");
    const handleLoad = () => {
      link.dataset.loaded = "true";
      resolve();
    };
    const handleError = () => {
      link.dataset.loaded = "error";
      resolve();
    };

    link.addEventListener("load", handleLoad, { once: true });
    link.addEventListener("error", handleError, { once: true });

    if (!existingLink) {
      link.id = MATRIX_MOBILE_STYLESHEET_ID;
      link.rel = "stylesheet";
      link.href = "/matrix-mobile.css";
      document.head.appendChild(link);
    }
  });
}

const loadMobileMatrixPage = async () => {
  const [pageModule] = await Promise.all([
    import("./pages/MatrixPage.js"),
    loadMobileMatrixStylesheet(),
  ]);

  return pageModule;
};

const ChatWorkspace = lazy(() => loadChatWorkspace().then((module) => ({ default: module.ChatWorkspace })));
const GitHubWorkspace = lazy(() => loadGitHubWorkspace().then((module) => ({ default: module.GitHubWorkspace })));
const MatrixWorkspace = lazy(() => loadMatrixWorkspace().then((module) => ({ default: module.MatrixWorkspace })));
const ReviewWorkspace = lazy(() => loadReviewWorkspace().then((module) => ({ default: module.ReviewWorkspace })));
const SettingsWorkspace = lazy(() => loadSettingsWorkspace().then((module) => ({ default: module.SettingsWorkspace })));
const MobileGitHubPage = lazy(() => loadMobileGitHubPage().then((module) => ({ default: module.GitHubPage })));
const MobileMatrixPage = lazy(() => loadMobileMatrixPage().then((module) => ({ default: module.MatrixPage })));

const SETTINGS_VERIFICATION_INITIAL: Record<SettingsVerificationTarget, SettingsVerificationState> = {
  backend: {
    status: "idle",
    detail: "",
    checkedAt: null,
  },
  github: {
    status: "idle",
    detail: "",
    checkedAt: null,
  },
  matrix: {
    status: "idle",
    detail: "",
    checkedAt: null,
  },
};

const OPENROUTER_CREDENTIAL_STATUS_EMPTY: OpenRouterCredentialStatusResponse = {
  configured: false,
  models: [],
};

function scheduleWorkspacePreload(callback: () => void, timeoutMs = 15_000) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const handle = globalThis.setTimeout(callback, timeoutMs);
  return () => globalThis.clearTimeout(handle);
}

type WorkspaceMode = "chat" | "github" | "matrix" | "review" | "settings";

type TelemetryEntry = {
  id: string;
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type PersistedShellState = {
  activeTab?: WorkspaceMode;
  workMode?: WorkMode;
  expertMode?: boolean;
};

const SHELL_STORAGE_KEY = "mosaicstacked.console.shell.v2";
const THEME_STORAGE_KEY = "ms-theme";
const LEGACY_THEME_STORAGE_KEY = "mg-theme";
const WORKSPACE_STATE_SAVE_INTERVAL_MS = 250;

type ThemeMode = "dark" | "light";

function isWorkspaceMode(value: string | null): value is WorkspaceMode {
  return value === "chat"
    || value === "github"
    || value === "matrix"
    || value === "review"
    || value === "settings";
}

export function shouldConfirmGitHubReviewNavigation(options: {
  currentMode: WorkspaceMode;
  nextMode: WorkspaceMode;
  githubReviewDirty: boolean;
}) {
  return options.currentMode === "github"
    && options.nextMode !== "github"
    && options.githubReviewDirty;
}

function readUrlWorkspaceMode() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const requestedMode = url.searchParams.get("mode");
  return isWorkspaceMode(requestedMode) ? requestedMode : null;
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

const WORKSPACE_MODES: WorkspaceMode[] = ["chat", "github", "matrix", "review", "settings"];
const MOBILE_NAV_MODES: WorkspaceMode[] = ["chat", "github", "matrix"];
const MOBILE_BREAKPOINT_QUERY = "(max-width: 760px)";

function WorkspaceIcon({ mode }: { mode: WorkspaceMode }) {
  switch (mode) {
    case "github":
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
    case "review":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5v11A1.5 1.5 0 0 1 16.5 18H10l-4 4v-3.5A1.5 1.5 0 0 1 4.5 17V5.5Z" />
          <path d="M8 8.5h8" />
          <path d="M8 11.5h8" />
          <path d="M8 14.5h5" />
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

function MobileContextIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7.5h16" />
      <path d="M4 12h16" />
      <path d="M4 16.5h16" />
    </svg>
  );
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

function mergeReviewItems(current: ReviewItem[], next: ReviewItem[]) {
  const remaining = current.filter(
    (item) => !next.some((candidate) => candidate.id === item.id && candidate.source === item.source),
  );
  return [...remaining, ...next];
}

function isSessionWorkspace(mode: WorkspaceMode): mode is WorkspaceKind {
  return mode === "chat" || mode === "github" || mode === "matrix";
}

function nowIso() {
  return new Date().toISOString();
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

function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);

    if (saved === "dark" || saved === "light") {
      return saved;
    }

    return "dark";
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle("light-mode", theme === "light");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark"),
  };
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
    heroTitle: "Ein AI-Arbeitsplatz für Chat, Repo-Kontext und Matrix-Wissen.",
    heroBody: "MosaicStacked verbindet Modellwahl, Projektkontext und Team-Wissen in einem kontrollierten Arbeitsfluss.",
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
    actionsBody: "Jede gute Antwort kann direkt weiterverwendet werden - ohne Copy-Paste-Chaos.",
    actionsExamplePrefix: "Beispiel:",
    actionsExampleBody: "Lade eine Datei → frage nach Risiken → speichere die Zusammenfassung mit",
    actionsExampleTail: "→ bereite ein Issue mit",
    beginnerKicker: "Beginner Flow",
    beginnerTitle: "Dein erster Flow",
    powerKicker: "Power User Recipes",
    powerTitle: "Workflows für echte Projektarbeit",
    safetyLabel: "Safety-Hinweis",
    safetyLines: [
      "Browser ist Review Surface, Backend hält Autorität.",
      "Keine direkten Writes ohne Approval Gate.",
      "Secrets nie in Prompts posten.",
    ],
    enterLabel: "ENTER",
    enterHint: "Zur App wechseln",
  },
  en: {
    kicker: "Model-Agnostic Workflow",
    heroTitle: "An AI workspace for chat, repo context, and Matrix knowledge.",
    heroBody: "MosaicStacked combines model choice, project context, and team knowledge in one controlled workflow.",
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
    actionsBody: "Every good answer can be reused immediately - without copy-paste chaos.",
    actionsExamplePrefix: "Example:",
    actionsExampleBody: "Load a file → ask for risks → save the summary with",
    actionsExampleTail: "→ prepare an issue with",
    beginnerKicker: "Beginner Flow",
    beginnerTitle: "Your first flow",
    powerKicker: "Power User Recipes",
    powerTitle: "Workflows for real project work",
    safetyLabel: "Safety Note",
    safetyLines: [
      "The browser is a review surface; the backend remains authoritative.",
      "No direct writes without an approval gate.",
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
    key: "github",
    icon: <WorkspaceIcon mode="github" />,
    href: "/console?mode=github",
    title: {
      de: "GitHub",
      en: "GitHub",
    },
    description: {
      de: "Lade Repo-Kontext, prüfe Dateien und bereite Issues, Reviews oder PR-Kommentare vor.",
      en: "Load repo context, inspect files, and prepare issues, reviews, or PR comments.",
    },
    useCase: {
      de: "Datei laden und konkrete Risiken oder Bugs prüfen lassen.",
      en: "Load a file and ask for concrete risks or bugs.",
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
      de: "Speichere gute Outputs als Wissen, Posts oder Team-Kontext.",
      en: "Store strong outputs as knowledge, posts, or team context.",
    },
    useCase: {
      de: "Zusammenfassung direkt als Wissenseintrag übernehmen.",
      en: "Save a summary directly as a knowledge entry.",
    },
  },
  {
    key: "context",
    icon: <span className="landing-glyph">⊡</span>,
    href: "/console?mode=github",
    title: {
      de: "Context",
      en: "Context",
    },
    description: {
      de: "Behalte aktives Repo, Branch, Datei und Token-Kontext im Blick.",
      en: "Keep active repo, branch, file, and token context visible.",
    },
    useCase: {
      de: "Vor der Frage prüfen, ob die richtige Datei im Fokus ist.",
      en: "Check that the right file is in focus before asking.",
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
      de: "OPENROUTER_API_KEY, GITHUB_TOKEN oder MATRIX_ACCESS_TOKEN sauber verwalten.",
      en: "Manage OPENROUTER_API_KEY, GITHUB_TOKEN, or MATRIX_ACCESS_TOKEN cleanly.",
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
      de: "Als Matrix-Wissen speichern",
      en: "Save as Matrix knowledge",
    },
    text: {
      de: "Sichere Zusammenfassungen, Entscheidungen oder Handoffs direkt im Wissensfluss.",
      en: "Save summaries, decisions, or handoffs directly in the knowledge flow.",
    },
  },
  {
    title: "↯",
    headline: {
      de: "Für GitHub vorbereiten",
      en: "Prepare for GitHub",
    },
    text: {
      de: "Mache aus Reviews, Bug-Hinweisen oder Plänen einen Issue- oder PR-Kommentar.",
      en: "Turn reviews, bug findings, or plans into an issue or PR comment.",
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
      de: "Lass dir eine Zusammenfassung erstellen, tippe ⊛ und speichere sie als Knowledge-Post.",
      en: "Generate a summary, tap ⊛, and store it as a knowledge post.",
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
      de: "Nutze gespeichertes Wissen als Orientierung für neue Prompts und Projektentscheidungen.",
      en: "Use saved knowledge to guide new prompts and project decisions.",
    },
  },
] as const;

const LANDING_BEGINNER_FLOW = {
  de: [
    "Modellzugang verbinden",
    "Erste Frage stellen",
    "Repo oder Datei als Kontext laden",
    "Guten Output weiterverwenden",
    "Wissen in Matrix sichern",
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
      de: "Antwort verdichten, Matrix-Post speichern, später wiederverwenden.",
      en: "Condense response, save Matrix post, reuse later.",
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
  const { theme, toggleTheme } = useTheme();
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
          processGoReview: "Review öffnen",
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
          processGoReview: "Open review",
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
  const [mode, setMode] = useState<WorkspaceMode>(() => readUrlWorkspaceMode() ?? persisted?.activeTab ?? "chat");
  const [workMode, setWorkMode] = useState<WorkMode>(() => resolvePersistedWorkMode(persisted));
  const expertMode = isExpertMode(workMode);
  const workModeCopy = getWorkModeCopy(locale, workMode);
  const [workspaceState, setWorkspaceState] = useState(() => loadWorkspaceState());
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [activeModelAlias, setActiveModelAlias] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelRegistry, setModelRegistry] = useState<Array<{
    alias: string;
    label: string;
    description: string;
    capabilities: string[];
    tier: "core" | "specialized" | "fallback";
    streaming: boolean;
    recommendedFor: string[];
    default?: boolean;
    available?: boolean;
  }>>([]);
  const [openRouterCredentialStatus, setOpenRouterCredentialStatus] = useState<OpenRouterCredentialStatusResponse>(OPENROUTER_CREDENTIAL_STATUS_EMPTY);
  const [openRouterApiKeyInput, setOpenRouterApiKeyInput] = useState("");
  const [openRouterModelInput, setOpenRouterModelInput] = useState("");
  const [isSavingOpenRouterCredentials, setIsSavingOpenRouterCredentials] = useState(false);
  const [isTestingOpenRouterCredentials, setIsTestingOpenRouterCredentials] = useState(false);
  const [openRouterCredentialMessage, setOpenRouterCredentialMessage] = useState<string | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationsStatusResponse | null>(null);
  const [settingsVerificationResults, setSettingsVerificationResults] = useState(SETTINGS_VERIFICATION_INITIAL);
  const [runtimeJournalEntries, setRuntimeJournalEntries] = useState<JournalEntry[]>([]);
  const [restoredSession] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("mosaicstacked.console.workspaces.v1") !== null;
  });
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(() => createDefaultGitHubContext());
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(() => createDefaultMatrixContext());
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [pinnedChatContext, setPinnedChatContext] = useState<PinnedChatContext | null>(null);
  const [githubReviewDirty, setGitHubReviewDirty] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const workspaceSaveHandleRef = useRef<number | null>(null);
  const latestWorkspaceStateRef = useRef(workspaceState);
  const mobileSettingsLongPressRef = useRef<number | null>(null);
  const mobileSettingsLongPressTriggeredRef = useRef(false);
  const flushWorkspaceState = useCallback(() => {
    if (workspaceSaveHandleRef.current !== null) {
      globalThis.clearTimeout(workspaceSaveHandleRef.current);
      workspaceSaveHandleRef.current = null;
    }

    saveWorkspaceState(latestWorkspaceStateRef.current);
  }, []);

  useEffect(() => {
    replaceConsoleUrl(mode);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleState() {
      const [healthResult, modelsResult, diagnosticsResult, journalResult, integrationsResult, openRouterStatusResult] = await Promise.allSettled([
        fetchHealth(),
        fetchModels(),
        fetchDiagnostics(),
        fetchJournalRecent(),
        fetchIntegrationsStatus(),
        fetchOpenRouterCredentialStatus(),
      ]);

      if (cancelled) {
        return;
      }

      if (healthResult.status === "fulfilled") {
        const health = healthResult.value;
        setBackendHealthy(true);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "info",
            label: appText.telemetryHealthLoaded,
            detail: appText.telemetryHealthLoadedDetail(health.service, health.mode, health.allowedModelCount),
          }),
        );
      } else {
        setBackendHealthy(false);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: appText.telemetryHealthFailed,
            detail:
              healthResult.reason instanceof Error
                ? healthResult.reason.message
                : appText.telemetryHealthFailedDetail,
          }),
        );
      }

      const userOpenRouterStatus = openRouterStatusResult.status === "fulfilled"
        ? openRouterStatusResult.value
        : OPENROUTER_CREDENTIAL_STATUS_EMPTY;
      setOpenRouterCredentialStatus(userOpenRouterStatus);

      if (modelsResult.status === "fulfilled") {
        const userModelRegistry = userOpenRouterStatus.models.map((model) => ({
          alias: model.alias,
          label: model.label,
          description: "User-configured OpenRouter model stored in backend profile settings.",
          capabilities: ["chat", "streaming"],
          tier: "specialized" as const,
          streaming: true,
          recommendedFor: ["user_configured_openrouter"],
          available: true,
        }));
        const registry = [...(modelsResult.value.registry ?? []), ...userModelRegistry];
        const models = [...modelsResult.value.models, ...userOpenRouterStatus.models.map((model) => model.alias)];
        const defaultAlias = userOpenRouterStatus.configured ? "user_openrouter_default" : modelsResult.value.defaultModel;

        setAvailableModels(models);
        setActiveModelAlias(defaultAlias);
        setModelRegistry(registry);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "info",
            label: appText.telemetryModelAliasLoaded,
            detail: appText.telemetryModelAliasLoadedDetail(defaultAlias),
          }),
        );
      } else {
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: appText.telemetryModelListFailed,
            detail:
              modelsResult.reason instanceof Error
                ? modelsResult.reason.message
                : appText.telemetryModelListFailedDetail,
          }),
        );
      }

      if (diagnosticsResult.status === "fulfilled") {
        setRuntimeDiagnostics(diagnosticsResult.value);
      } else {
        setRuntimeDiagnostics(null);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "warning",
            label: appText.telemetryDiagnosticsFailed,
            detail:
              diagnosticsResult.reason instanceof Error
                ? diagnosticsResult.reason.message
                : appText.telemetryDiagnosticsFailedDetail,
          }),
        );
      }

      if (journalResult.status === "fulfilled") {
        setRuntimeJournalEntries(journalResult.value.entries);
      } else {
        setRuntimeJournalEntries([]);
      }

      if (integrationsResult.status === "fulfilled") {
        setIntegrationsStatus(integrationsResult.value);
      } else {
        setIntegrationsStatus(null);
      }
    }

    const handle = globalThis.setTimeout(() => {
      void loadConsoleState();
    }, 15_000);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(handle);
    };
  }, [appText]);

  useEffect(() => {
    persistShellState({
      activeTab: mode,
      workMode,
      expertMode,
    });
  }, [expertMode, mode, workMode]);

  useEffect(() => {
    latestWorkspaceStateRef.current = workspaceState;

    if (workspaceSaveHandleRef.current !== null) {
      return;
    }

    workspaceSaveHandleRef.current = globalThis.setTimeout(() => {
      flushWorkspaceState();
    }, WORKSPACE_STATE_SAVE_INTERVAL_MS);
  }, [flushWorkspaceState, workspaceState]);

  useEffect(() => () => {
    flushWorkspaceState();
  }, [flushWorkspaceState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const handlePageHide = () => {
      flushWorkspaceState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushWorkspaceState();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushWorkspaceState]);

  useEffect(() => {
    setMobileContextOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileContextOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => scheduleWorkspacePreload(() => {
    void Promise.all([
      loadChatWorkspace(),
      loadGitHubWorkspace(),
      loadMatrixWorkspace(),
      loadReviewWorkspace(),
      loadSettingsWorkspace(),
    ]);
  }), []);


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

  const updateGitHubReviewItems = useCallback((items: ReviewItem[]) => {
    setReviewItems((current) => mergeReviewItems(current.filter((item) => item.source !== "github"), items));
  }, []);

  const updateMatrixReviewItems = useCallback((items: ReviewItem[]) => {
    setReviewItems((current) => mergeReviewItems(current.filter((item) => item.source !== "matrix"), items));
  }, []);

  const removeModeReviewItems = useCallback((source: ReviewItem["source"]) => {
    setReviewItems((current) => current.filter((item) => item.source !== source));
  }, []);

  const handleWorkspaceTabSelect = useCallback((nextMode: WorkspaceMode) => {
    if (shouldConfirmGitHubReviewNavigation({
      currentMode: mode,
      nextMode,
      githubReviewDirty,
    })) {
      const allowLeave = typeof window === "undefined"
        ? true
        : window.confirm(ui.github.reviewDirtyConfirmNavigation);

      if (!allowLeave) {
        return;
      }
    }

    setMode(nextMode);

    if (isSessionWorkspace(nextMode)) {
      setWorkspaceState((current) => {
        const activeSessionId = current.activeSessionIdByWorkspace[nextMode];
        return selectSession(current, nextMode, activeSessionId);
      });
    }
  }, [githubReviewDirty, mode, ui.github.reviewDirtyConfirmNavigation]);

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

  const handlePinChatContext = useCallback((context: PinnedChatContext) => {
    setPinnedChatContext(context);
    setMode("chat");
    setWorkspaceState((current) => {
      const activeSessionId = current.activeSessionIdByWorkspace.chat;
      return selectSession(current, "chat", activeSessionId);
    });
  }, []);

  const handleClearPinnedChatContext = useCallback(() => {
    setPinnedChatContext(null);
  }, []);

  const handleQueueMatrixDraftFromChat = useCallback((payload: {
    sourceMessageId: string;
    roomId: string;
    content: string;
    tags: string[];
  }) => {
    const roomId = payload.roomId.trim();
    const content = payload.content.trim();
    if (!roomId || !content) {
      return;
    }

    const tagsLine = payload.tags.length > 0
      ? `\n\n${payload.tags.map((tag) => `#${tag}`).join(" ")}`
      : "";
    const draftContent = `${content}${tagsLine}`;
    const now = nowIso();

    setMode("matrix");
    setWorkspaceState((current) => {
      const sessionId = current.activeSessionIdByWorkspace.matrix;
      const withDraft = updateSession<MatrixSession["metadata"]>(
        current,
        "matrix",
        sessionId,
        (session) => ({
          ...session,
          updatedAt: now,
          lastOpenedAt: now,
          metadata: {
            ...session.metadata,
            roomId,
            composerMode: "post",
            composerTarget: {
              kind: "post",
              roomId,
              postId: null,
              threadRootId: null,
              previewLabel: `${locale === "de" ? "Beitrag" : "Post"}: ${roomId}`,
            },
            selectedEventId: null,
            selectedThreadRootId: null,
            draftContent,
            lastActionResult: locale === "de"
              ? "Entwurf aus Chat übernommen."
              : "Draft adopted from chat.",
          },
        }),
      );

      return selectSession(withDraft, "matrix", sessionId);
    });

    recordTelemetry(
      "info",
      locale === "de" ? "Matrix-Entwurf vorbereitet" : "Matrix draft prepared",
      `${payload.sourceMessageId} -> ${roomId}`,
    );
  }, [locale, recordTelemetry]);

  const handleOpenGitHubFromChatAction = useCallback((payload: {
    sourceMessageId: string;
    content: string;
  }) => {
    setMode("github");
    setWorkspaceState((current) => {
      const sessionId = current.activeSessionIdByWorkspace.github;
      return selectSession(current, "github", sessionId);
    });
    recordTelemetry(
      "info",
      locale === "de" ? "GitHub-Dispatch geöffnet" : "GitHub dispatch opened",
      `${payload.sourceMessageId} (${payload.content.length} chars)`,
    );
  }, [locale, recordTelemetry]);

  const handleWorkspaceSessionCreate = useCallback((workspace: WorkspaceKind) => {
    const now = nowIso();

    setMode(workspace);
    setWorkspaceState((current) => {
      switch (workspace) {
        case "github":
          return appendSession(
            current,
            "github",
            createSession("github", createGitHubSessionMetadata(), {
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now,
            }),
          );
        case "matrix":
          return appendSession(
            current,
            "matrix",
            createSession("matrix", createMatrixSessionMetadata(), {
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now,
            }),
          );
        case "chat":
        default:
          return appendSession(
            current,
            "chat",
            createSession(
              "chat",
              {
                ...createChatSessionMetadata(),
                selectedModelAlias: activeModelAlias,
              },
              {
                createdAt: now,
                updatedAt: now,
                lastOpenedAt: now,
              },
            ),
          );
      }
    });
  }, [activeModelAlias]);

  const handleWorkspaceSessionSelect = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setMode(workspace);
    setWorkspaceState((current) => selectSession(current, workspace, sessionId));
  }, []);

  const refreshIntegrationsStatus = useCallback(async () => {
    try {
      const nextStatus = await fetchIntegrationsStatus();
      setIntegrationsStatus(nextStatus);
    } catch {
      setIntegrationsStatus(null);
    }
  }, []);

  const refreshOpenRouterCredentialStatus = useCallback(async () => {
    const status = await fetchOpenRouterCredentialStatus();
    setOpenRouterCredentialStatus(status);

    if (status.configured) {
      const userModels: string[] = status.models.map((model) => model.alias);
      setAvailableModels((current) => [...new Set([...current, ...userModels])]);
      setModelRegistry((current) => {
        const withoutUser = current.filter((model) => !userModels.includes(model.alias));
        const nextUserModels = status.models.map((model) => ({
          alias: model.alias,
          label: model.label,
          description: "User-configured OpenRouter model stored in backend profile settings.",
          capabilities: ["chat", "streaming"],
          tier: "specialized" as const,
          streaming: true,
          recommendedFor: ["user_configured_openrouter"],
          available: true,
        }));
        return [...withoutUser, ...nextUserModels];
      });
      setActiveModelAlias(status.models[0]?.alias ?? "user_openrouter_default");
    }

    return status;
  }, []);

  const handleSaveOpenRouterCredentials = useCallback(async () => {
    const modelId = openRouterModelInput.trim();
    const apiKey = openRouterApiKeyInput.trim();

    if (!apiKey || !modelId) {
      return;
    }

    setIsSavingOpenRouterCredentials(true);

    try {
      const result = await saveOpenRouterCredentials({ apiKey, modelId });
      setOpenRouterApiKeyInput("");
      setOpenRouterCredentialMessage(result.status);
      await refreshOpenRouterCredentialStatus();
      recordTelemetry("info", "OpenRouter credentials saved", `Backend public alias ${result.model.alias} is selectable.`);
    } catch (error) {
      recordTelemetry(
        "error",
        "OpenRouter credential save failed",
        error instanceof Error ? error.message : "Unable to save OpenRouter credentials.",
      );
    } finally {
      setIsSavingOpenRouterCredentials(false);
    }
  }, [openRouterApiKeyInput, openRouterModelInput, recordTelemetry, refreshOpenRouterCredentialStatus]);

  const handleTestOpenRouterCredentials = useCallback(async () => {
    const modelId = openRouterModelInput.trim();
    const apiKey = openRouterApiKeyInput.trim();

    if (!apiKey || !modelId) {
      return;
    }

    setIsTestingOpenRouterCredentials(true);

    try {
      const result = await testOpenRouterCredentials({ apiKey, modelId });
      setOpenRouterCredentialMessage(`Test passed for ${result.model.alias}`);
      recordTelemetry("info", "OpenRouter credential test passed", `Backend tested alias ${result.model.alias} without saving credentials.`);
    } catch (error) {
      recordTelemetry(
        "error",
        "OpenRouter credential test failed",
        error instanceof Error ? error.message : "Unable to test OpenRouter credentials.",
      );
    } finally {
      setIsTestingOpenRouterCredentials(false);
    }
  }, [openRouterApiKeyInput, openRouterModelInput, recordTelemetry]);

  const handleSettingsVerifyConnection = useCallback(async (target: SettingsVerificationTarget) => {
    setSettingsVerificationResults((current) => ({
      ...current,
      [target]: {
        ...current[target],
        status: "checking",
        detail: "",
      }
    }));

    try {
      const result = await testSettingsConnection(target);
      const checkedAt = new Date().toISOString();

      if (target === "backend") {
        setBackendHealthy(true);
      } else {
        await refreshIntegrationsStatus();
      }

      setSettingsVerificationResults((current) => ({
        ...current,
        [target]: {
          status: "passed",
          detail: result.detail,
          checkedAt,
        }
      }));
      recordTelemetry(
        "info",
        locale === "de" ? "Verbindung geprüft" : "Connection verified",
        `${target}: ${result.detail}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Connection check failed";

      if (target === "backend") {
        setBackendHealthy(false);
      } else {
        await refreshIntegrationsStatus();
      }

      setSettingsVerificationResults((current) => ({
        ...current,
        [target]: {
          status: "failed",
          detail,
          checkedAt: new Date().toISOString(),
        }
      }));
      recordTelemetry(
        "warning",
        locale === "de" ? "Verbindungsprüfung fehlgeschlagen" : "Connection verification failed",
        `${target}: ${detail}`
      );
    }
  }, [locale, recordTelemetry, refreshIntegrationsStatus]);

  const handleIntegrationAction = useCallback(async (
    provider: "github" | "matrix",
    action: "connect" | "reconnect" | "disconnect" | "reverify"
  ) => {
    if (action === "connect" || action === "reconnect") {
      window.location.assign(buildIntegrationConnectStartUrl(provider, "/console?mode=settings"));
      return;
    }

    try {
      await postIntegrationControlAction(provider, action);
    } catch (error) {
      recordTelemetry(
        "warning",
        locale === "de" ? "Integrationsaktion fehlgeschlagen" : "Integration action failed",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      await refreshIntegrationsStatus();
    }
  }, [locale, recordTelemetry, refreshIntegrationsStatus]);

  const buildSettingsIntegrationStartUrl = useCallback((provider: "github" | "matrix") => (
    buildIntegrationConnectStartUrl(provider, "/console?mode=settings")
  ), []);

  const handleWorkspaceSessionArchive = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) =>
      updateSession(current, workspace, sessionId, (session) => ({
        ...session,
        archived: true,
        resumable: false,
        updatedAt: nowIso(),
        lastOpenedAt: nowIso(),
      })),
    );
  }, []);

  const handleWorkspaceSessionDelete = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) => deleteSession(current, workspace, sessionId));
  }, []);

  const handleChatSessionChange = useCallback((session: ChatSession) => {
    setWorkspaceState((current) => updateSession(current, "chat", session.id, () => session));
  }, []);

  const handleGitHubSessionChange = useCallback((session: GitHubSession) => {
    setWorkspaceState((current) => updateSession(current, "github", session.id, () => session));
  }, []);

  const handleMatrixSessionChange = useCallback((session: MatrixSession) => {
    setWorkspaceState((current) => updateSession(current, "matrix", session.id, () => session));
  }, []);

  const sessionWorkspace = isSessionWorkspace(mode) ? mode : workspaceState.activeWorkspace;
  const sessionWorkspaceSessions = workspaceState.sessionsByWorkspace[sessionWorkspace] as WorkspaceSession<unknown>[];
  const sessionWorkspaceActiveId = workspaceState.activeSessionIdByWorkspace[sessionWorkspace];
  const activeSession = sessionWorkspaceSessions.find((session) => session.id === sessionWorkspaceActiveId) ?? sessionWorkspaceSessions[0] ?? null;
  const chatSession = (workspaceState.sessionsByWorkspace.chat.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.chat) ?? workspaceState.sessionsByWorkspace.chat[0]) as ChatSession;
  const githubSession = (workspaceState.sessionsByWorkspace.github.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.github) ?? workspaceState.sessionsByWorkspace.github[0]) as GitHubSession;
  const matrixSession = (workspaceState.sessionsByWorkspace.matrix.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.matrix) ?? workspaceState.sessionsByWorkspace.matrix[0]) as MatrixSession;
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
  const routeOwnershipRows = mode === "github"
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
  const reviewHasStale = reviewItems.some((item) => item.status === "stale");
  const reviewHasPending = reviewItems.some((item) => item.status === "pending_review");
  const reviewHasExecuting = reviewItems.some((item) => item.status === "approved");
  const reviewHasTerminal = reviewItems.some((item) => item.status === "rejected" || item.status === "failed");

  const reviewRows: StatusPanelRow[] = [
    { label: ui.review.openReviews, value: String(reviewItems.length) },
    {
      label: ui.review.rowClassification,
      value:
        reviewItems.length === 0
          ? ui.review.emptyTitle
          : reviewHasStale
            ? ui.review.blocked
            : reviewHasPending
              ? ui.review.approvalNeeded
              : reviewHasExecuting
                ? ui.review.executing
                : reviewHasTerminal
                  ? ui.review.terminalDeviation
                  : ui.review.ready,
    },
  ];

  const settingsTruthSnapshot = {
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
    { label: ui.shell.workspaceTabs.github.label, value: `${settingsTruthSnapshot.github.sessionLabel} · ${settingsTruthSnapshot.github.accessLabel}` },
    { label: ui.shell.workspaceTabs.matrix.label, value: `${settingsTruthSnapshot.matrix.identityLabel} · ${settingsTruthSnapshot.matrix.connectionLabel}` },
    { label: ui.settings.modelCardTitle, value: settingsTruthSnapshot.models.activeAlias },
  ];

  const currentRows = useMemo(() => {
    switch (mode) {
      case "github":
        return githubRows;
      case "matrix":
        return matrixRows;
      case "review":
        return reviewRows;
      case "settings":
        return settingsRows;
      default:
        return chatRows;
    }
  }, [chatRows, githubRows, matrixRows, mode, reviewRows, settingsRows]);

  const currentStatusBadge = useMemo(() => {
    switch (mode) {
      case "github":
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
      case "review":
        if (reviewItems.length === 0) {
          return ui.shell.statusPartial;
        }

        if (reviewHasStale) {
          return ui.shell.statusError;
        }

        if (reviewHasPending) {
          return ui.review.approvalNeeded;
        }

        if (reviewHasExecuting) {
          return ui.review.executing;
        }

    if (reviewHasTerminal) {
          return ui.review.terminalDeviation;
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
    expertMode,
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    backendHealthy,
    activeModelAlias,
    matrixContext.approvalLabel,
    matrixContext.connectionLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
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
  const workspaceName = ui.shell.workspaceTabs[mode].label;
  const nextStepTitle = ui.review.nextStepLabel;

  const currentStatusTone = useMemo(() => {
    switch (mode) {
      case "github":
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
      case "review":
        if (reviewItems.length === 0) {
          return "partial";
        }

    if (reviewHasStale || reviewHasTerminal) {
          return "error";
        }

        return reviewHasPending || reviewHasExecuting ? "partial" : "ready";
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
    backendHealthy,
    activeModelAlias,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
  ]);

  const currentHelperText = useMemo(() => {
    switch (mode) {
      case "github":
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
      case "review":
        if (reviewItems.length === 0) {
          return ui.review.emptyBody;
        }

        if (reviewHasStale) {
          return ui.review.warning;
        }

        if (reviewHasPending) {
          return ui.review.approvalNeeded;
        }

        if (reviewHasExecuting) {
          return ui.review.executing;
        }

    if (reviewHasTerminal) {
          return ui.review.terminalDeviation;
        }

        return ui.review.ready;
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
    reviewItems,
  ]);

  const workspaceSurface = isMobileViewport && mode === "chat" ? (
    <MobileChatPage locale={locale} />
  ) : isMobileViewport && mode === "github" ? (
    <MobileGitHubPage locale={locale} />
  ) : isMobileViewport && mode === "matrix" ? (
    <MobileMatrixPage locale={locale} />
  ) : mode === "chat" ? (
    <ChatWorkspace
      key={chatSession?.id ?? "chat-session"}
      session={chatSession}
      workMode={workMode}
      backendHealthy={backendHealthy}
      routingStatus={{
        fallbackAllowed: runtimeDiagnostics?.routing.allowFallback ?? null,
      }}
      activeModelAlias={activeModelAlias}
      availableModels={availableModels}
      modelRegistry={modelRegistry}
      onActiveModelAliasChange={setActiveModelAlias}
      onTelemetry={recordTelemetry}
      onSessionChange={handleChatSessionChange}
      pinnedContext={pinnedChatContext}
      onClearPinnedContext={handleClearPinnedChatContext}
      matrixDraftDefaultRoomId={matrixDraftDefaultRoomId}
      matrixDraftRoomOptions={matrixDraftRoomOptions}
      onQueueMatrixDraft={handleQueueMatrixDraftFromChat}
      onOpenGitHubFromChatAction={handleOpenGitHubFromChatAction}
    />
  ) : mode === "github" ? (
    <GitHubWorkspace
      key={githubSession?.id ?? "github-session"}
      session={githubSession}
      backendHealthy={backendHealthy}
      workMode={workMode}
      onTelemetry={recordTelemetry}
      onContextChange={setGitHubContext}
      onReviewItemsChange={updateGitHubReviewItems}
      onReviewDirtyChange={setGitHubReviewDirty}
      onPinChatContext={handlePinChatContext}
      onSessionChange={handleGitHubSessionChange}
      githubIntegration={integrationsStatus?.github ?? null}
      onIntegrationAction={handleIntegrationAction}
    />
  ) : mode === "matrix" ? (
    <MatrixWorkspace
      key={matrixSession?.id ?? "matrix-session"}
      session={matrixSession}
      restoredSession={restoredSession}
      workMode={workMode}
      expertMode={expertMode}
      onTelemetry={recordTelemetry}
      onContextChange={setMatrixContext}
      onReviewItemsChange={updateMatrixReviewItems}
      onSessionChange={handleMatrixSessionChange}
    />
  ) : mode === "review" ? (
    <ReviewWorkspace items={reviewItems} expertMode={expertMode} />
  ) : (
    <SettingsWorkspace
      workMode={workMode}
      onWorkModeChange={setWorkMode}
      diagnostics={telemetry as DiagnosticEntry[]}
      onClearDiagnostics={() => setTelemetry([])}
      truthSnapshot={settingsTruthSnapshot}
      loginAdapters={settingsLoginAdapters}
      openRouterCredentialStatus={openRouterCredentialStatus}
      openRouterApiKeyInput={openRouterApiKeyInput}
      openRouterModelInput={openRouterModelInput}
      onOpenRouterApiKeyInputChange={setOpenRouterApiKeyInput}
      onOpenRouterModelInputChange={setOpenRouterModelInput}
      onSaveOpenRouterCredentials={handleSaveOpenRouterCredentials}
      onTestOpenRouterCredentials={handleTestOpenRouterCredentials}
      isSavingOpenRouterCredentials={isSavingOpenRouterCredentials}
      isTestingOpenRouterCredentials={isTestingOpenRouterCredentials}
      openRouterCredentialMessage={openRouterCredentialMessage}
      buildIntegrationStartUrl={buildSettingsIntegrationStartUrl}
      onIntegrationAction={handleIntegrationAction}
      verificationResults={settingsVerificationResults}
      onVerifyConnection={handleSettingsVerifyConnection}
    />
  );
  const statusToneForBadge = currentStatusTone === "error" ? "error" : currentStatusTone === "ready" ? "ready" : "partial";
  const activeMobileNav = mode === "chat" || mode === "github" || mode === "matrix" ? mode : "context";
  const hasRepoContext = Boolean(githubSession?.metadata.selectedRepoFullName);
  const repoChipLabel = hasRepoContext
    ? `⊟ ${githubSession?.metadata.selectedRepoFullName}`
    : (locale === "de" ? "⊡ Kein Kontext" : "⊡ No context");
  const branchChipLabel = hasRepoContext
    ? (githubContext.expertDetails.branchName ?? ui.common.na)
    : (locale === "de" ? "Tippe ⊡ für Repo" : "Tap ⊡ to load repo");
  const commitChipLabel = hasRepoContext
    ? (githubSession?.metadata.proposalPlan?.baseSha?.slice(0, 6)
      ?? githubSession?.metadata.analysisBundle?.baseSha?.slice(0, 6)
      ?? ui.common.na)
    : (locale === "de" ? "Datei wählen" : "Choose a file");
  const streamCounterLabel = runtimeDiagnostics
    ? String(runtimeDiagnostics.counters.chatStreamStarted)
    : ui.common.loading;
  const showRouteOwnershipContext = mode === "github" || mode === "matrix";
  const mobileContextNavBadge = hasRepoContext ? (locale === "de" ? "Datei" : "Ask") : undefined;
  const mobileWorkspaceSurface = workspaceSurface;

  if (isMobileViewport) {
    return (
      <main className="app-shell app-shell-console app-shell-mobile" data-testid="app-shell">
        <header className="mobile-topbar">
          <button
            type="button"
            className="mobile-brand-button"
            onPointerDown={handleMobileBrandPointerDown}
            onPointerUp={clearMobileBrandLongPress}
            onPointerCancel={clearMobileBrandLongPress}
            onPointerLeave={clearMobileBrandLongPress}
            onClick={handleMobileBrandClick}
            aria-label={locale === "de" ? "Zur Chat-Ansicht wechseln. Lange drücken für Einstellungen." : "Switch to chat. Long press for settings."}
          >
            <span className="mosaicstacked-mark" aria-hidden="true">
              <MosaicStackedIcon />
            </span>
            <span>{ui.shell.appTitle}</span>
          </button>

          <div className="mobile-topbar-actions">
            <button
              type="button"
              className="secondary-button mobile-model-badge"
              onClick={() => handleWorkspaceTabSelect("settings")}
              aria-label={locale === "de" ? "Modelleinstellungen öffnen" : "Open model settings"}
            >
              {activeModelAlias ?? ui.common.na}
            </button>
            <span className={`mobile-live-indicator mobile-live-indicator-${healthState.tone}`} aria-hidden="true" />
          </div>
        </header>

        <section className="mobile-context-strip" aria-label={locale === "de" ? "Aktiver Kontext" : "Active context"}>
          <button
            type="button"
            className="mobile-context-chip mobile-context-chip-action"
            onClick={handleMobileContextToggle}
          >
            {repoChipLabel}
          </button>
          <span className="mobile-context-chip">{branchChipLabel}</span>
          <span className="mobile-context-chip">{commitChipLabel}</span>
          <span className="mobile-context-live">{`↯ ${streamCounterLabel}`}</span>
        </section>

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
              className="mobile-context-backdrop"
              aria-label={locale === "de" ? "Kontext schließen" : "Close context"}
              onClick={() => setMobileContextOpen(false)}
            />
            <section className="mobile-context-sheet" aria-label={ui.shell.workspaceContextSuffix}>
              <header className="mobile-context-sheet-header">
                <SectionLabel>{ui.shell.workspaceContextSuffix}</SectionLabel>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setMobileContextOpen(false)}
                >
                  {locale === "de" ? "Schließen" : "Close"}
                </button>
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
                      ? "Kein Kontext geladen. Öffne GitHub und wähle ein Repo oder eine Datei."
                      : "No context loaded yet. Open GitHub and choose a repository or file."}
                  </p>
                ) : null}

                <div className="mobile-context-actions">
                  <button type="button" className="secondary-button" onClick={() => handleMobileNavSelect("review")}>
                    {appText.processGoReview}
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
                    title={mode === "github" ? "GitHub status ladder" : "Matrix status ladder"}
                    rows={routeOwnershipRows}
                  />
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        <BottomNav
          ariaLabel={ui.shell.workspacesLabel}
          items={[
            ...MOBILE_NAV_MODES.map((workspaceMode) => ({
              key: workspaceMode,
              label: ui.shell.workspaceTabs[workspaceMode].label,
              icon: <WorkspaceIcon mode={workspaceMode} />,
              active: activeMobileNav === workspaceMode,
              onPress: () => handleMobileNavSelect(workspaceMode),
              testId: `tab-${workspaceMode}`,
            })),
            {
              key: "context",
              label: locale === "de" ? "Kontext" : "Context",
              icon: <MobileContextIcon />,
              active: activeMobileNav === "context" || mobileContextOpen,
              onPress: handleMobileContextToggle,
              testId: "tab-context",
              badge: mobileContextNavBadge,
            },
          ]}
        />
      </main>
    );
  }

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
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
          <button
            type="button"
            className="theme-toggle-button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
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
                  className={mode === workspaceMode ? "workspace-tab workspace-tab-active workspace-tab-vertical workspace-tab-shell-active" : "workspace-tab workspace-tab-vertical"}
                  onClick={() => handleWorkspaceTabSelect(workspaceMode)}
                  aria-label={ui.shell.workspaceTabs[workspaceMode].label}
                  aria-current={mode === workspaceMode ? "page" : undefined}
                  data-testid={`tab-${workspaceMode}`}
                  title={ui.shell.workspaceTabs[workspaceMode].label}
                >
                  <WorkspaceIcon mode={workspaceMode} />
                  <span>
                    <strong>{ui.shell.workspaceTabs[workspaceMode].label}</strong>
                    {expertMode ? <small>{ui.shell.workspaceTabs[workspaceMode].description}</small> : null}
                  </span>
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
              title={mode === "github" ? "GitHub route ownership" : "Matrix route ownership"}
              testId="truth-rail-route-ownership"
              badge={<StatusBadge tone="muted">backend-owned</StatusBadge>}
            >
              <MutedSystemCopy>
                GitHub and Matrix are not browser integrations. The console sends governed intent; backend owns credentials, execution, verification, and sanitized errors.
              </MutedSystemCopy>
              <RouteStatusLadder
                title={mode === "github" ? "GitHub status ladder" : "Matrix status ladder"}
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
              {approvalSummary.hasApprovals && mode !== "review" ? (
                <button type="button" className="secondary-button" onClick={() => handleWorkspaceTabSelect("review")}>
                  {appText.processGoReview}
                </button>
              ) : mode === "review" && reviewItems.length === 0 ? (
                <button type="button" className="secondary-button" onClick={() => handleWorkspaceTabSelect(workspaceState.activeWorkspace)}>
                  {appText.processGoWorkspace}
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
    </main>
  );
}
