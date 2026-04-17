import { z } from "zod";

export type GitHubErrorCode =
  | "github_not_configured"
  | "github_unauthorized"
  | "github_forbidden"
  | "github_repo_not_allowed"
  | "github_repo_not_found"
  | "github_file_not_found"
  | "github_branch_conflict"
  | "github_stale_plan"
  | "github_patch_invalid"
  | "github_pr_create_failed"
  | "github_verification_failed"
  | "github_rate_limited"
  | "github_timeout"
  | "github_propose_timeout"
  | "github_malformed_response"
  | "github_internal_error"
  | "invalid_request"
  | "github_plan_not_found"
  | "github_plan_expired"
  | "github_plan_already_executed";

export type GitHubErrorEnvelope = {
  ok: false;
  error: {
    code: GitHubErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
};

export type GitHubRepoStatus = "ready" | "blocked" | "unreachable";
export type GitHubPlanStatus = "pending_review" | "executed";
export type GitHubVerificationStatus = "verified" | "mismatch" | "pending" | "failed";
export type GitHubDiffChangeType = "added" | "modified" | "deleted" | "renamed";
export type GitHubFileEncoding = "utf-8" | "base64";

export type GitHubRepoSummary = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  defaultBranchSha: string | null;
  description: string | null;
  isPrivate: boolean;
  status: GitHubRepoStatus;
  permissions: {
    canWrite: boolean;
  };
  checkedAt: string;
};

export type GitHubTreeEntry = {
  path: string;
  type: "file" | "directory" | "symlink" | "submodule";
  sha: string | null;
  size: number | null;
  mode: string | null;
};

export type GitHubFileTree = {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  rootPath: string;
  entries: GitHubTreeEntry[];
  truncated: boolean;
  generatedAt: string;
};

export type GitHubFileContent = {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  sha: string;
  encoding: GitHubFileEncoding;
  content: string;
  language: string | null;
  size: number;
  lineCount: number | null;
  truncated: boolean;
  binary: boolean;
  generatedAt: string;
};

export type GitHubCitation = {
  path: string;
  startLine: number;
  endLine: number;
  excerpt?: string;
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

export type GitHubProposalFileDraft = {
  path: string;
  changeType: "modified" | "added";
  afterContent: string;
};

export type GitHubProposalDraft = {
  summary: string;
  rationale: string;
  riskLevel: "low_surface" | "medium_surface" | "high_surface";
  files: GitHubProposalFileDraft[];
};

export type GitHubDiffFile = {
  path: string;
  oldPath?: string;
  changeType: GitHubDiffChangeType;
  beforeSha: string | null;
  afterSha: string | null;
  additions: number;
  deletions: number;
  patch: string;
  citations: GitHubCitation[];
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
  status: GitHubVerificationStatus;
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

export type GitHubChangePlan = {
  planId: string;
  repo: GitHubRepoSummary;
  baseRef: string;
  baseSha: string;
  branchName: string;
  targetBranch: string;
  status: GitHubPlanStatus;
  stale: boolean;
  requiresApproval: true;
  summary: string;
  rationale: string;
  riskLevel: "low_surface" | "medium_surface" | "high_surface";
  citations: GitHubCitation[];
  diff: GitHubDiffFile[];
  generatedAt: string;
  expiresAt: string;
  execution?: GitHubExecuteResult;
  verification?: GitHubVerifyResult;
};

export const GitHubRepoPathParamsSchema = z.object({
  owner: z.string().trim().min(1),
  repo: z.string().trim().min(1)
}).strict();

export const GitHubRepoTreeQuerySchema = z.object({
  ref: z.string().trim().min(1).optional(),
  path: z.string().trim().min(1).optional(),
  depth: z.coerce.number().int().min(0).max(10).optional(),
  maxEntries: z.coerce.number().int().min(1).max(1_000).optional()
}).strict();

export const GitHubRepoFileQuerySchema = z.object({
  ref: z.string().trim().min(1).optional(),
  path: z.string().trim().min(1)
}).strict();

export const GitHubContextRequestSchema = z.object({
  repo: z.object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1)
  }).strict(),
  question: z.string().trim().min(1),
  ref: z.string().trim().min(1).optional(),
  selectedPaths: z.array(z.string().trim().min(1)).optional(),
  rootPath: z.string().trim().min(1).optional(),
  maxFiles: z.coerce.number().int().min(1).max(20).optional(),
  maxBytes: z.coerce.number().int().min(256).max(200_000).optional()
}).strict();

