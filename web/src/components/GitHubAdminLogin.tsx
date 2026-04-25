import React from "react";
import type { FormEvent } from "react";
import type { GitHubAuthState } from "../lib/github-auth.js";
import { useLocalization } from "../lib/localization.js";
import { GuideOverlay, getWorkspaceGuide } from "./GuideOverlay.js";

type GitHubAdminLoginProps = {
  authState: GitHubAuthState;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export function GitHubAdminLogin({
  authState,
  password,
  onPasswordChange,
  onSubmit
}: GitHubAdminLoginProps) {
  const { locale, copy: ui } = useLocalization();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="workspace-panel github-admin-login" data-testid="github-admin-login">
      <section className="workspace-hero github-login-hero">
        <div>
          <p className="status-pill status-partial">
            {authState.status === "authenticated"
              ? ui.auth.statusAuthenticated
              : authState.status === "loading"
                ? ui.auth.statusChecking
                : ui.auth.statusLocked}
          </p>
          <h1>{ui.auth.title}</h1>
          <p className="hero-copy">{ui.auth.intro}</p>
          <div className="workspace-hero-actions">
            <GuideOverlay content={getWorkspaceGuide(locale, "github")} testId="guide-github" />
          </div>
        </div>
      </section>

      <article className="workspace-card github-login-card">
        <header className="card-header">
          <div>
            <span>{ui.auth.cardTitle}</span>
            <strong>{ui.auth.cardSubtitle}</strong>
          </div>
        </header>

        <form className="github-login-form" onSubmit={handleSubmit}>
          <label htmlFor="github-admin-password">{ui.auth.passwordLabel}</label>
          <input
            id="github-admin-password"
            type="password"
            autoComplete="current-password"
            required
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
            <span className="muted-copy">{ui.auth.hint}</span>
            <button type="submit" disabled={authState.busy || password.trim().length === 0}>
              {authState.busy ? ui.auth.submitBusy : ui.auth.submit}
            </button>
          </div>
        </form>
      </article>

      <article className="workspace-card github-login-hint">
        <p className="muted-copy">{ui.auth.footerNote}</p>
      </article>
    </section>
  );
}
