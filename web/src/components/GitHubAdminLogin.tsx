import React from "react";
import type { FormEvent } from "react";
import type { GitHubAuthState } from "../lib/github-auth.js";

type GitHubAdminLoginProps = {
  authState: GitHubAuthState;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

function authStatusLabel(status: GitHubAuthState["status"]) {
  switch (status) {
    case "authenticated":
      return "Freigeschaltet";
    case "loading":
      return "Prüfe Session";
    default:
      return "Gesperrt";
  }
}

export function GitHubAdminLogin({
  authState,
  password,
  onPasswordChange,
  onSubmit
}: GitHubAdminLoginProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="workspace-panel github-admin-login" data-testid="github-admin-login">
      <section className="workspace-hero github-login-hero">
        <div>
          <p className="status-pill status-partial">{authStatusLabel(authState.status)}</p>
          <h1>GitHub Login</h1>
          <p className="hero-copy">
            Der Zugriff auf GitHub-Read-Routen ist serverseitig gesperrt, bis du dich mit dem Admin-Passwort anmeldest.
          </p>
        </div>
      </section>

      <article className="workspace-card github-login-card">
        <header className="card-header">
          <div>
            <span>Serverseitige Authentifizierung</span>
            <strong>Admin-Passwort eingeben</strong>
          </div>
        </header>

        <form className="github-login-form" onSubmit={handleSubmit}>
          <label htmlFor="github-admin-password">Admin-Passwort</label>
          <input
            id="github-admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            disabled={authState.busy}
          />

          {authState.error ? (
            <p className="error-banner" role="alert">
              {authState.error}
            </p>
          ) : null}

          <div className="action-row">
            <span className="muted-copy">
              Passwort bleibt nur im HttpOnly-Session-Cookie auf dem Server.
            </span>
            <button type="submit" disabled={authState.busy || password.trim().length === 0}>
              {authState.busy ? "Anmelden…" : "Anmelden"}
            </button>
          </div>
        </form>
      </article>

      <article className="workspace-card github-login-hint">
        <p className="muted-copy">
          Nach der Anmeldung werden die GitHub-Read-Routen freigeschaltet. Der Schreibpfad bleibt zusätzlich an den serverseitigen Admin-Key gebunden.
        </p>
      </article>
    </section>
  );
}
