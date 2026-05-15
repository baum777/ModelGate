import { GitHubClientError, type GitHubClient } from "./github-client.js";
import type { GitHubContextBundle, GitHubContextRequest, GitHubCitation, GitHubRepoSummary, GitHubTreeEntry } from "./github-contract.js";
import type { GitHubConfig } from "./github-env.js";
import { normalizeGitHubRelativePath } from "./github-paths.js";

export type GitHubContextBuilder = {
  buildContext(request: GitHubContextRequest): Promise<GitHubContextBundle>;
};

type GitHubContextBuilderOptions = {
  config: GitHubConfig;
  client: GitHubClient;
};

type RankedFileCandidate = {
  path: string;
  score: number;
  selected: boolean;
};

function isLikelyTextContent(content: string) {
  return !content.includes("\u0000");
}

function tokenizeQuestion(question: string) {
  return [...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getFileName(filePath: string) {
  const segments = filePath.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : filePath;
}

function isAnchorFile(filePath: string) {
  return new Set([
    "package.json",
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "tsconfig.json",
    "README.md",
    "README.mdx",
    "README.markdown",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "Makefile",
    "docker-compose.yml",
    "Dockerfile"
  ]).has(getFileName(filePath));
}

function scoreFilePath(filePath: string, questionTokens: string[], selectedPaths: string[], rootPath: string) {
  let score = 0;
  const normalizedPath = filePath.toLowerCase();
  const baseName = getFileName(filePath).toLowerCase();

  if (rootPath && (filePath === rootPath || filePath.startsWith(`${rootPath}/`))) {
    score += 40;
  }

  for (const selectedPath of selectedPaths) {
    const selected = selectedPath.toLowerCase();

    if (filePath === selectedPath) {
      score += 1000;
      continue;
    }

    if (filePath.startsWith(`${selectedPath}/`)) {
      score += 700 - Math.min(200, filePath.slice(selectedPath.length + 1).split("/").length * 10);
    }

    if (selectedPath.startsWith(`${filePath}/`)) {
      score += 120;
    }

    if (normalizedPath.includes(selected) || baseName.includes(selected)) {
      score += 120;
    }
  }

  for (const token of questionTokens) {
    if (normalizedPath.includes(token)) {
      score += 20;
    }

    if (baseName.includes(token)) {
      score += 35;
    }
  }

  if (isAnchorFile(filePath)) {
    score += 15;
  }

  score -= Math.min(30, filePath.length / 20);

  return score;
}

function sortCandidates(left: RankedFileCandidate, right: RankedFileCandidate) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.selected !== right.selected) {
    return left.selected ? -1 : 1;
  }

  return left.path.localeCompare(right.path);
}

