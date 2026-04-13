import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1)
}).strict();

export const ChatRequestSchema = z.object({
  model: z.string().trim().min(1).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  stream: z.boolean().default(false),
  messages: z.array(ChatMessageSchema).min(1)
}).strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatSuccessResponse = {
  ok: true;
  model: string;
  text: string;
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
  model: string;
};

export type ChatStreamTokenEvent = {
  delta: string;
};

