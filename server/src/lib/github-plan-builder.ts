import { GitHubClientError, type GitHubClient } from "./github-client.js";
import {
  GitHubProposalDraftSchema,
  type GitHubChangePlan,
  type GitHubChangeProposalRequest,
  type GitHubContextBundle,
  type GitHubDiffFile,
  type GitHubProposalDraft,
} from "./github-contract.js";
import type { GitHubConfig } from "./github-env.js";
import type { ModelRegistry } from "./model-policy.js";
import type { OpenRouterClient } from "./openrouter.js";

type GitHubProposalPlannerOptions = {
  config: GitHubConfig;
  client: GitHubClient;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
};

type BuildGitHubProposalPlanOptions = {
  planId: string;
  request: GitHubChangeProposalRequest;
  context: GitHubContextBundle;
  createdAt: string;
};

type LoadedProposalFile = {
  path: string;
  content: string;
  sha: string;
  binary: boolean;
  truncated: boolean;
};

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitContentLines(value: string) {
  const normalized = normalizeLineEndings(value);

  if (normalized.length === 0) {
    return [];
  }

  const lines = normalized.split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function renderPatchLines(prefix: string, lines: string[]) {
  if (lines.length === 0) {
    return `${prefix}`;
  }

  return lines.map((line) => `${prefix}${line}`).join("\n");
}

function buildReviewableReplacementPatch(path: string, beforeContent: string, afterContent: string) {
  const beforeLines = splitContentLines(beforeContent);
  const afterLines = splitContentLines(afterContent);
  const beforeBlock = renderPatchLines("-", beforeLines);
  const afterBlock = renderPatchLines("+", afterLines);

  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ reviewable replacement @@",
    beforeBlock,
    afterBlock
  ].join("\n");
}

function buildRiskLevel(fileCount: number, warnings: string[]) {
  if (warnings.length > 0 || fileCount >= 5) {
    return "high_surface" as const;
  }

  if (fileCount >= 3) {
    return "medium_surface" as const;
  }

  return "low_surface" as const;
}

function buildPromptPayload(
  request: GitHubChangeProposalRequest,
  context: GitHubContextBundle,
  files: LoadedProposalFile[]
) {
  return {
    repo: {
      owner: context.repo.owner,
      repo: context.repo.repo,
      fullName: context.repo.fullName
    },
    objective: request.objective,
    question: request.question ?? request.objective,
    ref: context.ref,
    baseSha: context.baseSha,
    constraints: request.constraints ?? [],
    files: files.map((file) => {
      const contextFile = context.files.find((entry) => entry.path === file.path);

      return {
        path: file.path,
        sha: file.sha,
        binary: file.binary,
        truncated: file.truncated,
        citations: contextFile?.citations ?? [],
        currentContent: file.content
      };
    })
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    const fencedJson = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);

    if (fencedJson) {
      const candidate = fencedJson[1]?.trim();

      if (candidate && candidate.startsWith("{") && candidate.endsWith("}")) {
        return candidate;
      }
    }

    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub proposal generation",
      path: "/api/github/actions/propose",
      baseUrl: "unavailable",
      message: "GitHub proposal response was not valid JSON"
    });
  }

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub proposal generation",
      path: "/api/github/actions/propose",
      baseUrl: "unavailable",
      message: "GitHub proposal response was not valid JSON"
    });
  }

  return trimmed;
}

function isProposalPathAllowed(context: GitHubContextBundle, path: string) {
  return context.files.some((file) => file.path === path);
}

