const importMetaEnv = (import.meta as {
  env?: {
    VITE_GITHUB_API_BASE_URL?: string;
    VITE_API_BASE_URL?: string;
    PROD?: boolean;
  };
}).env ?? {};

export const GITHUB_API_BASE_URL = (
  importMetaEnv.VITE_GITHUB_API_BASE_URL
  ?? importMetaEnv.VITE_API_BASE_URL
  ?? (importMetaEnv.PROD ? "" : "http://127.0.0.1:8787")
).replace(/\/+$/, "");

function resolveGitHubApiUrl(path: string) {
  return GITHUB_API_BASE_URL ? `${GITHUB_API_BASE_URL}${path}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return "Request failed";
  }

  const error = payload.error;

  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (isRecord(error) && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (typeof payload.code === "string" && payload.code.trim().length > 0) {
    return payload.code;
  }

  return "Request failed";
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(resolveGitHubApiUrl(path), {
      ...init,
      headers,
      credentials: "include"
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.message.trim().length > 0 ? error.message : "GitHub request failed");
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      let message = response.statusText || "GitHub request failed";

      try {
        const payload = await response.json() as unknown;
        message = readErrorMessage(payload);
      } catch {
        // Fall through to the sanitized fallback message below.
      }

      throw new Error(message);
    }

    const text = await response.text();
    throw new Error(text.trim() || response.statusText || "GitHub request failed");
  }

  return response.json() as Promise<T>;
}

export type GitHubRepoSummary = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  defaultBranchSha: string | null;
  description: string | null;
  isPrivate: boolean;
  status: "ready" | "blocked" | "unreachable";
  permissions: {
    canWrite: boolean;
  };
  checkedAt: string;
};

export type GitHubCitation = {
  path: string;
  startLine: number;
  endLine: number;
  excerpt?: string;
};

export type GitHubFileTree = {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  rootPath: string;
  entries: Array<{
    path: string;
    type: "file" | "directory" | "symlink" | "submodule";
    sha: string | null;
    size: number | null;
    mode: string | null;
  }>;
  truncated: boolean;
  generatedAt: string;
};

export type GitHubFileContent = {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  sha: string;
  encoding: "utf-8" | "base64";
  content: string;
  language: string | null;
  size: number;
  lineCount: number | null;
  truncated: boolean;
  binary: boolean;
  generatedAt: string;
};

export type GitHubContextBundle = {
  repo: GitHubRepoSummary;
  ref: string;
  baseSha: string;
  question: string;
  files: Array<{
    path: string;
    sha: string;
    excerpt: string;
    citations: GitHubCitation[];
    truncated: boolean;
  }>;
  tree?: GitHubFileTree;
  citations: GitHubCitation[];
  tokenBudget: {
    maxTokens: number;
    usedTokens: number;
    truncated: boolean;
  };
  warnings: string[];
  generatedAt: string;
};

export type GitHubChangePlan = {
  planId: string;
  repo: GitHubRepoSummary;
  baseRef: string;
  baseSha: string;
  branchName: string;
  targetBranch: string;
  status: "pending_review" | "executed";
  stale: boolean;
  requiresApproval: true;
  summary: string;
  rationale: string;
  riskLevel: "low_surface" | "medium_surface" | "high_surface";
  citations: GitHubCitation[];
  diff: Array<{
    path: string;
    oldPath?: string;
    changeType: "added" | "modified" | "deleted" | "renamed";
    beforeSha: string | null;
    afterSha: string | null;
    additions: number;
    deletions: number;
    patch: string;
    citations: GitHubCitation[];
  }>;
  generatedAt: string;
  expiresAt: string;
  execution?: GitHubExecuteResult;
  verification?: GitHubVerifyResult;
};

export type GitHubRepoListResponse = {
  ok: true;
  checkedAt: string;
  repos: GitHubRepoSummary[];
};

export type GitHubContextRequest = {
  repo: {
    owner: string;
    repo: string;
  };
  question: string;
  ref?: string;
  selectedPaths?: string[];
  rootPath?: string;
  maxFiles?: number;
  maxBytes?: number;
};

export type GitHubChangeProposalRequest = {
  repo: {
    owner: string;
    repo: string;
  };
  objective: string;
  question?: string;
  ref?: string;
  selectedPaths?: string[];
  constraints?: string[];
  baseBranch?: string;
  targetBranch?: string;
  mode?: "smoke";
  intent?: string;
};

export type GitHubExecuteRequest = {
  approval: true;
};

export type GitHubExecuteResult = {
  planId: string;
  status: "executed";
  branchName: string;
  baseSha: string;
  headSha: string;
  commitSha: string;
  prNumber: number;
  prUrl: string;
  targetBranch: string;
  executedAt: string;
};

export type GitHubVerifyResult = {
  planId: string;
  status: "verified" | "mismatch" | "pending" | "failed";
  checkedAt: string;
  branchName: string;
  targetBranch: string;
  expectedBaseSha: string;
  actualBaseSha: string | null;
  expectedCommitSha: string | null;
  actualCommitSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  mismatchReasons: string[];
};

export type GitHubExecuteResponse = {
  ok: true;
  result: GitHubExecuteResult;
};

export type GitHubVerifyResponse = {
  ok: true;
  verification: GitHubVerifyResult;
};

export async function fetchGitHubRepos() {
  return requestJson<GitHubRepoListResponse>("/api/github/repos");
}

export async function fetchGitHubContext(body: GitHubContextRequest) {
  return requestJson<{ ok: true; context: GitHubContextBundle }>("/api/github/context", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function proposeGitHubAction(body: GitHubChangeProposalRequest) {
  return requestJson<{ ok: true; plan: GitHubChangePlan }>("/api/github/actions/propose", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function fetchGitHubPlan(planId: string) {
  return requestJson<{ ok: true; plan: GitHubChangePlan }>(`/api/github/actions/${encodeURIComponent(planId)}`);
}

export async function executeGitHubPlan(planId: string, body: GitHubExecuteRequest) {
  return requestJson<GitHubExecuteResponse>(`/api/github/actions/${encodeURIComponent(planId)}/execute`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function verifyGitHubPlan(planId: string) {
  return requestJson<GitHubVerifyResponse>(`/api/github/actions/${encodeURIComponent(planId)}/verify`);
}
