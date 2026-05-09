import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEFERRED_PRELOAD_CHUNK_PREFIXES = [
  "vendor-syntax",
  "vendor-ui",
  "vendor-markdown",
];

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    modulePreload: {
      resolveDependencies: (_filename, dependencies) =>
        dependencies.filter(
          (dependency) => !DEFERRED_PRELOAD_CHUNK_PREFIXES.some((prefix) => dependency.includes(`${prefix}-`)),
        ),
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }

          if (id.includes("node_modules/react-router")) {
            return "vendor-router";
          }

          if (id.includes("node_modules/react-markdown") || id.includes("node_modules/remark-gfm")) {
            return "vendor-markdown";
          }

          if (id.includes("node_modules/highlight.js") || id.includes("node_modules/shiki")) {
            return "vendor-syntax";
          }

          if (id.includes("node_modules/framer-motion") || id.includes("node_modules/@radix-ui")) {
            return "vendor-ui";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
