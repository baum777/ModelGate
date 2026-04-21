import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GitHubAdminLogin } from "../src/components/GitHubAdminLogin.js";
import {
  createInitialGitHubAuthState,
  describeGitHubAuthError,
  githubAuthReducer
} from "../src/lib/github-auth.js";

test("github admin login screen renders the password form", () => {
  const markup = renderToStaticMarkup(
    React.createElement(GitHubAdminLogin, {
      authState: {
        status: "locked",
        busy: false,
        error: null
      },
      password: "",
      onPasswordChange: () => {
        // no-op
      },
      onSubmit: () => {
        // no-op
      }
    })
  );

  assert.match(markup, /GitHub login/);
  assert.match(markup, /Admin password/);
  assert.match(markup, /type="password"/);
  assert.match(markup, /Sign in/);
});

test("github auth reducer unlocks on success, surfaces failures, and locks on logout", () => {
  let state = createInitialGitHubAuthState();

  state = githubAuthReducer(state, {
    type: "session_check_succeeded",
    authenticated: false
  });
  assert.equal(state.status, "locked");
  assert.equal(state.error, null);

  state = githubAuthReducer(state, {
    type: "login_failed",
    error: describeGitHubAuthError("auth_invalid_credentials")
  });
  assert.equal(state.status, "locked");
  assert.equal(state.error, "Das Passwort ist falsch.");

  state = githubAuthReducer(state, {
    type: "login_succeeded"
  });
  assert.equal(state.status, "authenticated");
  assert.equal(state.error, null);

  state = githubAuthReducer(state, {
    type: "logout_succeeded"
  });
  assert.equal(state.status, "locked");
  assert.equal(state.error, null);
});
