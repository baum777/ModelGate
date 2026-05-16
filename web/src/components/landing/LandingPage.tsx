import React from "react";
import { useLocalization } from "../../lib/localization.js";
import { MosaicStackedIcon, WorkspaceIcon } from "../shell/ShellIcons.js";

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

export function LandingPage() {
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

export function PublicPreview() {
  return <LandingPage />;
}

export function ReadmeLandingPage() {
  return <LandingPage />;
}
