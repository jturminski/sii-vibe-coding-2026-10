import { describe, expect, it } from "vitest";
import { parseEnv, resolveModelIds } from "@/server/env";

const base = { OPENROUTER_API_KEY: "sk-or-test", LLM_MODEL: "openai/gpt-6-luna" };

describe("parseEnv", () => {
  it("accepts the required variables and applies defaults", () => {
    const env = parseEnv(base);
    expect(env.OPENROUTER_API_KEY).toBe("sk-or-test");
    expect(env.POLICIES_DIR).toBe("../docs/policies");
    expect(env.CASE_TTL_MINUTES).toBe(120);
  });

  it("throws naming the missing OPENROUTER_API_KEY", () => {
    expect(() => parseEnv({ LLM_MODEL: "x" })).toThrow(/OPENROUTER_API_KEY/);
  });

  it("treats an empty LLM_MODEL as missing", () => {
    expect(() => parseEnv({ ...base, LLM_MODEL: "" })).toThrow(/LLM_MODEL/);
  });

  it("treats empty optional overrides as unset", () => {
    const env = parseEnv({ ...base, VISION_MODEL: "", DECISION_MODEL: "" });
    expect(env.VISION_MODEL).toBeUndefined();
    expect(env.DECISION_MODEL).toBeUndefined();
  });

  it("rejects a non-numeric CASE_TTL_MINUTES", () => {
    expect(() => parseEnv({ ...base, CASE_TTL_MINUTES: "abc" })).toThrow(/CASE_TTL_MINUTES/);
  });
});

describe("resolveModelIds", () => {
  it("falls back to LLM_MODEL for both steps", () => {
    expect(resolveModelIds(parseEnv(base))).toEqual({
      vision: "openai/gpt-6-luna",
      decision: "openai/gpt-6-luna",
    });
  });

  it("uses only the overrides that are set", () => {
    const env = parseEnv({ ...base, VISION_MODEL: "google/gemini-3.8-flash" });
    expect(resolveModelIds(env)).toEqual({
      vision: "google/gemini-3.8-flash",
      decision: "openai/gpt-6-luna",
    });
  });
});
