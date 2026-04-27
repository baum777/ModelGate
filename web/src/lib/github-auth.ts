export type GitHubAuthState = {
  status: "loading" | "locked" | "authenticated";
  busy: boolean;
  error: string | null;
};

export type GitHubAuthAction =
  | { type: "session_check_started" }
  | { type: "session_check_succeeded"; authenticated: boolean }
  | { type: "session_check_failed"; error: string }
  | { type: "login_started" }
  | { type: "login_succeeded" }
  | { type: "login_failed"; error: string }
  | { type: "logout_started" }
  | { type: "logout_succeeded" }
  | { type: "logout_failed"; error: string };

export function createInitialGitHubAuthState(): GitHubAuthState {
  return {
    status: "loading",
    busy: false,
    error: null
  };
}

export function githubAuthReducer(state: GitHubAuthState, action: GitHubAuthAction): GitHubAuthState {
  switch (action.type) {
    case "session_check_started":
      return {
        ...state,
        status: "loading",
        busy: true,
        error: null
      };
    case "session_check_succeeded":
      return {
        status: action.authenticated ? "authenticated" : "locked",
        busy: false,
        error: null
      };
    case "session_check_failed":
      return {
        status: "locked",
        busy: false,
        error: action.error
      };
    case "login_started":
    case "logout_started":
      return {
        ...state,
        busy: true,
        error: null
      };
    case "login_succeeded":
      return {
        status: "authenticated",
        busy: false,
        error: null
      };
    case "login_failed":
    case "logout_failed":
      return {
        status: "locked",
        busy: false,
        error: action.error
      };
    case "logout_succeeded":
      return {
        status: "locked",
        busy: false,
        error: null
      };
    default:
      return state;
  }
}

export function describeGitHubAuthError(code: string) {
  switch (code) {
    case "auth_invalid_credentials":
      return "Invalid credentials.";
    case "auth_not_configured":
      return "Admin-Login ist auf dem Server nicht konfiguriert.";
    case "auth_required":
      return "GitHub ist gesperrt, bis du dich anmeldest.";
    default:
      return code;
  }
}