function buildExcerpt(content: string, questionTokens: string[], maxChars: number) {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  const maxLines = 18;
  const matchIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return questionTokens.some((token) => lower.includes(token));
  });

  const startLine = matchIndex === -1 ? 0 : Math.max(0, matchIndex - 2);
  const endLine = Math.min(lines.length, startLine + maxLines);
  const excerptLines = lines.slice(startLine, endLine);
  let excerpt = excerptLines.join("\n");
  let truncated = endLine < lines.length || excerpt.length > maxChars;

  if (excerpt.length > maxChars) {
    excerpt = excerpt.slice(0, maxChars);
    truncated = true;
  }

  return {
    excerpt,
    startLine: startLine + 1,
    endLine,
    truncated
  };
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function combineCitationExcerpt(path: string, excerpt: string) {
  return `${path}\n${excerpt}`.slice(0, 1024);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeSelectedPaths(selectedPaths: string[] | undefined) {
  const normalized = (selectedPaths ?? []).map((value) => normalizeGitHubRelativePath(value));

  if (normalized.some((value) => value === null)) {
    throw new GitHubClientError({
      code: "invalid_request",
      status: 400,
      operation: "GitHub context build",
      path: "/api/github/context",
      baseUrl: "unavailable",
      message: "GitHub selected path was invalid"
    });
  }

  return uniqueStrings(normalized.filter((value): value is string => value !== null));
}

function normalizeRootPath(rootPath: string | undefined) {
  if (!rootPath) {
    return "";
  }

  const normalized = normalizeGitHubRelativePath(rootPath);

  if (!normalized) {
    throw new GitHubClientError({
      code: "invalid_request",
      status: 400,
      operation: "GitHub context build",
      path: "/api/github/context",
      baseUrl: "unavailable",
      message: "GitHub root path was invalid"
    });
  }

  return normalized;
}

async function ensureSelectedPathsExist(
  fileEntries: GitHubTreeEntry[],
  selectedPaths: string[],
  owner: string,
  repo: string,
  ref: string,
  client: GitHubClient
) {
  const selectedFilePaths = new Set<string>();

  for (const selectedPath of selectedPaths) {
    const directMatches = fileEntries.filter((entry) => entry.path === selectedPath || entry.path.startsWith(`${selectedPath}/`));

    if (directMatches.length > 0) {
      for (const entry of directMatches) {
        selectedFilePaths.add(entry.path);
      }
      continue;
    }

    try {
      const file = await client.readRepositoryFile(owner, repo, {
        ref,
        path: selectedPath
      });

      selectedFilePaths.add(file.path);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === "github_file_not_found") {
        throw new GitHubClientError({
          code: "github_file_not_found",
          status: 404,
          operation: "GitHub context build",
          path: `/api/github/context`,
          baseUrl: "unavailable",
          message: `GitHub selected path was not found: ${selectedPath}`
        });
      }

      throw error;
    }
  }

  return selectedFilePaths;
}

function buildRepoWarnings(
  summary: GitHubRepoSummary,
  treeTruncated: boolean,
  effectiveMaxFiles: number,
  effectiveMaxBytes: number,
  request: GitHubContextRequest,
  requestedMaxFiles: number,
  requestedMaxBytes: number
) {
  const warnings: string[] = [];

  if (summary.status !== "ready") {
    warnings.push(`Repository status is ${summary.status}; context may be incomplete`);
  }

  if (treeTruncated) {
    warnings.push("Repository tree was truncated while building context");
  }

  if (requestedMaxFiles > effectiveMaxFiles) {
    warnings.push(`Context file count was capped to ${effectiveMaxFiles}`);
  }

  if (requestedMaxBytes > effectiveMaxBytes) {
    warnings.push(`Context byte budget was capped to ${effectiveMaxBytes}`);
  }

  return warnings;
}

