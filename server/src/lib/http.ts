import type { ServerResponse } from "node:http";

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes("*")) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function buildCorsHeaders(origin: string | undefined, allowedOrigins: readonly string[]) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600"
  };

  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

export function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\n` +
    `data: ${JSON.stringify(data)}\n\n`;
}

export function writeSseEvent(response: ServerResponse, event: string, data: unknown) {
  response.write(formatSseEvent(event, data));
}
