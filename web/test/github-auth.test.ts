import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialGitHubAuthState,
  describeGitHubAuthError,
  githubAuthReducer
} from "../src/lib/github-auth.js";

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
  assert.equal(state.error, "Invalid credentials.");

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
