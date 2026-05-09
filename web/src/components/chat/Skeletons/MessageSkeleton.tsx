export function MessageSkeleton({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <div className={`mobile-chat-skeleton-row mobile-chat-skeleton-row-${align}`} aria-hidden="true">
      <div className="mobile-chat-skeleton-bubble">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
