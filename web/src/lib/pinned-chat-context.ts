import type { Locale } from "./localization.js";

export type PinnedChatContext = {
  source: "github";
  repoFullName: string;
  ref: string;
  path: string | null;
  summary: string;
  excerpt: string;
  diffPreview: string | null;
  createdAt: string;
};

const SUMMARY_MAX = 240;
const EXCERPT_MAX = 4_000;
const DIFF_PREVIEW_MAX = 8_000;

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function truncate(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max).trimEnd()}…`;
}

export function createPinnedChatContext(options: {
  repoFullName: string;
  ref: string;
  path: string | null;
  summary: string;
  excerpt: string;
  diffPreview: string | null;
  createdAt?: string;
}): PinnedChatContext {
  const summary = truncate(normalizeText(options.summary), SUMMARY_MAX);
  const excerpt = truncate(normalizeText(options.excerpt), EXCERPT_MAX);
  const diffPreview = options.diffPreview
    ? truncate(normalizeText(options.diffPreview), DIFF_PREVIEW_MAX)
    : null;

  return {
    source: "github",
    repoFullName: normalizeText(options.repoFullName),
    ref: normalizeText(options.ref),
    path: options.path ? normalizeText(options.path) : null,
    summary,
    excerpt,
    diffPreview,
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export function buildPinnedChatContextPrompt(basePrompt: string, context: PinnedChatContext | null, locale: Locale) {
  if (!context) {
    return basePrompt;
  }

  const lines = locale === "de"
    ? [
        "[Lokaler GitHub-Kontext]",
        `Repository: ${context.repoFullName}`,
        `Ref: ${context.ref}`,
        `Pfad: ${context.path ?? "n/a"}`,
        `Zusammenfassung: ${context.summary}`,
        "Auszug:",
        context.excerpt,
        ...(context.diffPreview ? ["", "Diff-Vorschau:", context.diffPreview] : []),
        "[Ende lokaler GitHub-Kontext]",
      ]
    : [
        "[Local GitHub context]",
        `Repository: ${context.repoFullName}`,
        `Ref: ${context.ref}`,
        `Path: ${context.path ?? "n/a"}`,
        `Summary: ${context.summary}`,
        "Excerpt:",
        context.excerpt,
        ...(context.diffPreview ? ["", "Diff preview:", context.diffPreview] : []),
        "[End local GitHub context]",
      ];

  return `${basePrompt}\n\n${lines.join("\n")}`;
}
