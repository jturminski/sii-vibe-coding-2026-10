import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Real-model eval suite (ADR-003 §8). Calls OpenRouter; requires OPENROUTER_API_KEY.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
  },
  test: {
    name: "eval",
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    testTimeout: 180_000,
  },
});
