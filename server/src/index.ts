import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { createOpenRouterClient } from "./lib/openrouter.js";

async function main() {
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({ env }),
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
