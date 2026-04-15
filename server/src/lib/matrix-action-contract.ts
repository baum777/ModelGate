import { z } from "zod";

export const MatrixUpdateRoomTopicRequestSchema = z.object({
  type: z.literal("update_room_topic"),
  roomId: z.string().trim().min(1),
  topic: z.string().refine((value) => value.trim().length > 0, {
    message: "Matrix topic must not be blank"
  })
});

export const MatrixActionExecuteRequestSchema = z.object({
  approval: z.literal(true)
});

export const MatrixActionPlanIdSchema = z.string().trim().min(1);

export type MatrixUpdateRoomTopicRequest = z.infer<typeof MatrixUpdateRoomTopicRequestSchema>;

export type MatrixActionExecuteRequest = z.infer<typeof MatrixActionExecuteRequestSchema>;

export type MatrixActionType = "update_room_topic";

export type MatrixActionStatus = "pending_review" | "executed";

export type MatrixActionVerificationStatus = "verified" | "mismatch" | "pending" | "failed";

export type MatrixActionPlan = {
  planId: string;
  type: MatrixActionType;
  roomId: string;
  status: MatrixActionStatus;
  createdAt: string;
  expiresAt: string;
  diff: {
    field: "topic";
    before: string | null;
    after: string;
  };
  requiresApproval: true;
};

export type MatrixActionExecutionResult = {
  planId: string;
  status: "executed";
  executedAt: string;
  transactionId: string;
};

export type MatrixActionVerificationResult = {
  planId: string;
  status: MatrixActionVerificationStatus;
  checkedAt: string;
  expected: string;
  actual: string | null;
};

