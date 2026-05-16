import React, { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../lib/localization.js";

type FloatingCompanionCopy = {
  buttonShortLabel: string;
  buttonAriaLabel: string;
  tooltipLabel: string;
  panelTitle: string;
  panelDescription: string;
  assistantModeLabel: string;
  inputLabel: string;
  inputPlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
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
    assistantModeLabel: "Assistant mode",
    inputLabel: "Deine Frage",
    inputPlaceholder: "Frage zu Navigation, Funktion oder Problem …",
    submitLabel: "Senden",
    submittingLabel: "Sende …",
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
    assistantModeLabel: "Assistant mode",
    inputLabel: "Your question",
    inputPlaceholder: "Ask about navigation, features, or an issue …",
    submitLabel: "Send",
    submittingLabel: "Sending …",
    closeLabel: "Minimize",
    quickActionsTitle: "Quick actions",
    quickActions: [
      "What can I do here?",
      "Report a problem",
      "Explain the next step",
    ],
  },
};

export function normalizeCompanionInput(value: string) {
  return value.trim();
}

export function canSubmitCompanionInput(value: string) {
  return normalizeCompanionInput(value).length > 0;
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
  modeLabel: string;
  inputValue: string;
  lastMessage: string | null;
  isSubmitting: boolean;
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
  modeLabel,
  inputValue,
  lastMessage,
  isSubmitting,
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
      <p className="floating-companion-mode" data-testid="floating-companion-mode">{modeLabel}</p>

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
            disabled={!canSubmitCompanionInput(inputValue) || isSubmitting}
          >
            {isSubmitting ? copy.submittingLabel : copy.submitLabel}
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
  onSubmitQuestion?: (question: string) => Promise<string>;
};

export function FloatingCompanion({ locale, onSubmitQuestion }: FloatingCompanionProps) {
  const panelId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const companionCopy = FLOATING_COMPANION_COPY[locale];
  const assistantModeEnabled = typeof onSubmitQuestion === "function";

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

  const submitInput = async (value: string) => {
    const normalized = normalizeCompanionInput(value);
    if (normalized.length === 0) {
      return;
    }

    if (!assistantModeEnabled || !onSubmitQuestion) {
      setLastMessage(locale === "de"
        ? "Companion-Backend nicht verfügbar."
        : "Companion backend unavailable.");
      setInputValue("");
      return;
    }

    setIsSubmitting(true);
    try {
      const backendResponse = await onSubmitQuestion(normalized);
      setLastMessage(backendResponse);
    } catch (error) {
      setLastMessage(error instanceof Error ? error.message : (
        locale === "de"
          ? "Companion-Backend nicht verfügbar."
          : "Companion backend unavailable."
      ));
    } finally {
      setIsSubmitting(false);
    }
    setInputValue("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitInput(inputValue);
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
          modeLabel={companionCopy.assistantModeLabel}
          inputValue={inputValue}
          lastMessage={lastMessage}
          isSubmitting={isSubmitting}
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
