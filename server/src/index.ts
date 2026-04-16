import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { createGitHubConfig } from "./lib/github-env.js";
import { createMatrixConfig } from "./lib/matrix-env.js";
import { loadLlmRouterPolicy } from "./lib/llm-router.js";
import { createOpenRouterClient } from "./lib/openrouter.js";

async function main() {
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({ env }),
    githubConfig: createGitHubConfig(env),
    matrixConfig: createMatrixConfig(process.env),
    llmRouterPolicy: loadLlmRouterPolicy(process.env),
    logger: true
  });

  await app.listen({
    host: env.HOST,
    port: env.PORT
  });

  app.log.info({
    service: env.APP_NAME,
    host: env.HOST,
    port: env.PORT
  }, "server started");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
