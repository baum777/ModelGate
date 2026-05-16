import { useLayoutEffect, type FormEvent, type KeyboardEvent, type MutableRefObject, type ReactNode } from "react";

export function ComposeZone({
  value,
  placeholder,
  disabled,
  submitDisabled,
  submitTooltip,
  submitLabel,
  ariaLabel,
  textareaRef,
  preInputSlot,
  postInputSlot,
  onChange,
  onKeyDown,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  submitDisabled: boolean;
  submitTooltip?: string | null;
  submitLabel: string;
  ariaLabel: string;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  preInputSlot?: ReactNode;
  postInputSlot?: ReactNode;
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
        {preInputSlot}
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
          title={submitDisabled && submitTooltip ? submitTooltip : undefined}
          aria-disabled={submitDisabled}
        >
          {submitLabel}
        </button>
        {postInputSlot}
      </div>
    </form>
  );
}
