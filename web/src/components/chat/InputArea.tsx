import { useCallback, useEffect, useRef } from "react";
import { Button } from "../shared/Button.js";

type InputAreaProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

const MIN_TEXTAREA_HEIGHT = 44;

export function InputArea({ value, onChange, onSend, disabled = false }: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = useCallback(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }

    const maxHeight = Math.floor(window.innerHeight * 0.4);
    node.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
    const nextHeight = Math.min(node.scrollHeight, maxHeight);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = node.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, value]);

  useEffect(() => {
    window.addEventListener("resize", resizeTextarea);
    return () => window.removeEventListener("resize", resizeTextarea);
  }, [resizeTextarea]);

  const handleSendClick = useCallback(() => {
    if (disabled || value.trim().length === 0) {
      return;
    }

    onSend();
  }, [disabled, onSend, value]);

  return (
    <section className="mobile-chat-input-wrap" aria-label="Chat input">
      <label className="mobile-chat-input-label" htmlFor="mobile-chat-input">Message</label>
      <div className="mobile-chat-input-row">
        <textarea
          ref={textareaRef}
          id="mobile-chat-input"
          className="mobile-chat-input"
          placeholder="Ask about this file, plan the next step, or paste a stacktrace..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSendClick();
            }
          }}
          rows={1}
          inputMode="text"
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="send"
        />

        <Button
          variant="primary"
          className="mobile-chat-send-button"
          onClick={handleSendClick}
          aria-label="Send message"
          disabled={disabled || value.trim().length === 0}
        >
          Send
        </Button>
      </div>
    </section>
  );
}
