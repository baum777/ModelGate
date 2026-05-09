import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Message } from "./Message.js";
import { InputArea } from "./InputArea.js";
import { ChatSkeleton } from "./Skeletons/ChatSkeleton.js";
import { StatusChip } from "../shared/StatusChip.js";
import { Button } from "../shared/Button.js";
import { useVirtualScroll } from "../../hooks/useVirtualScroll.js";
import type { ChatSurfaceMessage } from "./types.js";

const INITIAL_SKELETON_MS = 160;

type ChatSurfaceProps = {
  locale?: "de" | "en";
};

function createId() {
  return crypto.randomUUID();
}

function seedMessages(): ChatSurfaceMessage[] {
  const now = Date.now();
  return [
    {
      id: createId(),
      sender: "assistant",
      text: "Session ready. Ask for a repo check, execution plan, or a quick code diff summary.",
      timestamp: new Date(now - 1000 * 60 * 9).toISOString(),
      status: "sent",
    },
    {
      id: createId(),
      sender: "user",
      text: "Check matrix API handler for malformed payload handling.",
      timestamp: new Date(now - 1000 * 60 * 8).toISOString(),
      status: "sent",
    },
    {
      id: createId(),
      sender: "assistant",
      text: "Observed fail-closed branch already exists. Suggested assertion:\n```ts\nexpect(result.ok).toBe(false);\nexpect(result.reason).toContain(\"malformed\");\n```",
      timestamp: new Date(now - 1000 * 60 * 7).toISOString(),
      status: "sent",
    },
    {
      id: createId(),
      sender: "user",
      text: "Generate a commit-ready checklist.",
      timestamp: new Date(now - 1000 * 60 * 6).toISOString(),
      status: "sent",
    },
    {
      id: createId(),
      sender: "assistant",
      text: "1. Confirm no provider IDs leak in UI\n2. Verify approval gate for write routes\n3. Run `npm run typecheck:web` and `npm run test:web`",
      timestamp: new Date(now - 1000 * 60 * 5).toISOString(),
      status: "sent",
    },
  ];
}

function createStressMessages(count: number): ChatSurfaceMessage[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index;
    const sender = index % 2 === 0 ? "assistant" : "user";
    return {
      id: createId(),
      sender,
      text: sender === "assistant"
        ? `Backlog note ${index + 1}: route ownership is backend authoritative.`
        : `Prompt ${index + 1}: verify chat flow ${offset}.`,
      timestamp: new Date(now - offset * 14_000).toISOString(),
      status: "sent",
    } satisfies ChatSurfaceMessage;
  });
}

