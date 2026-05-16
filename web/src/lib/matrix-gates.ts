import type { MatrixRoomTopicAgentPlan } from "./matrix-api.js";
import type { MatrixExecutionResult } from "./matrix-api.js";

export type TopicPhase =
  | "idle"
  | "scoped"
  | "prepared"
  | "approval_pending"
  | "executing"
  | "verified"
  | "blocked";

export type MatrixGateState = {
  topicPlan: MatrixRoomTopicAgentPlan | null;
  topicApprovalPending: boolean;
  topicPrepareLoading: boolean;
  topicPrepareError: string | null;
  topicExecuteLoading: boolean;
  topicExecuteError: string | null;
  topicVerifyLoading: boolean;
  topicVerifyError: string | null;
  topicVerificationStatus: "verified" | "mismatch" | "pending" | "failed" | null;
  topicPlanRefreshLoading: boolean;
  topicPlanRefreshError: string | null;
  stalePlanDetected: boolean;
  hasScope: boolean;
};

export type MatrixGateCapabilities = {
  canExecuteTopic: boolean;
};

export type MatrixGateHealth = {
  backendHealthy: boolean;
};

export type MatrixGatePolicy = {
  failClosed: boolean;
};

export type MatrixGates = {
  topicPhase: TopicPhase;
  canPrepareTopic: boolean;
  canRefreshTopicPlan: boolean;
  canApproveTopic: boolean;
  canRejectTopic: boolean;
  canVerifyTopic: boolean;
};

export function computeMatrixGates(
  state: MatrixGateState,
  capabilities: MatrixGateCapabilities,
  health: MatrixGateHealth,
  policy: MatrixGatePolicy,
): MatrixGates {
  const backendReady = health.backendHealthy && capabilities.canExecuteTopic;
  const planPendingReview = state.topicPlan?.status === "pending_review";
  const planExecuted = state.topicPlan?.status === "executed";
  const hasBlockingErrors = Boolean(
    state.topicPrepareError
    || state.topicExecuteError
    || state.topicVerifyError
    || state.topicPlanRefreshError,
  );

  let topicPhase: TopicPhase = "idle";
  if (hasBlockingErrors) {
    topicPhase = "blocked";
  } else if (state.topicExecuteLoading) {
    topicPhase = "executing";
  } else if (state.topicVerificationStatus === "verified") {
    topicPhase = "verified";
  } else if (state.topicApprovalPending && planPendingReview) {
    topicPhase = "approval_pending";
  } else if (planPendingReview || planExecuted) {
    topicPhase = "prepared";
  } else if (state.hasScope) {
    topicPhase = "scoped";
  }

  const canPrepareTopic = backendReady && !state.topicPrepareLoading && !state.topicExecuteLoading && !state.topicVerifyLoading;
  const canRefreshTopicPlan = backendReady && Boolean(state.topicPlan) && !state.topicPlanRefreshLoading && !state.topicExecuteLoading;
  const canApproveTopic = backendReady
    && planPendingReview
    && !state.topicExecuteLoading
    && !state.topicVerifyLoading
    && !state.topicPlanRefreshLoading
    && !state.stalePlanDetected
    && (policy.failClosed ? !state.topicPlanRefreshError : true);
  const canRejectTopic = canApproveTopic;
  const canVerifyTopic = backendReady
    && Boolean(state.topicPlan)
    && !state.topicVerifyLoading
    && !state.topicExecuteLoading
    && (planPendingReview || planExecuted);

  return {
    topicPhase,
    canPrepareTopic,
    canRefreshTopicPlan,
    canApproveTopic,
    canRejectTopic,
    canVerifyTopic,
  };
}

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
  const gates = computeMatrixGates(
    {
      topicPlan,
      topicApprovalPending: approvalPending,
      topicPrepareLoading: false,
      topicPrepareError: null,
      topicExecuteLoading: executionLoading,
      topicExecuteError: null,
      topicVerifyLoading: false,
      topicVerifyError: null,
      topicVerificationStatus: null,
      topicPlanRefreshLoading: planRefreshLoading,
      topicPlanRefreshError: planRefreshError,
      stalePlanDetected,
      hasScope: true,
    },
    { canExecuteTopic: true },
    { backendHealthy: true },
    { failClosed: true },
  );

  return gates.canApproveTopic && !executionResult;
}
