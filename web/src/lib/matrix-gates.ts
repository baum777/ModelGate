import type { MatrixPlan } from "./matrix-api.js";
import type { MatrixExecutionResult } from "./matrix-api.js";

export function canProceedToAnalyze(selectedRoomIds: string[], selectedSpaceIds: string[]) {
  return selectedRoomIds.some((value) => value.trim().length > 0) || selectedSpaceIds.some((value) => value.trim().length > 0);
}

export function canApproveExecution(options: {
  approvalPending: boolean;
  executionLoading: boolean;
  executionResult: MatrixExecutionResult | null;
  planRefreshError: string | null;
  planRefreshLoading: boolean;
  promotedPlan: MatrixPlan | null;
  stalePlanDetected: boolean;
}) {
  const { approvalPending, executionLoading, executionResult, planRefreshError, planRefreshLoading, promotedPlan, stalePlanDetected } = options;

  return Boolean(promotedPlan)
    && approvalPending
    && !executionLoading
    && !executionResult
    && !planRefreshError
    && !planRefreshLoading
    && !stalePlanDetected
    && !promotedPlan?.stale;
}