function buildAssistantReply(input: string): string {
  const normalized = input.trim();
  if (normalized.length === 0) {
    return "Please provide input.";
  }

  if (/test|assert|spec/i.test(normalized)) {
    return "Start with a focused regression test:\n```ts\ntest(\"handles mobile context without overflow\", () => {\n  expect(layout.hasOverflow).toBe(false);\n});\n```";
  }

  if (/plan|checklist|next/i.test(normalized)) {
    return "Next gate:\n1. Validate the scope\n2. Confirm authority surface\n3. Execute smallest safe diff\n4. Re-check with tests";
  }

  return `Received. Proposed next action: \"${normalized.slice(0, 96)}\"`;
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

export function ChatSurface({ locale = "en" }: ChatSurfaceProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);

  const [isHydrating, setIsHydrating] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [latencyMs, setLatencyMs] = useState(12);
  const [messages, setMessages] = useState<ChatSurfaceMessage[]>(() => seedMessages());
  const [input, setInput] = useState("");
  const [menuMessage, setMenuMessage] = useState<ChatSurfaceMessage | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { virtualItems, topSpacerHeight, bottomSpacerHeight, scrollToIndex } = useVirtualScroll({
    items: messages,
    containerRef: scrollRef,
    estimateItemHeight: 108,
    overscan: 8,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setIsHydrating(false), INITIAL_SKELETON_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pullLabel = locale === "de" ? "Zum Aktualisieren ziehen" : "Pull to refresh";
  const refreshLabel = locale === "de" ? "Aktualisiere…" : "Refreshing…";

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const handleMessageCopy = useCallback(async (message: ChatSurfaceMessage) => {
    await copyToClipboard(message.text);
    showToast(locale === "de" ? "Nachricht kopiert" : "Message copied");
  }, [locale, showToast]);

  const handleMessageSave = useCallback((message: ChatSurfaceMessage) => {
    setMessages((previous) => ([
      ...previous,
      {
        id: createId(),
        sender: "system",
        text: locale === "de"
          ? `Gespeichert aus Nachricht ${message.id.slice(0, 6)}.`
          : `Saved from message ${message.id.slice(0, 6)}.`,
        timestamp: new Date().toISOString(),
        status: "sent",
      },
    ]));

    showToast(locale === "de" ? "Im Kontext gespeichert" : "Saved to context");
  }, [locale, showToast]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      setMessages((previous) => ([
        ...previous,
        {
          id: createId(),
          sender: "system",
          text: locale === "de"
            ? "Kontext aktualisiert. Backend-Zustand erneut synchronisiert."
            : "Context refreshed. Backend status re-synced.",
          timestamp: new Date().toISOString(),
          status: "sent",
        },
      ]));
      setIsRefreshing(false);
      setPullDistance(0);
    }, 420);
  }, [locale]);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottomRef.current = remaining <= 120;
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    scrollToIndex(messages.length, messages.length <= 12 ? "auto" : "smooth");
  }, [messages, scrollToIndex]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text.length === 0) {
      return;
    }

    const userMessage: ChatSurfaceMessage = {
      id: createId(),
      sender: "user",
      text,
      timestamp: new Date().toISOString(),
      status: "sent",
    };

    const assistantPendingId = createId();

    setMessages((previous) => ([
      ...previous,
      userMessage,
      {
        id: assistantPendingId,
        sender: "assistant",
        text: locale === "de" ? "…" : "…",
        timestamp: new Date().toISOString(),
        status: "sending",
      },
    ]));

    setInput("");
    setLatencyMs(Math.floor(8 + Math.random() * 19));
    stickToBottomRef.current = true;

    window.setTimeout(() => {
      setMessages((previous) => previous.map((entry) => (
        entry.id === assistantPendingId
          ? {
              ...entry,
              text: buildAssistantReply(text),
              status: "sent",
            }
          : entry
      )));
    }, 320);
  }, [input, locale]);

  const injectStressMessages = useCallback(() => {
    const history = createStressMessages(200);
    setMessages((previous) => [...history, ...previous]);
    showToast(locale === "de" ? "200 Nachrichten geladen" : "Loaded 200 messages");
  }, [locale, showToast]);

  const onHistoryPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (scrollRef.current?.scrollTop !== 0) {
      pullStartYRef.current = null;
      return;
    }

    pullStartYRef.current = event.clientY;
  }, []);

  const onHistoryPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pullStartYRef.current === null || isRefreshing) {
      return;
    }

    const delta = event.clientY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    setPullDistance(Math.min(84, delta * 0.45));
  }, [isRefreshing]);

  const onHistoryPointerEnd = useCallback(() => {
    if (pullStartYRef.current === null) {
      return;
    }

    pullStartYRef.current = null;
    if (pullDistance >= 56 && !isRefreshing) {
      handleRefresh();
      return;
    }

    setPullDistance(0);
  }, [handleRefresh, isRefreshing, pullDistance]);

  const virtualizedMessages = useMemo(() => virtualItems, [virtualItems]);

  if (isHydrating) {
    return <ChatSkeleton />;
  }

  return (
    <section className="mobile-chat-surface" data-testid="mobile-chat-surface">
      <header className="mobile-chat-surface-header">
        <StatusChip model="GPT-5.4" status={isRefreshing ? (locale === "de" ? "Syncing" : "Syncing") : "Ready"} latencyMs={latencyMs} />
        <div className="mobile-chat-surface-meta">
          <span>{locale === "de" ? "Touch optimiert" : "Touch optimized"}</span>
          <button type="button" className="mobile-chat-stress-button" onClick={injectStressMessages}>
            200+
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="mobile-chat-history"
        onScroll={handleScroll}
        onPointerDown={onHistoryPointerDown}
        onPointerMove={onHistoryPointerMove}
        onPointerUp={onHistoryPointerEnd}
        onPointerCancel={onHistoryPointerEnd}
      >
        <div className="mobile-chat-pull-indicator" style={{ height: `${pullDistance}px` }}>
          <span>{isRefreshing ? refreshLabel : pullLabel}</span>
        </div>

        <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" />
        {virtualizedMessages.map(({ item, measure }) => (
          <Message
            key={item.id}
            message={item}
            measureRef={measure}
            onLongPress={(selected) => setMenuMessage(selected)}
            onCopy={(selected) => {
              void handleMessageCopy(selected);
            }}
            onSave={handleMessageSave}
          />
        ))}
        <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" />
      </div>

      <InputArea value={input} onChange={setInput} onSend={handleSend} disabled={isRefreshing} />

      {menuMessage ? (
        <>
          <button
            type="button"
            className="mobile-chat-menu-backdrop"
            onClick={() => setMenuMessage(null)}
            aria-label={locale === "de" ? "Menü schließen" : "Close menu"}
          />
          <section className="mobile-chat-menu" aria-label={locale === "de" ? "Nachrichtenaktionen" : "Message actions"}>
            <p>{locale === "de" ? "Aktionen" : "Actions"}</p>
            <div className="mobile-chat-menu-actions">
              <Button variant="secondary" fullWidth onClick={() => { void handleMessageCopy(menuMessage); setMenuMessage(null); }}>Copy</Button>
              <Button variant="secondary" fullWidth onClick={() => { handleMessageSave(menuMessage); setMenuMessage(null); }}>Save</Button>
              <Button variant="ghost" fullWidth onClick={() => setMenuMessage(null)}>{locale === "de" ? "Schließen" : "Close"}</Button>
            </div>
          </section>
        </>
      ) : null}

      {toast ? <div className="mobile-chat-toast" role="status">{toast}</div> : null}
    </section>
  );
}
