import type { MatrixRoomTopicAgentPlan } from "./matrix-api.js";
import type { MatrixExecutionResult } from "./matrix-api.js";

export function canApproveTopicUpdateExecution(options: {
  approvalPending: boolean;
  executionLoading: boolean;
  executionResult: MatrixExecutionResult | null;
  planRefreshError: string | null;
  planRefreshLoading: boolean;
  topicPlan: MatrixRoomTopicAgentPlan | null;
  stalePlanDetected: boolean;
}) {
  const { approvalPending, executionLoading, executionResult, planRefreshError, planRefreshLoading, topicPlan, stalePlanDetected } = options;

  return Boolean(topicPlan)
    && approvalPending
    && !executionLoading
    && !executionResult
    && !planRefreshError
    && !planRefreshLoading
    && !stalePlanDetected
    && topicPlan !== null
    && topicPlan.status === "pending_review";
}
