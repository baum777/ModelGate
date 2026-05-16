import { useCallback, useState } from "react";
import type { ReviewItem } from "../components/ReviewWorkspace.js";

function mergeReviewItems(current: ReviewItem[], next: ReviewItem[]) {
  const remaining = current.filter(
    (item) => !next.some((candidate) => candidate.id === item.id && candidate.source === item.source),
  );
  return [...remaining, ...next];
}

export function useReviewState() {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [githubReviewDirty, setGitHubReviewDirty] = useState(false);

  const updateGitHubReviewItems = useCallback((items: ReviewItem[]) => {
    setReviewItems((current) => mergeReviewItems(current.filter((item) => item.source !== "github"), items));
  }, []);

  const updateMatrixReviewItems = useCallback((items: ReviewItem[]) => {
    setReviewItems((current) => mergeReviewItems(current.filter((item) => item.source !== "matrix"), items));
  }, []);

  return {
    reviewItems,
    githubReviewDirty,
    setGitHubReviewDirty,
    updateGitHubReviewItems,
    updateMatrixReviewItems,
  };
}
