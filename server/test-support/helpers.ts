import type { AppEnv } from "../src/lib/env.js";
import type { OpenRouterClient } from "../src/lib/openrouter.js";

export function createTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    PORT: overrides.PORT ?? 8787,
    HOST: overrides.HOST ?? "127.0.0.1",
    OPENROUTER_API_KEY: overrides.OPENROUTER_API_KEY ?? "test-openrouter-key",
    OPENROUTER_MODEL: overrides.OPENROUTER_MODEL ?? "openrouter/auto",
    OPENROUTER_MODELS: overrides.OPENROUTER_MODELS ?? ["openrouter/auto", "anthropic/claude-3.5-sonnet"],
    APP_NAME: overrides.APP_NAME ?? "modelgate-test",
    DEFAULT_SYSTEM_PROMPT: overrides.DEFAULT_SYSTEM_PROMPT ?? "Backend-owned system prompt.",
    CORS_ORIGINS: overrides.CORS_ORIGINS ?? ["http://localhost:5173"]
  };
}

export function createMockOpenRouterClient(overrides: Partial<OpenRouterClient> = {}): OpenRouterClient {
  return {
    createChatCompletion: overrides.createChatCompletion ?? (async () => ({
      model: "openrouter/auto",
      text: "stub"
    })),
    relayChatCompletionStream: overrides.relayChatCompletionStream ?? (async (_request, options) => {
      options.onToken("stub");
      return {
        model: "openrouter/auto",
        text: "stub"
      };
    })
  };
}
