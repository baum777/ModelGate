import { useMemo } from "react";

type SyntaxCodeBlockProps = {
  code: string;
  language?: string;
};

type TokenTone = "plain" | "keyword" | "string" | "number" | "comment";

const KEYWORD_PATTERN = /^(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|class|new|try|catch|finally|throw|await|async|true|false|null|undefined|interface|type|extends|implements)$/;

function classifyToken(token: string): TokenTone {
  if (token.startsWith("//") || token.startsWith("#")) {
    return "comment";
  }

  if (/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)$/.test(token)) {
    return "string";
  }

  if (/^\d+(?:\.\d+)?$/.test(token)) {
    return "number";
  }

  if (KEYWORD_PATTERN.test(token)) {
    return "keyword";
  }

  return "plain";
}

function tokenizeLine(line: string) {
  const parts = line.split(/(\/\/.*|#.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w$]*\b)/g);

  return parts.map((part, index) => ({
    id: `${index}:${part}`,
    value: part,
    tone: classifyToken(part),
  }));
}

export function SyntaxCodeBlock({ code, language }: SyntaxCodeBlockProps) {
  const lines = useMemo(() => {
    const normalized = code.replace(/\n$/, "");
    return normalized.length > 0 ? normalized.split("\n") : [""];
  }, [code]);

  return (
    <pre className="mobile-chat-code-block" data-language={(language ?? "plain").toLowerCase()}>
      <code>
        {lines.map((line, lineIndex) => (
          <span className="mobile-chat-code-line" key={`${lineIndex}-${line}`}>
            {tokenizeLine(line).map((token) => (
              <span key={token.id} className={`mobile-chat-code-token mobile-chat-code-token-${token.tone}`}>
                {token.value}
              </span>
            ))}
            {line.length === 0 ? "\u00a0" : null}
          </span>
        ))}
      </code>
    </pre>
  );
}
