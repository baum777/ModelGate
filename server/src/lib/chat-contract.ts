import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1)
}).strict();

export const ChatTaskSchema = z.enum(["dialog", "coding", "analysis", "review"]);
export const ChatModeSchema = z.enum(["balanced", "fast", "deep"]);
export const ChatPreferenceSchema = z.enum(["latency", "quality", "cost"]);

export const ChatRequestSchema = z.object({
  model: z.string().trim().min(1).optional(),
  modelAlias: z.string().trim().min(1).optional(),
  task: ChatTaskSchema.optional(),
  mode: ChatModeSchema.optional(),
  preference: ChatPreferenceSchema.optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  stream: z.boolean().default(false),
  messages: z.array(ChatMessageSchema).min(1)
}).strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatRouteMetadata = {
  selectedAlias: string;
  taskClass: z.infer<typeof ChatTaskSchema>;
  fallbackUsed: boolean;
  degraded: boolean;
  streaming: boolean;
  policyVersion?: string;
  decisionReason?: string;
  retryCount?: number;
};

export type ChatSuccessResponse = {
  ok: true;
  // Public backend alias, not the provider execution target.
  model: string;
  text: string;
  route: ChatRouteMetadata;
};

export type ChatErrorCode = "invalid_request" | "upstream_error" | "internal_error";

export type ChatErrorResponse = {
  ok: false;
  error: {
    code: ChatErrorCode;
    message: string;
  };
};

export type ChatStreamStartEvent = {
  ok: true;
  // Public backend alias, not the provider execution target.
  model: string;
};

export type ChatStreamRouteEvent = {
  ok: true;
  route: ChatRouteMetadata;
};

export type ChatStreamTokenEvent = {
  delta: string;
};

export type ChatStreamDoneEvent = {
  ok: true;
  // Public backend alias, not the provider execution target.
  model: string;
  text: string;
  route: ChatRouteMetadata;
};

export type ChatStreamErrorEvent = ChatErrorResponse;

export type ChatStreamTerminalEvent = ChatStreamDoneEvent | ChatStreamErrorEvent;
