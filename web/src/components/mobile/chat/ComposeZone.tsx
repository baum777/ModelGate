import { useLayoutEffect, type FormEvent, type KeyboardEvent, type MutableRefObject } from "react";

export function ComposeZone({
  value,
  placeholder,
  disabled,
  submitDisabled,
  submitLabel,
  ariaLabel,
  textareaRef,
  onChange,
  onKeyDown,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  ariaLabel: string;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  }, [textareaRef, value]);

  return (
    <form className="composer governed-composer mobile-compose-zone" onSubmit={onSubmit}>
      <div className="mobile-compose-field">
        <textarea
          className="mobile-compose-input"
          data-testid="chat-composer"
          aria-label={ariaLabel}
          ref={(node) => {
            textareaRef.current = node;
          }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
        />
        <button
          type="submit"
          className="secondary-button mobile-compose-submit"
          data-testid="chat-send"
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
