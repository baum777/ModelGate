export type ChatMessageSender = "user" | "assistant" | "system";

export type ChatSurfaceMessage = {
  id: string;
  sender: ChatMessageSender;
  text: string;
  timestamp: string;
  status?: "sending" | "sent" | "error";
};
