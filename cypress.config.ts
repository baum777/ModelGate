import { defineConfig } from "cypress";

const baseUrl = process.env.CYPRESS_BASE_URL?.trim() || "http://127.0.0.1:5173";

export default defineConfig({
  viewportWidth: 1280,
  viewportHeight: 720,
  video: false,
  e2e: {
    baseUrl,
    supportFile: false,
    specPattern: "cypress/e2e/**/*.cy.{ts,tsx,js,jsx}",
  },
});
