export type GitHubFileRisk = "low" | "medium" | "high";

export type GitHubFileStatus = "added" | "modified" | "removed";

export type GitHubFileNode = {
  path: string;
  status: GitHubFileStatus;
  risk: GitHubFileRisk;
  additions: number;
  deletions: number;
};

export type DiffLineKind = "context" | "added" | "removed";

export type DiffLine = {
  kind: DiffLineKind;
  content: string;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type RiskMarker = {
  label: string;
  tone: GitHubFileRisk;
  detail: string;
};

export type GitHubReviewSurface = {
  repoFullName: string;
  branchName: string;
  files: GitHubFileNode[];
  diffsByPath: Record<string, DiffHunk[]>;
  risksByPath: Record<string, RiskMarker[]>;
};
