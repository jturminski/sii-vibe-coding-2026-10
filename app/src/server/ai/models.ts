import "server-only";
import { createOpenRouter, type OpenRouterChatSettings, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getEnv, resolveModelIds } from "@/server/env";

/** A provider language model object (AI SDK v4 spec); `MockLanguageModelV4` from `ai/test` fits too. */
export type AppLanguageModel = Extract<LanguageModel, { specificationVersion: "v4" }>;

const APP_NAME = "Hardware Service Decision Copilot";

/** Setting names verified in `@openrouter/ai-sdk-provider/dist/index.d.ts` (`OpenRouterSharedSettings`). */
const MODEL_SETTINGS: OpenRouterChatSettings = {
  structuredOutputs: { strict: true },
  usage: { include: true },
};

let provider: OpenRouterProvider | undefined;
let overrides: { vision?: AppLanguageModel; decision?: AppLanguageModel } = {};

function getProvider(): OpenRouterProvider {
  provider ??= createOpenRouter({ apiKey: getEnv().OPENROUTER_API_KEY, appName: APP_NAME });
  return provider;
}

/** Multimodal model for image analysis: `VISION_MODEL ?? LLM_MODEL`. */
export function visionModel(): AppLanguageModel {
  return overrides.vision ?? getProvider().chat(resolveModelIds(getEnv()).vision, MODEL_SETTINGS);
}

/** Reasoning model for decisions and chat: `DECISION_MODEL ?? LLM_MODEL`. */
export function decisionModel(): AppLanguageModel {
  return overrides.decision ?? getProvider().chat(resolveModelIds(getEnv()).decision, MODEL_SETTINGS);
}

/** Test seam: inject mock models (e.g. `MockLanguageModelV4`) instead of mocking modules. */
export function setModelsForTest(models: { vision?: AppLanguageModel; decision?: AppLanguageModel }): void {
  overrides = { ...overrides, ...models };
}

/** Drop injected models and the cached provider, so the next call reads the env again. */
export function resetModels(): void {
  overrides = {};
  provider = undefined;
}
