import { readFileSync } from "node:fs";
import path from "node:path";
import type { UIMessageStreamWriter } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pl } from "@/lib/i18n/pl";
import { decisionSchema, imageReportSchema, type HscUIMessage } from "@/lib/schemas";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies" }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { composeFirstMessage } from "@/server/ai/compose-first-message";
import { resetModels, setModelsForTest } from "@/server/ai/models";
import { runSubmission } from "@/server/ai/run-submission";

/** Real captures from `tests/eval/capture-llm-fixtures.eval.ts`; `extracted.text` is the raw model text. */
interface LlmFixture {
  model: string;
  extracted: { text: string };
  response: { body: string };
}

function loadFixture(name: string): LlmFixture {
  const file = path.resolve(process.cwd(), "tests/fixtures/llm", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as LlmFixture;
}

/** A mock model answering with the captured text, finish reason and token usage. */
function mockModel(fixture: LlmFixture) {
  const body = JSON.parse(fixture.response.body) as {
    choices: { finish_reason: string }[];
    usage: { prompt_tokens: number; completion_tokens: number; completion_tokens_details: { reasoning_tokens: number } };
  };
  const { usage } = body;
  return new MockLanguageModelV4({
    provider: "openrouter",
    modelId: fixture.model,
    doGenerate: {
      content: [{ type: "text", text: fixture.extracted.text }],
      finishReason: { unified: "stop", raw: body.choices[0]?.finish_reason },
      usage: {
        inputTokens: { total: usage.prompt_tokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: {
          total: usage.completion_tokens,
          text: undefined,
          reasoning: usage.completion_tokens_details.reasoning_tokens,
        },
      },
      warnings: [],
    },
  });
}

/** Records every chunk written, standing in for the `createUIMessageStream` writer. */
function spyWriter() {
  const write = vi.fn<UIMessageStreamWriter<HscUIMessage>["write"]>();
  const writer: UIMessageStreamWriter<HscUIMessage> = { write, merge: vi.fn(), onError: undefined };
  return { writer, write };
}

const IMAGE_ANALYSIS = loadFixture("return-image-analysis");
const DECISION = loadFixture("return-decision");
const CASE_ID = "HSC-20261019-AB12";

/** D1 (docs/qa/final/report.md): the captured decision with status NEEDS_INFO and `questions` emptied. */
const NEEDS_INFO_NO_QUESTIONS: LlmFixture = {
  ...DECISION,
  extracted: {
    text: JSON.stringify({ ...(JSON.parse(DECISION.extracted.text) as object), status: "NEEDS_INFO", questions: [] }),
  },
};

const form = {
  caseType: "RETURN" as const,
  category: "SMARTPHONE" as const,
  modelName: "Samsung Galaxy A54",
  purchaseDate: "2026-10-16",
  reason: "Urządzenie nie spełnia moich oczekiwań.",
};

function input(writer: UIMessageStreamWriter<HscUIMessage>) {
  return {
    caseId: CASE_ID,
    form,
    jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    now: new Date("2026-10-19T07:13:00Z"),
    signal: new AbortController().signal,
    writer,
  };
}

describe("runSubmission", () => {
  beforeEach(() => {
    resetModels();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetModels();
    vi.restoreAllMocks();
  });

  it("writes transient analyzing then deciding stage parts", async () => {
    setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(DECISION) });
    const { writer, write } = spyWriter();
    await runSubmission(input(writer));
    expect(write.mock.calls.map(([part]) => part)).toEqual([
      { type: "data-stage", data: { stage: "analyzing" }, transient: true },
      { type: "data-stage", data: { stage: "deciding" }, transient: true },
    ]);
  });

  it("writes analyzing before the vision call and deciding before the decision call", async () => {
    const vision = mockModel(IMAGE_ANALYSIS);
    const decision = mockModel(DECISION);
    setModelsForTest({ vision, decision });
    const { writer, write } = spyWriter();
    const callsAtWrite: [number, number][] = [];
    write.mockImplementation(() => {
      callsAtWrite.push([vision.doGenerateCalls.length, decision.doGenerateCalls.length]);
    });
    await runSubmission(input(writer));
    expect(callsAtWrite).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it("returns the report, the decision and the composed first message", async () => {
    setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(DECISION) });
    const { writer } = spyWriter();
    const result = await runSubmission(input(writer));
    const expectedDecision = decisionSchema.parse(JSON.parse(DECISION.extracted.text));
    expect(result).toEqual({
      report: imageReportSchema.parse(JSON.parse(IMAGE_ANALYSIS.extracted.text)),
      decision: expectedDecision,
      firstMessageText: composeFirstMessage(CASE_ID, expectedDecision),
    });
  });

  describe("guard: NEEDS_INFO without questions (PRD AC-20, ADR-003 §8)", () => {
    it("returns MANUAL_REVIEW with the model's refs and the pl fallback summary", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(NEEDS_INFO_NO_QUESTIONS) });
      const { writer } = spyWriter();
      const { decision } = await runSubmission(input(writer));
      const modelDecision = decisionSchema.parse(JSON.parse(NEEDS_INFO_NO_QUESTIONS.extracted.text));
      expect(decision).toEqual({
        ...modelDecision,
        status: "MANUAL_REVIEW",
        summary: pl.firstMessage.needsInfoFallback,
        questions: [],
      });
    });

    it("composes the first message from the downgraded decision, without a questions section", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(NEEDS_INFO_NO_QUESTIONS) });
      const { writer } = spyWriter();
      const { decision, firstMessageText } = await runSubmission(input(writer));
      expect(firstMessageText).toBe(composeFirstMessage(CASE_ID, decision));
      expect(firstMessageText).not.toContain(pl.firstMessage.headings.questions);
      expect(firstMessageText).toContain(pl.firstMessage.needsInfoFallback);
    });

    it("logs the downgrade with console.warn", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(NEEDS_INFO_NO_QUESTIONS) });
      const { writer } = spyWriter();
      await runSubmission(input(writer));
      expect(warn).toHaveBeenCalledWith({ caseId: CASE_ID, step: "decide", downgradedFrom: "NEEDS_INFO" });
    });

    it("does not warn when the decision needs no downgrade", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(DECISION) });
      const { writer } = spyWriter();
      await runSubmission(input(writer));
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("propagates a vision error unchanged and never writes deciding", async () => {
    const failure = new Error("vision provider down");
    const vision = new MockLanguageModelV4({
      doGenerate: () => {
        throw failure;
      },
    });
    const decision = mockModel(DECISION);
    setModelsForTest({ vision, decision });
    const { writer, write } = spyWriter();
    await expect(runSubmission(input(writer))).rejects.toBe(failure);
    expect(write.mock.calls.map(([part]) => part)).toEqual([
      { type: "data-stage", data: { stage: "analyzing" }, transient: true },
    ]);
    expect(decision.doGenerateCalls).toHaveLength(0);
  });
});
