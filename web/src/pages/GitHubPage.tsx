import React, { useEffect, useMemo, useState } from "react";
import { DiffViewer } from "../components/github/DiffViewer.js";
import { FileTree } from "../components/github/FileTree.js";
import { GitHubSkeleton } from "../components/github/Skeletons/GitHubSkeleton.js";
import type { GitHubReviewSurface } from "../components/github/types.js";

type GitHubPageProps = {
  locale?: "de" | "en";
  initialReview?: GitHubReviewSurface;
};

export function createMockGitHubReview(): GitHubReviewSurface {
  return {
    repoFullName: "baum777/mosaicStacked",
    branchName: "codex/mobile-github-surface",
    files: [
      {
        path: "web/src/App.tsx",
        status: "modified",
        risk: "medium",
        additions: 18,
        deletions: 4,
      },
      {
        path: "web/src/components/github/DiffViewer.tsx",
        status: "added",
        risk: "low",
        additions: 62,
        deletions: 0,
      },
      {
        path: "scripts/check-lighthouse-tti.mjs",
        status: "modified",
        risk: "low",
        additions: 7,
        deletions: 1,
      },
    ],
    risksByPath: {
      "web/src/App.tsx": [
        {
          label: "Approval gate",
          tone: "medium",
          detail: "GitHub execution stays backend-owned; browser only sends review intent.",
        },
      ],
      "web/src/components/github/DiffViewer.tsx": [
        {
          label: "Rendering scope",
          tone: "low",
          detail: "Diff preview uses static mock data and no synchronous parser.",
        },
      ],
      "scripts/check-lighthouse-tti.mjs": [
        {
          label: "Gate drift",
          tone: "low",
          detail: "Median TTI remains isolated from feature chunks.",
        },
      ],
    },
    diffsByPath: {
      "web/src/App.tsx": [
        {
          header: "@@ -76,6 +76,8 @@",
          lines: [
            { kind: "context", content: "const loadGitHubWorkspace = () => import(\"./components/GitHubWorkspace.js\");" },
            { kind: "added", content: "const loadMobileGitHubPage = () => import(\"./pages/GitHubPage.js\");" },
            { kind: "added", content: "const MobileGitHubPage = lazy(() => loadMobileGitHubPage().then((module) => ({ default: module.GitHubPage })));" },
            { kind: "removed", content: "const mobileWorkspaceSurface = workspaceSurface;" },
          ],
        },
      ],
      "web/src/components/github/DiffViewer.tsx": [
        {
          header: "@@ -0,0 +1,5 @@",
          lines: [
            { kind: "added", content: "export function DiffViewer({ file, hunks, riskMarkers }) {" },
            { kind: "added", content: "  return <section aria-label={`Diff preview for ${file.path}`}>;" },
            { kind: "context", content: "}" },
          ],
        },
      ],
      "scripts/check-lighthouse-tti.mjs": [
        {
          header: "@@ -18,7 +18,7 @@",
          lines: [
            { kind: "context", content: "const RUN_COUNT = 3;" },
            { kind: "removed", content: "const TTI_BUDGET_MS = 2500;" },
            { kind: "added", content: "const TTI_BUDGET_MS = 2600;" },
          ],
        },
      ],
    },
  };
}

function loadMockGitHubReview() {
  return new Promise<GitHubReviewSurface>((resolve) => {
    window.setTimeout(() => resolve(createMockGitHubReview()), 160);
  });
}

export function GitHubPage({ locale = "en", initialReview }: GitHubPageProps) {
  const [review, setReview] = useState<GitHubReviewSurface | null>(initialReview ?? null);
  const [selectedPath, setSelectedPath] = useState(initialReview?.files[0]?.path ?? "");

  useEffect(() => {
    if (initialReview) {
      return;
    }

    let cancelled = false;
    void loadMockGitHubReview().then((nextReview) => {
      if (cancelled) {
        return;
      }

      setReview(nextReview);
      setSelectedPath(nextReview.files[0]?.path ?? "");
    });

    return () => {
      cancelled = true;
    };
  }, [initialReview]);

  const selectedFile = useMemo(() => (
    review?.files.find((file) => file.path === selectedPath) ?? review?.files[0] ?? null
  ), [review, selectedPath]);

  if (!review || !selectedFile) {
    return <GitHubSkeleton />;
  }

  const selectedDiff = review.diffsByPath[selectedFile.path] ?? [];
  const selectedRisks = review.risksByPath[selectedFile.path] ?? [];

  return (
    <section className="github-mobile-page" aria-label="GitHub mobile review surface" data-testid="mobile-github-page">
      <div className="github-mobile-surface">
        <header className="github-mobile-header">
          <div>
            <p>{review.repoFullName}</p>
            <h2>{locale === "de" ? "GitHub Review" : "GitHub Review"}</h2>
          </div>
          <button type="button" className="github-mobile-ask-button">
            {locale === "de" ? "Datei fragen" : "Ask about this file"}
          </button>
        </header>

        <div className="github-mobile-layout">
          <FileTree files={review.files} selectedPath={selectedFile.path} onSelect={setSelectedPath} />
          <DiffViewer file={selectedFile} hunks={selectedDiff} riskMarkers={selectedRisks} />
        </div>
      </div>
    </section>
  );
}
