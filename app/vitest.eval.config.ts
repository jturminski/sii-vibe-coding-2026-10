import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Real-model eval suite (ADR-003 §8). Calls OpenRouter; requires OPENROUTER_API_KEY.
// `.env*` files from `app/` are loaded into the test env (empty prefix = all variables).
export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
  },
  test: {
    name: "eval",
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    testTimeout: 180_000,
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
