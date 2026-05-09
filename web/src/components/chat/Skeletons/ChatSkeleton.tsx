import { MessageSkeleton } from "./MessageSkeleton.js";

export function ChatSkeleton() {
  return (
    <section className="mobile-chat-skeleton" aria-label="Loading chat" role="status">
      <div className="mobile-chat-skeleton-status" />
      <div className="mobile-chat-skeleton-list">
        <MessageSkeleton align="left" />
        <MessageSkeleton align="right" />
        <MessageSkeleton align="left" />
        <MessageSkeleton align="right" />
      </div>
      <div className="mobile-chat-skeleton-input" />
    </section>
  );
}
