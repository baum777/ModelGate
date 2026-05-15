import { GitHubClientError, type GitHubClient } from "./github-client.js";
import {
  GitHubProposalDraftSchema,
  type GitHubChangePlan,
  type GitHubChangeProposalRequest,
  type GitHubContextBundle,
  type GitHubDiffFile,
  type GitHubProposalDraft,
  type GitHubRoutingMetadata,
} from "./github-contract.js";
import type { GitHubConfig } from "./github-env.js";
import { isGitHubRepoAllowed } from "./github-env.js";
import type { ModelRegistry } from "./model-policy.js";
import type { OpenRouterClient } from "./openrouter.js";
import type { AppEnv } from "./env.js";
import type { ModelCapabilitiesConfig, WorkflowModelPolicy } from "./workflow-model-router.js";
import {
  assertStructuredOutputIfRequired,
  recordWorkflowModelDecision,
  resolveGitHubProposalModel
} from "./workflow-model-router.js";

type GitHubProposalPlannerOptions = {
  env: AppEnv;
  config: GitHubConfig;
  client: GitHubClient;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
  modelCapabilities: ModelCapabilitiesConfig;
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

const SMOKE_FILE_PATH = "docs/mosaicstacked-smoke.md";
const DEFAULT_SMOKE_BRANCH_PREFIX = "mosaicstacked/github-smoke";

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitContentLines(value: string) {
  const normalized = normalizeLineEndings(value);

  if (normalized.length === 0) {
    return [];
  }

  const lines = normalized.split("\n");

  if (lines[lines.length - 1] === "") {
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

function buildReviewableAdditionPatch(path: string, afterContent: string) {
  const afterLines = splitContentLines(afterContent);
  const afterBlock = renderPatchLines("+", afterLines);

  return [
    "--- /dev/null",
    `+++ b/${path}`,
    "@@ reviewable addition @@",
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
  const files = await Promise.all(context.files.map(async (entry) => {
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

    return {
      path: file.path,
      content: normalizeLineEndings(file.content),
      sha: file.sha,
      binary: file.binary,
      truncated: file.truncated
    };
  }));

  return files;
}

async function generateProposalDraft(
  options: GitHubProposalPlannerOptions,
  request: GitHubChangeProposalRequest,
  context: GitHubContextBundle,
  files: LoadedProposalFile[]
): Promise<{
  draft: GitHubProposalDraft;
  routingMetadata: GitHubRoutingMetadata;
}> {
  const selection = options.modelRegistry.resolveModel();
  const workflowPolicy = resolveGitHubProposalModel(options.env, options.modelCapabilities);
  const selectionReason = "reason" in selection ? selection.reason : null;

  if (!selection.ok && selectionReason !== "no_eligible_provider_targets") {
    throw new GitHubClientError({
      code: "github_not_configured",
      status: 503,
      operation: "GitHub proposal generation",
      path: "/api/github/actions/propose",
      baseUrl: "unavailable",
      message: "GitHub proposal backend is not configured"
    });
  }

  const publicSelection = selection.ok
    ? selection.selection
    : {
      publicModelId: options.modelRegistry.defaultModelId,
      publicModelAlias: options.modelRegistry.defaultModelAlias,
      logicalModelId: "stable-free-default",
      providerTargets: []
    };

  const proposalSelection = {
    ...publicSelection,
    providerTargets: workflowPolicy.candidateModels
  };

  try {
    await recordWorkflowModelDecision(workflowPolicy, "GitHub proposal generation");
  } catch {
    // Logging is advisory-only.
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
    proposalSelection
  );

  try {
    const jsonText = extractJsonObject(response.text);
    const parsed = JSON.parse(jsonText) as unknown;
    assertStructuredOutputIfRequired(workflowPolicy, parsed);
    return {
      draft: GitHubProposalDraftSchema.parse(parsed) as GitHubProposalDraft,
      routingMetadata: buildGitHubRoutingMetadata(workflowPolicy)
    };
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

function buildGitHubRoutingMetadata(policy: WorkflowModelPolicy): GitHubRoutingMetadata {
  return {
    workflowRole: "github_code_agent",
    selectedModel: policy.selectedModel,
    candidateModels: [...policy.candidateModels],
    fallbackUsed: policy.fallbackUsed,
    selectionSource: policy.selectionSource,
    routingMode: policy.routingMode,
    allowFallback: policy.allowFallback,
    failClosed: policy.failClosed,
    structuredOutputRequired: policy.structuredOutputRequired,
    approvalRequired: policy.approvalRequired,
    mayExecuteExternalTools: policy.mayExecuteExternalTools,
    mayWriteExternalState: policy.mayWriteExternalState,
    policySectionKey: policy.sectionKey ?? null,
    recordedAt: new Date().toISOString()
  };
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

function createSmokeRequestError(message: string) {
  return new GitHubClientError({
    code: "invalid_request",
    status: 400,
    operation: "GitHub proposal generation",
    path: "/api/github/actions/propose",
    baseUrl: "unavailable",
    message
  });
}

function normalizeSmokeBranchPrefix(value: string | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  const candidate = trimmed.length > 0 ? trimmed : fallback;
  const normalized = candidate.replace(/\/+$/g, "");

  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\") || normalized.endsWith("/")) {
    throw createSmokeRequestError("GitHub smoke target branch is invalid");
  }

  return normalized;
}

function buildSmokeFileContent(options: {
  repoFullName: string;
  baseBranch: string;
  smokeBranchPrefix: string;
  intent: string;
  createdAt: string;
}) {
  return [
    "# MosaicStacked smoke",
    "",
    `Generated at: ${options.createdAt}`,
    `Repo: ${options.repoFullName}`,
    `Base branch: ${options.baseBranch}`,
    `Smoke branch: ${options.smokeBranchPrefix}`,
    `Intent: ${options.intent}`
  ].join("\n") + "\n";
}

function buildSmokePlanRationale(repoFullName: string, smokeBranchPrefix: string) {
  return [
    `Deterministic smoke proposal for ${repoFullName}.`,
    `It only creates or updates ${SMOKE_FILE_PATH} on the dedicated smoke branch prefix ${smokeBranchPrefix}.`,
    "The change is documentation-only and requires approval before execution."
  ].join(" ");
}

function buildSmokeDiffFile(
  path: string,
  currentFile: LoadedProposalFile | null,
  afterContent: string
): GitHubChangePlan["diff"][number] {
  const afterLines = splitContentLines(afterContent);

  if (!currentFile) {
    return {
      path,
      changeType: "added",
      beforeSha: null,
      afterSha: null,
      additions: afterLines.length,
      deletions: 0,
      patch: buildReviewableAdditionPatch(path, afterContent),
      citations: []
    };
  }

  const beforeLines = splitContentLines(currentFile.content);

  return {
    path,
    changeType: "modified",
    beforeSha: currentFile.sha,
    afterSha: null,
    additions: afterLines.length,
    deletions: beforeLines.length,
    patch: buildReviewableReplacementPatch(path, currentFile.content, afterContent),
    citations: []
  };
}

async function buildDeterministicSmokePlan(
  options: GitHubProposalPlannerOptions,
  buildOptions: BuildGitHubProposalPlanOptions
): Promise<GitHubChangePlan> {
  const repoSummary = await options.client.readRepositorySummary(
    buildOptions.request.repo.owner,
    buildOptions.request.repo.repo
  );

  if (!isGitHubRepoAllowed(options.config, repoSummary.owner, repoSummary.repo)) {
    throw createSmokeRequestError("GitHub smoke repository is not allowlisted");
  }

  const smokeRepo = options.config.smokeRepo?.trim() || repoSummary.fullName;

  if (options.config.smokeRepo && options.config.smokeRepo.trim() !== repoSummary.fullName) {
    throw createSmokeRequestError("GitHub smoke repository did not match the configured smoke repository");
  }

  const allowedBaseBranch = options.config.smokeBaseBranch?.trim() || repoSummary.defaultBranch;
  const requestedBaseBranch = buildOptions.request.baseBranch?.trim() || allowedBaseBranch;

  if (requestedBaseBranch !== allowedBaseBranch) {
    throw createSmokeRequestError("GitHub smoke base branch is invalid");
  }

  const allowedSmokeBranchPrefix = options.config.smokeTargetBranch?.trim() || DEFAULT_SMOKE_BRANCH_PREFIX;
  const requestedSmokeBranchPrefix = buildOptions.request.targetBranch?.trim();

  if (!requestedSmokeBranchPrefix) {
    throw createSmokeRequestError("GitHub smoke target branch is required");
  }

  const smokeBranchPrefix = normalizeSmokeBranchPrefix(requestedSmokeBranchPrefix, allowedSmokeBranchPrefix);

  if (smokeBranchPrefix !== allowedSmokeBranchPrefix) {
    throw createSmokeRequestError("GitHub smoke target branch is not allowed");
  }

  if (!buildOptions.request.mode || buildOptions.request.mode !== "smoke") {
    throw createSmokeRequestError("GitHub smoke mode is required");
  }

  if (!buildOptions.request.intent || buildOptions.request.intent.trim().length === 0) {
    throw createSmokeRequestError("GitHub smoke intent is required");
  }

  if (buildOptions.request.selectedPaths && buildOptions.request.selectedPaths.length > 0) {
    throw createSmokeRequestError("GitHub smoke proposal does not accept selected paths");
  }

  if (buildOptions.request.constraints && buildOptions.request.constraints.length > 0) {
    throw createSmokeRequestError("GitHub smoke proposal does not accept constraints");
  }

  const currentCommit = await options.client.readRepositoryCommit(
    repoSummary.owner,
    repoSummary.repo,
    requestedBaseBranch
  );

  let smokeFile: LoadedProposalFile | null = null;

  try {
    const file = await options.client.readRepositoryFile(repoSummary.owner, repoSummary.repo, {
      ref: requestedBaseBranch,
      path: SMOKE_FILE_PATH
    });

    if (file.binary || file.truncated) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub proposal generation",
        path: "/api/github/actions/propose",
        baseUrl: "unavailable",
        message: `GitHub smoke file content was not fully readable: ${SMOKE_FILE_PATH}`
      });
    }

    smokeFile = {
      path: file.path,
      content: file.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
      sha: file.sha,
      binary: file.binary,
      truncated: file.truncated
    };
  } catch (error) {
    if (!(error instanceof GitHubClientError && error.code === "github_file_not_found")) {
      throw error;
    }
  }

  const createdAt = buildOptions.createdAt;
  const intent = buildOptions.request.intent.trim();
  const afterContent = buildSmokeFileContent({
    repoFullName: smokeRepo,
    baseBranch: requestedBaseBranch,
    smokeBranchPrefix,
    intent,
    createdAt
  });
  const diff = [
    buildSmokeDiffFile(SMOKE_FILE_PATH, smokeFile, afterContent)
  ];
  return {
    planId: buildOptions.planId,
    repo: repoSummary,
    baseRef: requestedBaseBranch,
    baseSha: currentCommit.sha,
    branchName: `${smokeBranchPrefix}/${buildOptions.planId}`,
    targetBranch: repoSummary.defaultBranch,
    status: "pending_review",
    stale: false,
    requiresApproval: true,
    summary: `Smoke proposal for ${repoSummary.fullName}`,
    rationale: buildSmokePlanRationale(repoSummary.fullName, smokeBranchPrefix),
    riskLevel: "low_surface",
    citations: [],
    diff,
    generatedAt: createdAt,
    expiresAt: new Date(Date.parse(createdAt) + options.config.planTtlMs).toISOString()
  };
}

export function createGitHubProposalPlanner(options: GitHubProposalPlannerOptions) {
  return {
    async buildPlan(buildOptions: BuildGitHubProposalPlanOptions): Promise<GitHubChangePlan> {
      if (buildOptions.request.mode === "smoke") {
        return buildDeterministicSmokePlan(options, buildOptions);
      }

      const files = await loadProposalFiles(options.client, buildOptions.context);
      const generated = await generateProposalDraft(options, buildOptions.request, buildOptions.context, files);
      const diff = buildGitHubDiffFiles(generated.draft, buildOptions.context, files);

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
        summary: generated.draft.summary.trim(),
        rationale: buildProposalRationale(generated.draft, buildOptions.context, diff.length),
        riskLevel: generated.draft.riskLevel ?? buildRiskLevel(diff.length, buildOptions.context.warnings),
        citations,
        diff,
        generatedAt: buildOptions.createdAt,
        expiresAt: new Date(Date.parse(buildOptions.createdAt) + options.config.planTtlMs).toISOString(),
        routingMetadata: generated.routingMetadata
      };
    }
  };
}
