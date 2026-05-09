import { Suspense, lazy, useMemo, useState } from "react";
import { Button } from "../shared/Button.js";
import { useTouchGestures } from "../../hooks/useTouchGestures.js";
import type { ChatSurfaceMessage } from "./types.js";

const SyntaxCodeBlock = lazy(() => import("./SyntaxCodeBlock.js").then((module) => ({ default: module.SyntaxCodeBlock })));

type MessageSegment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language?: string };

type MessageProps = {
  message: ChatSurfaceMessage;
  onLongPress?: (message: ChatSurfaceMessage) => void;
  onCopy?: (message: ChatSurfaceMessage) => void;
  onSave?: (message: ChatSurfaceMessage) => void;
  measureRef?: (node: HTMLElement | null) => void;
};

function splitMessageSegments(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const pattern = /```([\w+-]+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;

  while (true) {
    const match = pattern.exec(content);
    if (!match) {
      break;
    }

    const [raw, language, code] = match;
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore.trim().length > 0) {
      segments.push({ type: "text", content: textBefore.trim() });
    }

    segments.push({
      type: "code",
      content: code.trimEnd(),
      language: language?.trim() || undefined,
    });

    lastIndex = match.index + raw.length;
  }

  const tail = content.slice(lastIndex);
  if (tail.trim().length > 0) {
    segments.push({ type: "text", content: tail.trim() });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", content });
  }

  return segments;
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Message({ message, onLongPress, onCopy, onSave, measureRef }: MessageProps) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const segments = useMemo(() => splitMessageSegments(message.text), [message.text]);
  const roleLabel = message.sender === "user" ? "You" : message.sender === "assistant" ? "Assistant" : "System";

  const { handlers } = useTouchGestures({
    onLongPress: () => onLongPress?.(message),
    onSwipeLeft: () => setActionsVisible(true),
  });

  const isUserMessage = message.sender === "user";

  return (
    <article
      ref={measureRef}
      className={`mobile-chat-message mobile-chat-message-${message.sender}`}
      data-message-id={message.id}
      {...handlers}
    >
      <header className="mobile-chat-message-header">
        <strong>{roleLabel}</strong>
        <time dateTime={message.timestamp}>{formatMessageTime(message.timestamp)}</time>
      </header>

      <div className="mobile-chat-message-body">
        {segments.map((segment, index) => (
          segment.type === "text" ? (
            <p className="mobile-chat-text-segment" key={`${message.id}-text-${index}`}>{segment.content}</p>
          ) : (
            <Suspense fallback={<pre className="mobile-chat-code-block">{segment.content}</pre>} key={`${message.id}-code-${index}`}>
              <SyntaxCodeBlock code={segment.content} language={segment.language} />
            </Suspense>
          )
        ))}
      </div>

      {actionsVisible ? (
        <div className="mobile-chat-message-actions" role="group" aria-label="Message actions">
          <Button variant="ghost" onClick={() => onCopy?.(message)}>Copy</Button>
          <Button variant="ghost" onClick={() => onSave?.(message)}>Save</Button>
          <Button variant="ghost" onClick={() => setActionsVisible(false)}>Close</Button>
        </div>
      ) : null}

      {!isUserMessage && message.status === "sending" ? (
        <div className="mobile-chat-message-streaming" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </article>
  );
}
