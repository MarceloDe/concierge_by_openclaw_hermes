import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Source lives in src/userapp; the production bundle is emitted into
// src/app/userapp so the existing Node server (serveStatic over src/app)
// serves it same-origin at /userapp with zero extra infra.
export default defineConfig({
  root: here,
  base: "/userapp/",
  plugins: [react()],
  build: {
    outDir: resolve(here, "../app/userapp"),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    // 4174 is in the facade CORS allowlist, so cross-origin facade calls work in dev.
    port: 4174,
    proxy: {
      "/api": "http://127.0.0.1:4226"
    }
  },
  preview: {
    port: 4174,
    proxy: {
      "/api": "http://127.0.0.1:4226"
    }
  }
});
