import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_KEY = "sk-or-test-not-a-real-key";

const env = vi.hoisted(() => ({
  OPENROUTER_API_KEY: "",
  LLM_MODEL: "",
  VISION_MODEL: undefined as string | undefined,
  DECISION_MODEL: undefined as string | undefined,
  POLICIES_DIR: "../docs/policies",
  CASE_TTL_MINUTES: 120,
}));

// Fake env only; `resolveModelIds` stays real so the factory's fallback is exercised.
vi.mock("@/server/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/env")>()),
  getEnv: () => env,
}));

import { decisionModel, resetModels, setModelsForTest, visionModel } from "@/server/ai/models";

/** Public fields of the OpenRouter chat model instance (see `OpenRouterChatLanguageModel` in the provider typings). */
type OpenRouterModelView = { provider: string; modelId: string; settings: Record<string, unknown> };
const view = (model: unknown) => model as OpenRouterModelView;

const EXPECTED_SETTINGS = { structuredOutputs: { strict: true }, usage: { include: true } };

describe("model factory", () => {
  beforeEach(() => {
    Object.assign(env, {
      OPENROUTER_API_KEY: FAKE_KEY,
      LLM_MODEL: "base/llm-model",
      VISION_MODEL: undefined,
      DECISION_MODEL: undefined,
    });
    resetModels();
  });

  afterEach(() => {
    resetModels();
  });

  it("falls back to LLM_MODEL for both models when VISION_MODEL and DECISION_MODEL are unset", () => {
    expect(view(visionModel()).modelId).toBe("base/llm-model");
    expect(view(decisionModel()).modelId).toBe("base/llm-model");
  });

  it("uses VISION_MODEL and DECISION_MODEL when they are set", () => {
    env.VISION_MODEL = "vision/model";
    env.DECISION_MODEL = "decision/model";
    expect(view(visionModel()).modelId).toBe("vision/model");
    expect(view(decisionModel()).modelId).toBe("decision/model");
  });

  it("creates OpenRouter models with strict structured outputs and usage accounting", () => {
    for (const model of [visionModel(), decisionModel()]) {
      expect(view(model).provider).toBe("openrouter");
      expect(view(model).settings).toMatchObject(EXPECTED_SETTINGS);
    }
  });

  it("sends the API key and the app name header (captured by a fake fetch, no network)", async () => {
    let captured: Headers | undefined;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = new Headers(init?.headers);
      throw new Error("stop after capture");
    });

    const model = visionModel();
    if (typeof model === "string" || model.specificationVersion !== "v4") throw new Error("expected a v4 model");
    await expect(
      model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] }),
    ).rejects.toThrow();

    expect(captured?.get("authorization")).toBe(`Bearer ${FAKE_KEY}`);
    expect(captured?.get("x-openrouter-title")).toBe("Hardware Service Decision Copilot");
  });

  it("returns injected test models and restores real ones after resetModels", () => {
    const vision = new MockLanguageModelV4({ modelId: "mock-vision" });
    const decision = new MockLanguageModelV4({ modelId: "mock-decision" });

    setModelsForTest({ vision, decision });
    expect(visionModel()).toBe(vision);
    expect(decisionModel()).toBe(decision);

    resetModels();
    expect(view(visionModel()).modelId).toBe("base/llm-model");
    expect(view(decisionModel()).provider).toBe("openrouter");
  });

  it("overrides only the model that was injected", () => {
    const decision = new MockLanguageModelV4({ modelId: "mock-decision" });
    setModelsForTest({ decision });
    expect(decisionModel()).toBe(decision);
    expect(view(visionModel()).provider).toBe("openrouter");
  });
});
