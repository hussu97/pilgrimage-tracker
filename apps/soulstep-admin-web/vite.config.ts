import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ ones) for the dev server config.
  // API_PROXY_TARGET is intentionally not VITE_-prefixed so it's never exposed
  // to the browser bundle — only used by the Vite dev server proxy.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5174,
      proxy: {
        "/api": {
          // API_PROXY_TARGET: set in .env.local to proxy /api calls to a remote
          // catalog API (e.g. prod) without exposing the URL to the browser.
          // Falls back to local catalog API for pure-local dev.
          target: env.API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
  };
});