async function loadProposalFiles(
  client: GitHubClient,
  context: GitHubContextBundle
): Promise<LoadedProposalFile[]> {
  const files: LoadedProposalFile[] = [];

  for (const entry of context.files) {
    const file = await client.readRepositoryFile(context.repo.owner, context.repo.repo, {
      ref: context.ref,
      path: entry.path
    });

    if (file.binary || file.truncated) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub proposal file content was not fully readable: ${entry.path}`
      });
    }

    files.push({
      path: file.path,
      content: normalizeLineEndings(file.content),
      sha: file.sha,
      binary: file.binary,
      truncated: file.truncated
    });
  }

  return files;
}

async function generateProposalDraft(
  options: GitHubProposalPlannerOptions,
  request: GitHubChangeProposalRequest,
  context: GitHubContextBundle,
  files: LoadedProposalFile[]
): Promise<GitHubProposalDraft> {
  const selection = options.modelRegistry.resolveModel();

  if (!selection.ok) {
    throw new GitHubClientError({
      code: "github_not_configured",
      status: 503,
      operation: "GitHub proposal generation",
      path: "/api/github/actions/propose",
      baseUrl: "unavailable",
      message: "GitHub proposal backend is not configured"
    });
  }

  const response = await options.openRouter.createChatCompletion(
    {
      stream: false,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            "You are a backend GitHub proposal planner.",
            "Return JSON only.",
            "Do not include markdown fences or commentary.",
            "Use only the supplied repository content.",
            "Do not invent files outside the supplied file list.",
            "Only propose modified files with non-empty afterContent.",
            "The output must match this schema:",
            '{"summary":"string","rationale":"string","riskLevel":"low_surface|medium_surface|high_surface","files":[{"path":"string","changeType":"modified","afterContent":"string"}]}',
            `INPUT:${JSON.stringify(buildPromptPayload(request, context, files))}`
          ].join("\n")
        }
      ]
    },
    selection.selection
  );

  try {
    const jsonText = extractJsonObject(response.text);
    const parsed = JSON.parse(jsonText) as unknown;
    return GitHubProposalDraftSchema.parse(parsed);
  } catch {
    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub proposal generation",
      path: "/api/github/actions/propose",
      baseUrl: "unavailable",
      message: "GitHub proposal response was invalid"
    });
  }
}

function buildGitHubDiffFiles(
  draft: GitHubProposalDraft,
  context: GitHubContextBundle,
  files: LoadedProposalFile[]
): GitHubDiffFile[] {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const nextDiff: GitHubDiffFile[] = [];
  const seen = new Set<string>();

  for (const draftFile of draft.files) {
    const file = filesByPath.get(draftFile.path);

    if (!file) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub proposal referenced an unreadable file: ${draftFile.path}`
      });
    }

    if (!isProposalPathAllowed(context, draftFile.path)) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub proposal referenced a file outside the context bundle: ${draftFile.path}`
      });
    }

    if (seen.has(draftFile.path)) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub proposal duplicated a file: ${draftFile.path}`
      });
    }

    seen.add(draftFile.path);

    const afterContent = normalizeLineEndings(draftFile.afterContent);

    if (afterContent.trim().length === 0) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub proposal generated an empty replacement for ${draftFile.path}`
      });
    }

    if (afterContent === file.content) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub proposal did not change ${draftFile.path}`
      });
    }

    const beforeLines = splitContentLines(file.content);
    const afterLines = splitContentLines(afterContent);

    nextDiff.push({
      path: draftFile.path,
      changeType: "modified",
      beforeSha: file.sha,
      afterSha: null,
      additions: afterLines.length,
      deletions: beforeLines.length,
      patch: buildReviewableReplacementPatch(draftFile.path, file.content, afterContent),
      citations: context.files.find((entry) => entry.path === draftFile.path)?.citations ?? []
    });
  }

  nextDiff.sort((left, right) => left.path.localeCompare(right.path));

  return nextDiff;
}

function buildProposalRationale(draft: GitHubProposalDraft, context: GitHubContextBundle, fileCount: number) {
  const fileLabel = fileCount === 1 ? "file" : "files";

  return [
    draft.rationale.trim(),
    `Validated against ${fileCount} cited ${fileLabel} from ${context.repo.fullName} at ${context.ref}.`
  ].join(" ");
}

export function createGitHubProposalPlanner(options: GitHubProposalPlannerOptions) {
  return {
    async buildPlan(buildOptions: BuildGitHubProposalPlanOptions): Promise<GitHubChangePlan> {
      const files = await loadProposalFiles(options.client, buildOptions.context);
      const draft = await generateProposalDraft(options, buildOptions.request, buildOptions.context, files);
      const diff = buildGitHubDiffFiles(draft, buildOptions.context, files);

      if (diff.length === 0) {
        throw new GitHubClientError({
          code: "github_patch_invalid",
          status: 422,
          operation: "GitHub proposal generation",
          path: "/api/github/actions/propose",
          baseUrl: "unavailable",
          message: "GitHub proposal did not include any file changes"
        });
      }

      const branchName = `${options.config.branchPrefix}/${buildOptions.planId}`;
      const targetBranch = buildOptions.context.repo.defaultBranch;
      const citations = buildOptions.context.files.flatMap((entry) => entry.citations);

      return {
        planId: buildOptions.planId,
        repo: buildOptions.context.repo,
        baseRef: buildOptions.context.ref,
        baseSha: buildOptions.context.baseSha,
        branchName,
        targetBranch,
        status: "pending_review",
        stale: false,
        requiresApproval: true,
        summary: draft.summary.trim(),
        rationale: buildProposalRationale(draft, buildOptions.context, diff.length),
        riskLevel: draft.riskLevel ?? buildRiskLevel(diff.length, buildOptions.context.warnings),
        citations,
        diff,
        generatedAt: buildOptions.createdAt,
        expiresAt: new Date(Date.parse(buildOptions.createdAt) + options.config.planTtlMs).toISOString()
      };
    }
  };
}