export function createGitHubContextBuilder(options: GitHubContextBuilderOptions): GitHubContextBuilder {
  const { config, client } = options;

  return {
    async buildContext(request) {
      const repoOwner = request.repo.owner.trim().toLowerCase();
      const repoName = request.repo.repo.trim().toLowerCase();
      const rootPath = normalizeRootPath(request.rootPath);
      const selectedPaths = normalizeSelectedPaths(request.selectedPaths);
      const summary = await client.readRepositorySummary(repoOwner, repoName);
      const resolvedRef = request.ref?.trim() || (summary.defaultBranch !== "unknown" ? summary.defaultBranch : "");

      if (!resolvedRef) {
        throw new GitHubClientError({
          code: "github_repo_not_found",
          status: 404,
          operation: "GitHub context build",
          path: "/api/github/context",
          baseUrl: "unavailable",
          message: "GitHub repository was not found"
        });
      }

      const baseSha = resolvedRef === summary.defaultBranch && summary.defaultBranchSha
        ? summary.defaultBranchSha
        : (await client.readRepositoryCommit(repoOwner, repoName, resolvedRef)).sha;
      const effectiveMaxFiles = clamp(request.maxFiles ?? config.maxContextFiles, 1, config.maxContextFiles);
      const effectiveMaxBytes = clamp(request.maxBytes ?? config.maxContextBytes, 256, config.maxContextBytes);
      const requestedMaxFiles = request.maxFiles ?? effectiveMaxFiles;
      const requestedMaxBytes = request.maxBytes ?? effectiveMaxBytes;
      const tree = await client.readRepositoryTree(repoOwner, repoName, {
        ref: resolvedRef,
        path: rootPath || undefined,
        depth: rootPath ? 10 : 8,
        maxEntries: Math.max(effectiveMaxFiles * 40, 200)
      });
      const questionTokens = tokenizeQuestion(request.question);
      const fileEntries = tree.entries.filter((entry) => entry.type === "file");
      const pinnedPaths = selectedPaths.length > 0
        ? await ensureSelectedPathsExist(fileEntries, selectedPaths, repoOwner, repoName, resolvedRef, client)
        : new Set<string>();
      const rankedCandidates = fileEntries
        .map((entry) => ({
          path: entry.path,
          selected: pinnedPaths.has(entry.path),
          score: scoreFilePath(entry.path, questionTokens, selectedPaths, rootPath)
        }))
        .sort(sortCandidates);

      const candidatePaths = [
        ...[...pinnedPaths].sort((left, right) => left.localeCompare(right)),
        ...rankedCandidates.map((entry) => entry.path).filter((path) => !pinnedPaths.has(path))
      ];

      const files: GitHubContextBundle["files"] = [];
      const citations: GitHubCitation[] = [];
      const warnings = buildRepoWarnings(summary, tree.truncated, effectiveMaxFiles, effectiveMaxBytes, request, requestedMaxFiles, requestedMaxBytes);
      let usedBytes = 0;
      let budgetTruncated = false;

      for (const candidatePath of candidatePaths) {
        if (files.length >= effectiveMaxFiles || usedBytes >= effectiveMaxBytes) {
          budgetTruncated = true;
          break;
        }

        const candidateEntry = fileEntries.find((entry) => entry.path === candidatePath);

        if (!candidateEntry) {
          continue;
        }

        const file = await client.readRepositoryFile(repoOwner, repoName, {
          ref: resolvedRef,
          path: candidatePath
        });

        if (!isLikelyTextContent(file.content) || file.binary) {
          warnings.push(`Skipped binary file: ${candidatePath}`);
          continue;
        }

        const remainingBytes = effectiveMaxBytes - usedBytes;
        const excerpt = buildExcerpt(file.content, questionTokens, remainingBytes);

        if (!excerpt.excerpt.trim()) {
          warnings.push(`Skipped empty file: ${candidatePath}`);
          continue;
        }

        const citation: GitHubCitation = {
          path: candidatePath,
          startLine: excerpt.startLine,
          endLine: excerpt.endLine,
          excerpt: combineCitationExcerpt(candidatePath, excerpt.excerpt)
        };

        const currentFile = {
          path: candidatePath,
          sha: file.sha,
          excerpt: excerpt.excerpt,
          citations: [citation],
          truncated: file.truncated || excerpt.truncated
        };

        if (usedBytes + excerpt.excerpt.length > effectiveMaxBytes) {
          budgetTruncated = true;
        }

        files.push(currentFile);
        citations.push(citation);
        usedBytes += excerpt.excerpt.length;
      }

      if (budgetTruncated) {
        warnings.push("Context budget was exhausted");
      }

      const generatedAt = new Date().toISOString();
      const bundle = {
        repo: summary,
        ref: resolvedRef,
        baseSha,
        question: request.question,
        files,
        tree,
        citations,
        tokenBudget: {
          maxTokens: Math.max(1, Math.floor(effectiveMaxBytes / 4)),
          usedTokens: estimateTokens(files.map((file) => `${file.path}\n${file.excerpt}`).join("\n\n")),
          truncated: budgetTruncated
        },
        warnings,
        generatedAt
      } satisfies GitHubContextBundle;

      return bundle;
    }
  };
}
