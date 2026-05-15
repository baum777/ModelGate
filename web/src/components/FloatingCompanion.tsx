import React, { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../lib/localization.js";

type FloatingCompanionCopy = {
  buttonShortLabel: string;
  buttonAriaLabel: string;
  tooltipLabel: string;
  panelTitle: string;
  panelDescription: string;
  inputLabel: string;
  inputPlaceholder: string;
  submitLabel: string;
  closeLabel: string;
  quickActionsTitle: string;
  quickActions: string[];
};

const FLOATING_COMPANION_COPY: Record<Locale, FloatingCompanionCopy> = {
  de: {
    buttonShortLabel: "Hilfe",
    buttonAriaLabel: "Helpdesk Companion öffnen",
    tooltipLabel: "Brauchst du Hilfe?",
    panelTitle: "Helpdesk Companion",
    panelDescription: "Frag mich etwas zur App, zu Funktionen oder nächsten Schritten.",
    inputLabel: "Deine Frage",
    inputPlaceholder: "Frage zu Navigation, Funktion oder Problem …",
    submitLabel: "Senden",
    closeLabel: "Minimieren",
    quickActionsTitle: "Schnellaktionen",
    quickActions: [
      "Was kann ich hier tun?",
      "Problem melden",
      "Nächsten Schritt erklären",
    ],
  },
  en: {
    buttonShortLabel: "Help",
    buttonAriaLabel: "Open helpdesk companion",
    tooltipLabel: "Need help?",
    panelTitle: "Helpdesk Companion",
    panelDescription: "Ask me about app features, navigation, or your next step.",
    inputLabel: "Your question",
    inputPlaceholder: "Ask about navigation, features, or an issue …",
    submitLabel: "Send",
    closeLabel: "Minimize",
    quickActionsTitle: "Quick actions",
    quickActions: [
      "What can I do here?",
      "Report a problem",
      "Explain the next step",
    ],
  },
};

const PLACEHOLDER_REPLY: Record<Locale, string> = {
  de: "Danke, ich habe deine Frage erfasst. Die Helpdesk-Anbindung kann hier später ergänzt werden.",
  en: "Thanks, I captured your question. A real helpdesk integration can be connected here later.",
};

export function normalizeCompanionInput(value: string) {
  return value.trim();
}

export function canSubmitCompanionInput(value: string) {
  return normalizeCompanionInput(value).length > 0;
}

export function buildCompanionPlaceholderResponse(locale: Locale) {
  return PLACEHOLDER_REPLY[locale];
}

type FloatingCompanionButtonProps = {
  isOpen: boolean;
  panelId: string;
  copy: FloatingCompanionCopy;
  onToggle: () => void;
};

export function FloatingCompanionButton({
  isOpen,
  panelId,
  copy,
  onToggle,
}: FloatingCompanionButtonProps) {
  return (
    <div className="floating-companion-trigger">
      <button
        type="button"
        className="floating-companion-control floating-companion-button"
        aria-label={copy.buttonAriaLabel}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={onToggle}
      >
        <span className="floating-companion-icon" aria-hidden="true">✦</span>
        <span className="floating-companion-button-label">{copy.buttonShortLabel}</span>
      </button>
      <p className="floating-companion-tooltip" aria-hidden="true">{copy.tooltipLabel}</p>
    </div>
  );
}

type FloatingCompanionPanelProps = {
  panelId: string;
  inputId: string;
  copy: FloatingCompanionCopy;
  inputValue: string;
  lastMessage: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onQuickAction: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function FloatingCompanionPanel({
  panelId,
  inputId,
  copy,
  inputValue,
  lastMessage,
  inputRef,
  onClose,
  onInputChange,
  onQuickAction,
  onSubmit,
}: FloatingCompanionPanelProps) {
  return (
    <section id={panelId} className="floating-companion-panel" role="dialog" aria-label={copy.panelTitle}>
      <header className="floating-companion-panel-header">
        <strong className="floating-companion-title">{copy.panelTitle}</strong>
        <button
          type="button"
          className="floating-companion-control floating-companion-close"
          aria-label={copy.closeLabel}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <p className="floating-companion-copy">{copy.panelDescription}</p>

      <div className="floating-companion-quick-actions" aria-label={copy.quickActionsTitle}>
        {copy.quickActions.map((quickAction) => (
          <button
            key={quickAction}
            type="button"
            className="floating-companion-control floating-companion-quick-action"
            onClick={() => onQuickAction(quickAction)}
          >
            {quickAction}
          </button>
        ))}
      </div>

      <form className="floating-companion-form" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="floating-companion-input-label">{copy.inputLabel}</label>
        <div className="floating-companion-input-row">
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={inputValue}
            placeholder={copy.inputPlaceholder}
            onChange={(event) => onInputChange(event.target.value)}
          />
          <button
            type="submit"
            className="floating-companion-control floating-companion-submit"
            disabled={!canSubmitCompanionInput(inputValue)}
          >
            {copy.submitLabel}
          </button>
        </div>
      </form>

      {lastMessage ? (
        <p className="floating-companion-feedback" role="status">
          {lastMessage}
        </p>
      ) : null}
    </section>
  );
}

type FloatingCompanionProps = {
  locale: Locale;
  onSubmitQuestion?: (question: string) => string | undefined;
};

export function FloatingCompanion({ locale, onSubmitQuestion }: FloatingCompanionProps) {
  const panelId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const companionCopy = FLOATING_COMPANION_COPY[locale];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const submitInput = (value: string) => {
    const normalized = normalizeCompanionInput(value);
    if (normalized.length === 0) {
      return;
    }

    const customResponse = onSubmitQuestion?.(normalized);
    setLastMessage(customResponse ?? buildCompanionPlaceholderResponse(locale));
    setInputValue("");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitInput(inputValue);
  };

  const handleQuickAction = (value: string) => {
    setInputValue(value);
    inputRef.current?.focus();
  };

  return (
    <div className="floating-companion" data-state={isOpen ? "open" : "closed"} data-testid="floating-companion">
      <FloatingCompanionButton
        isOpen={isOpen}
        panelId={panelId}
        copy={companionCopy}
        onToggle={() => setIsOpen((current) => !current)}
      />
      {isOpen ? (
        <FloatingCompanionPanel
          panelId={panelId}
          inputId={inputId}
          copy={companionCopy}
          inputValue={inputValue}
          lastMessage={lastMessage}
          inputRef={inputRef}
          onClose={() => setIsOpen(false)}
          onInputChange={setInputValue}
          onQuickAction={handleQuickAction}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
