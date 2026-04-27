import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "../src/components/MarkdownMessage.js";
import { LocaleProvider } from "../src/lib/localization.js";

function render(content: string) {
  return renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      { initialLocale: "en" },
      React.createElement(MarkdownMessage, { content })
    )
  );
}

test("markdown message renders headings, lists, blockquotes, and inline code", () => {
  const markup = render("# Title\n\n- item\n\n> quote\n\nuse `const x = 1`");

  assert.match(markup, /<h1>Title<\/h1>/);
  assert.match(markup, /<ul>/);
  assert.match(markup, /<blockquote>/);
  assert.match(markup, /chat-inline-code/);
});

test("markdown message renders fenced code with language label and copy button", () => {
  const markup = render("```ts\nconst value = 1;\n```");

  assert.match(markup, /chat-code-block/);
  assert.match(markup, /chat-code-language/);
  assert.match(markup, /Copy code/);
  assert.match(markup, /const value = 1;/);
});

test("markdown message does not execute or trust raw html", () => {
  const markup = render("<img src=x onerror=alert(1) />");

  assert.doesNotMatch(markup, /<img/i);
  assert.match(markup, /&lt;img/);
});

test("markdown message blocks unsafe javascript links", () => {
  const markup = render("[click](javascript:alert('xss'))");

  assert.doesNotMatch(markup, /href="javascript:/i);
  assert.match(markup, />click</);
});

test("markdown message renders markdown tables and diff fences safely", () => {
  const markup = render("| a | b |\n| - | - |\n| 1 | 2 |\n\n```diff\n- a\n+ b\n```");

  assert.match(markup, /<table>/);
  assert.match(markup, /<th>a<\/th>/);
  assert.match(markup, /chat-code-block-diff/);
});
