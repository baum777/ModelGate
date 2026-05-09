import type { StatusPanelRow } from "../../StatusPanel.js";

type ContextBrowserPanelProps = {
  locale: "en" | "de";
  repositoryLabel: string;
  branchLabel: string;
  fileLabel: string;
  hasRepoContext: boolean;
  statusRows: StatusPanelRow[];
  onOpenGitHub: () => void;
  onOpenSettings: () => void;
  onReturnToChat: () => void;
};

export function ContextBrowserPanel({
  locale,
  repositoryLabel,
  branchLabel,
  fileLabel,
  hasRepoContext,
  statusRows,
  onOpenGitHub,
  onOpenSettings,
  onReturnToChat,
}: ContextBrowserPanelProps) {
  const copy = locale === "de"
    ? {
        title: "Kontext-Browser",
        subtitle: "Welchen Kontext will ich auswählen?",
        repo: "repo",
        branch: "branch",
        file: "file",
        openGitHub: hasRepoContext ? "GitHub-Kontext ändern" : "Repo auswählen",
        settings: "Einstellungen öffnen",
        chat: "Zurück zum Chat",
      }
    : {
        title: "Context Browser",
        subtitle: "Which context do I want to choose?",
        repo: "repo",
        branch: "branch",
        file: "file",
        openGitHub: hasRepoContext ? "Change GitHub context" : "Choose repository",
        settings: "Open settings",
        chat: "Back to chat",
      };

  return (
    <section className="context-browser-panel mobile-panel-scroll" data-testid="context-browser-panel">
      <header className="context-browser-header">
        <span className="mobile-mono">{copy.title}</span>
        <h1>{copy.subtitle}</h1>
      </header>

      <div className="context-browser-active" aria-label={copy.subtitle}>
        <div>
          <span>{copy.repo}</span>
          <strong>{repositoryLabel}</strong>
        </div>
        <div>
          <span>{copy.branch}</span>
          <strong>{branchLabel}</strong>
        </div>
        <div>
          <span>{copy.file}</span>
          <strong>{fileLabel}</strong>
        </div>
      </div>

      <div className="context-browser-actions">
        <button type="button" className="primary-button" onClick={onOpenGitHub}>
          {copy.openGitHub}
        </button>
        <button type="button" className="secondary-button" onClick={onReturnToChat}>
          {copy.chat}
        </button>
        <button type="button" className="secondary-button" onClick={onOpenSettings}>
          {copy.settings}
        </button>
      </div>

      <div className="context-browser-status">
        {statusRows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
