import { useState } from "react";
import { ChatWorkspace } from "./components/ChatWorkspace.js";
import { MatrixWorkspace } from "./components/MatrixWorkspace.js";

type WorkspaceMode = "matrix" | "chat";

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>("matrix");

  return (
    <main className="app-shell app-shell-wide">
      <header className="app-header">
        <div>
          <p className="app-kicker">ModelGate</p>
          <h1>Backend-gated workspaces</h1>
          <p className="app-deck">
            Matrix Workspace is now wired as a bounded review workflow. OpenRouter chat remains available as a separate consumer surface.
          </p>
        </div>

        <nav className="workspace-tabs" role="tablist" aria-label="Workspace mode">
          <button
            type="button"
            className={mode === "matrix" ? "workspace-tab workspace-tab-active" : "workspace-tab"}
            onClick={() => setMode("matrix")}
            role="tab"
            aria-selected={mode === "matrix"}
          >
            Matrix Workspace
          </button>
          <button
            type="button"
            className={mode === "chat" ? "workspace-tab workspace-tab-active" : "workspace-tab"}
            onClick={() => setMode("chat")}
            role="tab"
            aria-selected={mode === "chat"}
          >
            OpenRouter Chat
          </button>
        </nav>
      </header>

      {mode === "matrix" ? <MatrixWorkspace /> : <ChatWorkspace />}
    </main>
  );
}
