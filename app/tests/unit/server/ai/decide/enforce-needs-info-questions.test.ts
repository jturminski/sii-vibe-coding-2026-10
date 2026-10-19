import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pl } from "@/lib/i18n/pl";
import { decisionSchema, type Decision } from "@/lib/schemas";

vi.mock("@/server/env", () => ({ getEnv: () => ({ POLICIES_DIR: "../docs/policies" }) }));

import { enforceNeedsInfoQuestions } from "@/server/ai/decide";

/** Real captured decision (`tests/fixtures/llm/return-decision.json`, MANUAL_REVIEW, `questions: []`). */
const captured: Decision = decisionSchema.parse(
  JSON.parse(
    (
      JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/llm/return-decision.json"), "utf8")) as {
        extracted: { text: string };
      }
    ).extracted.text,
  ),
);

/** D1 shape from the final regression: NEEDS_INFO with an empty question list. */
const needsInfoNoQuestions: Decision = { ...captured, status: "NEEDS_INFO", questions: [] };

describe("enforceNeedsInfoQuestions (PRD AC-20, ADR-003 §8)", () => {
  it("downgrades NEEDS_INFO without questions to MANUAL_REVIEW with the pl fallback summary", () => {
    expect(enforceNeedsInfoQuestions(needsInfoNoQuestions)).toEqual({
      status: "MANUAL_REVIEW",
      summary: pl.firstMessage.needsInfoFallback,
      photoFindings: captured.photoFindings,
      appliedRules: captured.appliedRules,
      nextSteps: captured.nextSteps,
      questions: [],
    });
  });

  it("keeps the model's applied rules exactly and never invents refs", () => {
    const result = enforceNeedsInfoQuestions(needsInfoNoQuestions);
    expect(result.appliedRules.map((r) => r.ref)).toEqual(captured.appliedRules.map((r) => r.ref));
  });

  it("does not mutate its input", () => {
    const input = structuredClone(needsInfoNoQuestions);
    enforceNeedsInfoQuestions(input);
    expect(input).toEqual(needsInfoNoQuestions);
  });

  it("passes NEEDS_INFO with at least one question through unchanged", () => {
    const withQuestion: Decision = { ...needsInfoNoQuestions, questions: ["Czy urządzenie się włącza?"] };
    expect(enforceNeedsInfoQuestions(withQuestion)).toEqual(withQuestion);
  });

  it.each(["ACCEPTED", "REJECTED", "MANUAL_REVIEW"] as const)("passes %s through unchanged", (status) => {
    const decision: Decision = { ...captured, status };
    expect(enforceNeedsInfoQuestions(decision)).toEqual(decision);
  });
});
