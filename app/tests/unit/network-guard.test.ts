import { describe, expect, it } from "vitest";

describe("network guard (TAC-03)", () => {
  it("blocks requests to OpenRouter", () => {
    expect(() => fetch("https://openrouter.ai/api/v1/models")).toThrow(/Network guard/);
  });
});
