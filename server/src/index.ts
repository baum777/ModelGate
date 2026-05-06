import { createAppFromRuntimeConfig, createRuntimeConfig } from "./runtime/create-runtime-config.js";

async function main() {
  const runtimeConfig = createRuntimeConfig({
    loadDotEnv: true
  });
  const app = createAppFromRuntimeConfig(runtimeConfig, true);

  await app.listen({
    host: runtimeConfig.env.HOST,
    port: runtimeConfig.env.PORT
  });

  app.log.info({
    service: runtimeConfig.env.APP_NAME,
    host: runtimeConfig.env.HOST,
    port: runtimeConfig.env.PORT
  }, "server started");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