export const GitHubChangeProposalRequestSchema = z.object({
  repo: z.object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1)
  }).strict(),
  objective: z.string().trim().min(1),
  question: z.string().trim().min(1).optional(),
  ref: z.string().trim().min(1).optional(),
  selectedPaths: z.array(z.string().trim().min(1)).optional(),
  constraints: z.array(z.string().trim().min(1)).optional(),
  baseBranch: z.string().trim().min(1).optional(),
  targetBranch: z.string().trim().min(1).optional(),
  mode: z.enum(["smoke"]).optional(),
  intent: z.string().trim().min(1).optional()
}).strict();

export const GitHubProposalFileDraftSchema = z.object({
  path: z.string().trim().min(1),
  changeType: z.enum(["modified", "added"]),
  afterContent: z.string().min(1)
}).strict();

export const GitHubProposalDraftSchema = z.object({
  summary: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  riskLevel: z.enum(["low_surface", "medium_surface", "high_surface"]),
  files: z.array(GitHubProposalFileDraftSchema).min(1).max(10)
}).strict();

export const GitHubExecuteRequestSchema = z.object({
  approval: z.literal(true)
}).strict();

export const GitHubPlanIdSchema = z.string().trim().min(1);

const GITHUB_ERROR_MESSAGES: Record<GitHubErrorCode, string> = {
  github_not_configured: "GitHub backend is not configured",
  github_unauthorized: "GitHub credentials were rejected",
  github_forbidden: "GitHub backend denied access",
  github_repo_not_allowed: "GitHub repository is not allowlisted",
  github_repo_not_found: "GitHub repository was not found",
  github_file_not_found: "GitHub file was not found",
  github_branch_conflict: "GitHub branch conflict",
  github_stale_plan: "GitHub plan is stale and must be refreshed",
  github_patch_invalid: "GitHub patch is invalid",
  github_pr_create_failed: "GitHub pull request creation failed",
  github_verification_failed: "GitHub verification failed",
  github_rate_limited: "GitHub rate limit was hit",
  github_timeout: "GitHub backend request timed out",
  github_propose_timeout: "GitHub proposal generation timed out",
  github_malformed_response: "GitHub backend returned an invalid response",
  github_internal_error: "GitHub backend failed",
  invalid_request: "Invalid GitHub request",
  github_plan_not_found: "GitHub plan was not found",
  github_plan_expired: "GitHub plan expired",
  github_plan_already_executed: "GitHub plan was already executed"
};

const GITHUB_ERROR_STATUS: Record<GitHubErrorCode, number> = {
  github_not_configured: 503,
  github_unauthorized: 401,
  github_forbidden: 403,
  github_repo_not_allowed: 403,
  github_repo_not_found: 404,
  github_file_not_found: 404,
  github_branch_conflict: 409,
  github_stale_plan: 409,
  github_patch_invalid: 422,
  github_pr_create_failed: 502,
  github_verification_failed: 502,
  github_rate_limited: 429,
  github_timeout: 504,
  github_propose_timeout: 504,
  github_malformed_response: 502,
  github_internal_error: 500,
  invalid_request: 400,
  github_plan_not_found: 404,
  github_plan_expired: 410,
  github_plan_already_executed: 409
};

export function buildGitHubErrorResponse(code: GitHubErrorCode, message?: string, retryAfterSeconds?: number): GitHubErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      message: message ?? GITHUB_ERROR_MESSAGES[code],
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {})
    }
  };
}

export function githubErrorStatus(code: GitHubErrorCode) {
  return GITHUB_ERROR_STATUS[code];
}
