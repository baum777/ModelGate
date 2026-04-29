import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocalization } from "../lib/localization.js";

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

type CopyState = "idle" | "copied" | "failed";

function normalizeLanguage(rawLanguage: string | null | undefined) {
  const language = (rawLanguage ?? "").trim().toLowerCase();
  if (!language) {
    return null;
  }

  return language;
}

function extractFenceLanguage(className: string | undefined) {
  if (!className) {
    return null;
  }

  const match = className.match(/language-([A-Za-z0-9_+-]+)/);
  return normalizeLanguage(match?.[1]);
}

function safeHref(rawHref: string | undefined) {
  if (!rawHref) {
    return null;
  }

  const href = rawHref.trim();
  if (!href) {
    return null;
  }

  const normalized = href.toLowerCase();
  if (
    normalized.startsWith("javascript:")
    || normalized.startsWith("vbscript:")
    || normalized.startsWith("data:")
    || normalized.startsWith("file:")
  ) {
    return null;
  }

  if (
    normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.startsWith("mailto:")
    || normalized.startsWith("tel:")
    || normalized.startsWith("/")
    || normalized.startsWith("./")
    || normalized.startsWith("../")
    || normalized.startsWith("#")
  ) {
    return href;
  }

  return null;
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("clipboard unavailable");
  }
}

const CodeFenceBlock = React.memo(function CodeFenceBlock(props: {
  code: string;
  language: string | null;
  isDiff: boolean;
}) {
  const { copy: ui } = useLocalization();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const languageLabel = props.language ?? ui.chat.codeLanguageFallback;

  async function handleCopy() {
    try {
      await copyTextToClipboard(props.code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    } finally {
      setTimeout(() => {
        setCopyState("idle");
      }, 1400);
    }
  }

  const copyLabel = copyState === "copied"
    ? ui.chat.copyCodeCopied
    : copyState === "failed"
      ? ui.chat.copyCodeFailed
      : ui.chat.copyCode;

  return (
    <div className={`chat-code-block ${props.isDiff ? "chat-code-block-diff" : ""}`}>
      <div className="chat-code-block-toolbar">
        <span className="chat-code-language">{languageLabel}</span>
        <button
          type="button"
          className="secondary-button chat-code-copy-button"
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyLabel}
        </button>
      </div>
      <pre>
        <code>{props.code}</code>
      </pre>
    </div>
  );
});

export function hasRichTextContent(content: string) {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|`[^`]+`/.test(content);
}

export const MarkdownMessage = React.memo(function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const normalizedContent = useMemo(() => content || "", [content]);

  return (
    <div className={`markdown-message ${className ?? ""}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const safe = safeHref(href);
            if (!safe) {
              return <span>{children}</span>;
            }

            const external = /^https?:\/\//i.test(safe);
            return (
              <a
                href={safe}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer noopener" : undefined}
              >
                {children}
              </a>
            );
          },
          code: ({ className: codeClassName, children, ...rest }) => {
            const code = String(children ?? "");
            const language = extractFenceLanguage(codeClassName);
            const isFence = Boolean(codeClassName?.includes("language-"));

            if (!isFence) {
              return (
                <code className="chat-inline-code" {...rest}>
                  {children}
                </code>
              );
            }

            const isDiff = language === "diff" || language === "patch";
            return (
              <CodeFenceBlock
                code={code.replace(/\n$/, "")}
                language={language}
                isDiff={isDiff}
              />
            );
          }
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});
